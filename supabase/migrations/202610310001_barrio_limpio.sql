-- Barrio Limpio: ejecutar UNA VEZ en SQL Editor de un proyecto Supabase nuevo.
-- No borra datos, no crea cuentas ni asigna responsables automáticamente.
begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Vecino',
  role text not null default 'vecino' check (role in ('vecino','responsable')),
  created_at timestamptz not null default now()
);
create table public.reference_points (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  reference text not null,
  active boolean not null default true
);
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id),
  reference_point_id uuid not null references public.reference_points(id),
  location_text text not null check (char_length(location_text) between 5 and 160),
  description text not null check (char_length(description) between 10 and 1000),
  problem_type text not null check (problem_type in ('basura','contenedor','desmonte')),
  status text not null default 'pendiente' check (status in ('pendiente','en_proceso','solucionado')),
  assigned_to uuid references public.profiles(id),
  distinct_reason text check (distinct_reason is null or char_length(distinct_reason) between 10 and 300),
  resolution_note text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'pendiente' and assigned_to is null and resolved_at is null)
    or (status = 'en_proceso' and assigned_to is not null and resolved_at is null)
    or (status = 'solucionado' and assigned_to is not null and resolved_at is not null
      and char_length(resolution_note) between 10 and 1000))
);
create index incidents_match_idx on public.incidents(reference_point_id,problem_type,status);
create index incidents_date_idx on public.incidents(created_at desc,id desc);
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id),
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(incident_id,user_id)
);
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id),
  contribution_id uuid references public.contributions(id),
  uploaded_by uuid not null references public.profiles(id),
  kind text not null check (kind in ('reporte','solucion')),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 2097152),
  created_at timestamptz not null default now(),
  check ((kind = 'reporte' and contribution_id is not null) or (kind = 'solucion' and contribution_id is null))
);
create unique index evidence_one_report on public.evidence(contribution_id) where kind = 'reporte';
create unique index evidence_one_solution on public.evidence(incident_id) where kind = 'solucion';
create table public.status_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id),
  actor_id uuid not null references public.profiles(id),
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  incident_id uuid not null references public.incidents(id),
  status_event_id uuid not null references public.status_events(id),
  event_type text not null check (event_type in ('nuevo','en_proceso','solucionado')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(recipient_id,status_event_id)
);
create index notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create table public.command_receipts (
  actor_id uuid not null references public.profiles(id),
  client_request_id uuid not null,
  operation text not null,
  payload_hash text not null,
  result_id uuid not null references public.incidents(id),
  created_at timestamptz not null default now(),
  primary key(actor_id,client_request_id)
);

-- Ignorar siempre roles enviados en user_metadata durante el alta.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name) values(new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Vecino'),80));
  return new;
end; $$;
create trigger barrio_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

-- Helpers privados: solo las funciones del propietario pueden invocarlos.
create function public.barrio_actor() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid) then
    raise exception 'Debes iniciar sesión con una cuenta del piloto.';
  end if;
  return v_uid;
end; $$;

create function public.barrio_receipt(p_key uuid,p_op text,p_payload text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.barrio_actor(); r public.command_receipts;
begin
  if p_key is null then raise exception 'Falta el identificador de la operación.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || p_key::text,0));
  select * into r from public.command_receipts where actor_id=v_uid and client_request_id=p_key;
  if found then
    if r.operation <> p_op or r.payload_hash <> md5(p_payload) then
      raise exception 'La petición ya se utilizó con otro contenido.';
    end if;
    return r.result_id;
  end if;
  return null;
end; $$;

create function public.barrio_save_receipt(p_key uuid,p_op text,p_payload text,p_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.command_receipts(actor_id,client_request_id,operation,payload_hash,result_id)
  values(auth.uid(),p_key,p_op,md5(p_payload),p_id);
$$;

create function public.barrio_event(p_id uuid,p_from text,p_to text,p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  insert into public.status_events(incident_id,actor_id,from_status,to_status,note)
  values(p_id,auth.uid(),p_from,p_to,p_note) returning id into v_event;
  if p_from is null then
    insert into public.notifications(recipient_id,incident_id,status_event_id,event_type)
    select id,p_id,v_event,'nuevo' from public.profiles where role='responsable';
  else
    insert into public.notifications(recipient_id,incident_id,status_event_id,event_type)
    select user_id,p_id,v_event,p_to from public.contributions where incident_id=p_id;
  end if;
end; $$;

-- Lectura sin exponer identidad de vecinos o responsables a otras cuentas.
create function public.list_incidents(p_status text default null,p_type text default null,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.barrio_actor();
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc) from (
    select i.id,i.location_text,i.description,i.problem_type,i.status,i.version,i.created_at,i.updated_at,
      p.name as point_name,i.reference_point_id,
      (select count(*)::integer from public.contributions c where c.incident_id=i.id) as participants,
      exists(select 1 from public.contributions c where c.incident_id=i.id and c.user_id=auth.uid()) as has_contributed,
      i.assigned_to=auth.uid() as assigned_to_me,
      (select e.object_path from public.evidence e where e.incident_id=i.id order by e.created_at limit 1) as photo_path
    from public.incidents i join public.reference_points p on p.id=i.reference_point_id
    where (p_status is null or i.status=p_status) and (p_type is null or i.problem_type=p_type)
    order by i.created_at desc,i.id desc limit 20 offset greatest(0,least(p_offset,100000))
  ) t),'[]'::jsonb);
end; $$;

create function public.get_incident(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform public.barrio_actor();
  select jsonb_build_object('id',i.id,'location_text',i.location_text,'description',i.description,
    'problem_type',i.problem_type,'status',i.status,'version',i.version,'created_at',i.created_at,
    'updated_at',i.updated_at,'resolution_note',i.resolution_note,'resolved_at',i.resolved_at,
    'point_name',p.name,'reference_point_id',i.reference_point_id,'distinct_reason',i.distinct_reason,
    'participants',(select count(*) from public.contributions c where c.incident_id=i.id),
    'has_contributed',exists(select 1 from public.contributions c where c.incident_id=i.id and c.user_id=auth.uid()),
    'has_my_photo',exists(select 1 from public.evidence e where e.incident_id=i.id and e.kind='reporte' and e.uploaded_by=auth.uid()),
    'assigned_to_me',i.assigned_to=auth.uid(),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'object_path',e.object_path)
      order by e.created_at) from public.evidence e where e.incident_id=i.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'from_status',s.from_status,
      'to_status',s.to_status,'note',s.note,'created_at',s.created_at,'actor_role',a.role) order by s.created_at)
      from public.status_events s join public.profiles a on a.id=s.actor_id where s.incident_id=i.id),'[]'::jsonb))
  into v_result from public.incidents i join public.reference_points p on p.id=i.reference_point_id where i.id=p_id;
  if v_result is null then raise exception 'No se encontró la incidencia.'; end if;
  return v_result;
end; $$;

create function public.find_matches(p_point uuid,p_type text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.barrio_actor();
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'location_text',location_text,
    'description',description,'status',status) order by created_at desc) from public.incidents
    where reference_point_id=p_point and problem_type=p_type and status in ('pendiente','en_proceso')),'[]'::jsonb);
end; $$;

create function public.create_incident(p_key uuid,p_point uuid,p_location text,p_description text,
  p_type text,p_seen uuid[] default '{}',p_distinct_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.barrio_actor(); v_id uuid; v_payload text;
begin
  v_payload := jsonb_build_array(p_point,trim(p_location),trim(p_description),p_type,p_distinct_reason)::text;
  v_id := public.barrio_receipt(p_key,'create',v_payload);
  if v_id is not null then return jsonb_build_object('id',v_id,'result','created'); end if;
  if not exists(select 1 from public.reference_points where id=p_point and active) then
    raise exception 'Selecciona un punto de referencia activo.';
  end if;
  if p_location is null or p_description is null or p_type is null then raise exception 'Completa los campos obligatorios.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_point::text || p_type,1));
  if exists(select 1 from public.incidents where reference_point_id=p_point and problem_type=p_type
      and status in ('pendiente','en_proceso')) then
    if p_distinct_reason is null or char_length(trim(p_distinct_reason)) not between 10 and 300
      or exists(select 1 from public.incidents where reference_point_id=p_point and problem_type=p_type
        and status in ('pendiente','en_proceso') and not(id=any(coalesce(p_seen,'{}'::uuid[])))) then
      return jsonb_build_object('result','matches','matches',public.find_matches(p_point,p_type));
    end if;
  end if;
  insert into public.incidents(created_by,reference_point_id,location_text,description,problem_type,distinct_reason)
  values(v_uid,p_point,trim(p_location),trim(p_description),p_type,nullif(trim(p_distinct_reason),'')) returning id into v_id;
  insert into public.contributions(incident_id,user_id) values(v_id,v_uid);
  perform public.barrio_event(v_id,null,'pendiente',null);
  perform public.barrio_save_receipt(p_key,'create',v_payload,v_id);
  return jsonb_build_object('id',v_id,'result','created');
end; $$;

create function public.confirm_incident(p_id uuid,p_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.barrio_actor(); v_id uuid; v_status text;
begin
  v_id := public.barrio_receipt(p_key,'confirm',p_id::text);
  if v_id is not null then return v_id; end if;
  select status into v_status from public.incidents where id=p_id for update;
  if v_status is null or v_status='solucionado' then raise exception 'La incidencia ya no está abierta.'; end if;
  insert into public.contributions(incident_id,user_id) values(p_id,v_uid) on conflict do nothing;
  perform public.barrio_save_receipt(p_key,'confirm',p_id::text,p_id);
  return p_id;
end; $$;

create function public.accept_incident(p_id uuid,p_version integer,p_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.barrio_actor(); v_id uuid; v_payload text := jsonb_build_array(p_id,p_version)::text;
begin
  v_id := public.barrio_receipt(p_key,'accept',v_payload);
  if v_id is not null then return v_id; end if;
  if not exists(select 1 from public.profiles where id=v_uid and role='responsable') then raise exception 'Solo el responsable puede aceptar casos.'; end if;
  update public.incidents set status='en_proceso',assigned_to=v_uid,version=version+1,updated_at=now()
  where id=p_id and status='pendiente' and version=p_version returning id into v_id;
  if v_id is null then raise exception 'El caso cambió. Actualiza para ver quién lo atiende.'; end if;
  perform public.barrio_event(p_id,'pendiente','en_proceso',null);
  perform public.barrio_save_receipt(p_key,'accept',v_payload,p_id);
  return p_id;
end; $$;

-- Storage: path = usuario/incidencia/reporte|solucion/uuid.jpg
create function public.can_upload_evidence(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_path,'/',1)=auth.uid()::text
    and split_part(p_path,'/',4) ~ '^[0-9a-f-]{36}\.(jpg|png)$'
    and array_length(string_to_array(p_path,'/'),1)=4
    and exists(select 1 from public.incidents i where i.id::text=split_part(p_path,'/',2)
      and ((split_part(p_path,'/',3)='reporte' and i.status<>'solucionado'
        and exists(select 1 from public.contributions c where c.incident_id=i.id and c.user_id=auth.uid()))
      or (split_part(p_path,'/',3)='solucion' and i.status='en_proceso' and i.assigned_to=auth.uid()
        and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='responsable'))));
$$;
create function public.can_read_evidence(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id=auth.uid()) and
    (split_part(p_path,'/',1)=auth.uid()::text or exists(select 1 from public.evidence where object_path=p_path));
$$;
create function public.can_delete_unattached(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_path,'/',1)=auth.uid()::text
    and not exists(select 1 from public.evidence where object_path=p_path);
$$;

create function public.barrio_attach(p_id uuid,p_path text,p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.barrio_actor(); v_contribution uuid; v_meta jsonb;
begin
  if p_kind not in ('reporte','solucion') or split_part(p_path,'/',3)<>p_kind
    or split_part(p_path,'/',2)<>p_id::text or not public.can_upload_evidence(p_path) then
    raise exception 'No tienes permiso para adjuntar esa evidencia.';
  end if;
  select metadata into v_meta from storage.objects where bucket_id='evidencias' and name=p_path for update;
  if v_meta is null or (v_meta->>'size')::bigint not between 1 and 2097152
    or v_meta->>'mimetype' not in ('image/jpeg','image/png') then raise exception 'La imagen no existe o no cumple el formato o tamaño.'; end if;
  if exists(select 1 from public.evidence where object_path=p_path and incident_id=p_id and uploaded_by=v_uid) then return; end if;
  if p_kind='reporte' then
    select id into v_contribution from public.contributions where incident_id=p_id and user_id=v_uid;
  end if;
  insert into public.evidence(incident_id,contribution_id,uploaded_by,kind,object_path,mime_type,byte_size)
  values(p_id,v_contribution,v_uid,p_kind,p_path,v_meta->>'mimetype',(v_meta->>'size')::bigint);
end; $$;

create function public.attach_report_photo(p_id uuid,p_path text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.incidents where id=p_id for update;
  perform public.barrio_attach(p_id,p_path,'reporte');
end; $$;

create function public.resolve_incident(p_id uuid,p_version integer,p_note text,p_path text,p_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.barrio_actor(); v_id uuid; v_row public.incidents;
  v_payload text := jsonb_build_array(p_id,p_version,trim(p_note),p_path)::text;
begin
  v_id := public.barrio_receipt(p_key,'resolve',v_payload);
  if v_id is not null then return v_id; end if;
  select * into v_row from public.incidents where id=p_id for update;
  if v_row.id is null or v_row.status<>'en_proceso' or v_row.assigned_to<>v_uid or v_row.version<>p_version
    or not exists(select 1 from public.profiles where id=v_uid and role='responsable') then
    raise exception 'No puedes cerrar este caso. Actualiza su estado.';
  end if;
  if p_note is null or char_length(trim(p_note)) not between 10 and 1000 or p_path is null then raise exception 'Agrega una observación y fotografía de solución.'; end if;
  perform public.barrio_attach(p_id,p_path,'solucion');
  update public.incidents set status='solucionado',resolution_note=trim(p_note),resolved_at=now(),updated_at=now(),version=version+1 where id=p_id;
  perform public.barrio_event(p_id,'en_proceso','solucionado',trim(p_note));
  perform public.barrio_save_receipt(p_key,'resolve',v_payload,p_id);
  return p_id;
end; $$;

create function public.read_notification(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at=coalesce(read_at,now()) where id=p_id and recipient_id=auth.uid();
$$;

-- Cerrar accesos por defecto antes de conceder los mínimos.
alter table public.profiles enable row level security;
alter table public.reference_points enable row level security;
alter table public.incidents enable row level security;
alter table public.contributions enable row level security;
alter table public.evidence enable row level security;
alter table public.status_events enable row level security;
alter table public.notifications enable row level security;
alter table public.command_receipts enable row level security;
revoke all on public.profiles,public.reference_points,public.incidents,public.contributions,
  public.evidence,public.status_events,public.notifications,public.command_receipts from anon,authenticated;
grant select on public.profiles,public.reference_points,public.notifications to authenticated;
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
create policy points_pilot on public.reference_points for select to authenticated using(true);
create policy notifications_self on public.notifications for select to authenticated using(recipient_id=auth.uid());

revoke all on function public.handle_new_user(),public.barrio_actor(),
  public.barrio_receipt(uuid,text,text),public.barrio_save_receipt(uuid,text,text,uuid),
  public.barrio_event(uuid,text,text,text),public.barrio_attach(uuid,text,text) from public,anon,authenticated;

revoke all on function public.list_incidents(text,text,integer),public.get_incident(uuid),
  public.find_matches(uuid,text),public.create_incident(uuid,uuid,text,text,text,uuid[],text),
  public.confirm_incident(uuid,uuid),public.accept_incident(uuid,integer,uuid),
  public.attach_report_photo(uuid,text),public.resolve_incident(uuid,integer,text,text,uuid),
  public.read_notification(uuid),public.can_upload_evidence(text),public.can_read_evidence(text),
  public.can_delete_unattached(text) from public,anon,authenticated;
grant execute on function public.list_incidents(text,text,integer),public.get_incident(uuid),
  public.find_matches(uuid,text),public.create_incident(uuid,uuid,text,text,text,uuid[],text),
  public.confirm_incident(uuid,uuid),public.accept_incident(uuid,integer,uuid),
  public.attach_report_photo(uuid,text),public.resolve_incident(uuid,integer,text,text,uuid),
  public.read_notification(uuid),public.can_upload_evidence(text),public.can_read_evidence(text),
  public.can_delete_unattached(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('evidencias','evidencias',false,2097152,array['image/jpeg','image/png']);
create policy barrio_upload on storage.objects for insert to authenticated
  with check(bucket_id='evidencias' and public.can_upload_evidence(name));
create policy barrio_read on storage.objects for select to authenticated
  using(bucket_id='evidencias' and public.can_read_evidence(name));
create policy barrio_delete_unattached on storage.objects for delete to authenticated
  using(bucket_id='evidencias' and public.can_delete_unattached(name));

alter publication supabase_realtime add table public.notifications;

insert into public.reference_points(name,reference) values
  ('DEMO · Parque del barrio','Datos ficticios para exposición: entrada principal del parque.'),
  ('DEMO · Mercado vecinal','Datos ficticios para exposición: esquina del mercado.'),
  ('DEMO · Colegio','Datos ficticios para exposición: exterior del colegio.');

commit;
