-- Ejecutar DESPUÉS de 202610310001. Conserva cuentas, reportes, fotos y estados.
-- Coordenadas del problema, nunca seguimiento continuo de personas.
begin;

alter table public.incidents
  add column latitude double precision,
  add column longitude double precision,
  add column district text,
  add column accuracy_m double precision,
  add column location_source text,
  add column merged_into_id uuid references public.incidents(id),
  add column previous_incident_id uuid references public.incidents(id),
  add constraint incidents_coordinates check (
    (latitude is null and longitude is null and district is null and location_source is null)
    or (latitude is not null and longitude is not null and district is not null and location_source is not null
      and latitude between -90 and 90 and longitude between -180 and 180
      and char_length(trim(district)) between 3 and 120
      and location_source in ('gps','mapa','manual'))),
  add constraint incidents_accuracy check (accuracy_m is null or accuracy_m between 0 and 100000);
create index incidents_latitude_idx on public.incidents(latitude) where latitude is not null;
create index incidents_merged_idx on public.incidents(merged_into_id) where merged_into_id is not null;
alter table public.notifications drop constraint notifications_event_type_check;
alter table public.notifications add constraint notifications_event_type_check check(event_type in ('nuevo','en_proceso','solucionado','fusionado'));
create table public.location_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id),
  actor_id uuid not null references public.profiles(id),
  latitude double precision not null,
  longitude double precision not null,
  district text not null,
  created_at timestamptz not null default now()
);
alter table public.location_events enable row level security;
revoke all on public.location_events from anon,authenticated;

-- Punto interno para conservar las FK del modelo anterior; no aparece en el selector.
insert into public.reference_points(id,name,reference,active)
values('00000000-0000-4000-8000-000000000001','Ubicación geográfica','Ubicación confirmada por el vecino.',false);

create function public.barrio_district(p_text text) returns text
language sql immutable set search_path = '' as $$
  select translate(lower(regexp_replace(trim(p_text),'\s+',' ','g')),'áéíóúüñ','aeiouun');
$$;
create index incidents_district_idx on public.incidents(public.barrio_district(district));

-- Haversine: distancia esférica en metros. No requiere APIs ni extensiones de pago.
create function public.barrio_distance_m(a_lat double precision,a_lon double precision,b_lat double precision,b_lon double precision)
returns double precision language sql immutable strict set search_path = '' as $$
  select 12742017.6 * asin(sqrt(least(1.0,greatest(0.0,
    power(sin(radians(b_lat-a_lat)/2),2)
    + cos(radians(a_lat))*cos(radians(b_lat))*power(sin(radians(b_lon-a_lon)/2),2)))));
$$;
create function public.barrio_validate_location(p_lat double precision,p_lon double precision,p_district text,p_source text,p_accuracy double precision)
returns void language plpgsql set search_path = '' as $$
begin
  if p_lat is null or p_lon is null or not(p_lat between -90 and 90) or not(p_lon between -180 and 180) then
    raise exception 'Selecciona coordenadas válidas para la basura.';
  end if;
  if p_district is null or char_length(trim(p_district)) not between 3 and 120 then
    raise exception 'Confirma el distrito y provincia (3 a 120 caracteres).';
  end if;
  if p_source is null or p_source not in ('gps','mapa','manual') or (p_accuracy is not null and not(p_accuracy between 0 and 100000)) then
    raise exception 'La información de ubicación no es válida.';
  end if;
end; $$;

create function public.nearby_matches(p_lat double precision,p_lon double precision,p_type text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.barrio_actor();
  perform public.barrio_validate_location(p_lat,p_lon,'Consulta','manual',null);
  -- También muestra otros tipos: vecinos distintos pueden clasificar diferente el mismo montón.
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.distance_m,t.id) from (
    select i.id,i.location_text,i.description,i.problem_type,i.status,i.latitude,i.longitude,i.district,
      public.barrio_distance_m(p_lat,p_lon,i.latitude,i.longitude) as distance_m,
      (select e.object_path from public.evidence e where e.incident_id=i.id order by e.created_at limit 1) as photo_path,
      i.problem_type=p_type as same_type
    from public.incidents i where i.merged_into_id is null and i.status in ('pendiente','en_proceso') and i.latitude is not null
      and i.latitude between p_lat-30.0/110000 and p_lat+30.0/110000
      and public.barrio_distance_m(p_lat,p_lon,i.latitude,i.longitude)<=30
  ) t),'[]'::jsonb);
end; $$;

create function public.create_geo_incident(p_key uuid,p_lat double precision,p_lon double precision,
  p_district text,p_location text,p_description text,p_type text,p_source text,p_accuracy double precision default null,
  p_seen uuid[] default '{}',p_distinct_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=public.barrio_actor(); v_id uuid; v_payload text; v_matches jsonb;
begin
  perform public.barrio_validate_location(p_lat,p_lon,p_district,p_source,p_accuracy);
  v_payload:=jsonb_build_array(p_lat,p_lon,trim(p_district),trim(p_location),trim(p_description),p_type,p_source,p_accuracy,p_distinct_reason)::text;
  v_id:=public.barrio_receipt(p_key,'create_geo',v_payload);
  if v_id is not null then return jsonb_build_object('id',v_id,'result','created'); end if;
  if p_location is null or p_description is null or p_type is null then raise exception 'Completa los campos obligatorios.'; end if;
  -- Serialización breve del piloto: evita carreras entre coordenadas próximas de distintas celdas.
  perform pg_advisory_xact_lock(hashtextextended('barrio-geo-create',2));
  v_matches:=public.nearby_matches(p_lat,p_lon,p_type);
  if jsonb_array_length(v_matches)>0 then
    if p_distinct_reason is null or char_length(trim(p_distinct_reason)) not between 10 and 300
      or exists(select 1 from jsonb_array_elements(v_matches) m
        where not((m->>'id')::uuid=any(coalesce(p_seen,'{}'::uuid[])))) then
      return jsonb_build_object('result','matches','matches',v_matches);
    end if;
  end if;
  insert into public.incidents(created_by,reference_point_id,location_text,description,problem_type,distinct_reason,
    latitude,longitude,district,location_source,accuracy_m)
  values(v_uid,'00000000-0000-4000-8000-000000000001',trim(p_location),trim(p_description),p_type,
    nullif(trim(p_distinct_reason),''),p_lat,p_lon,trim(p_district),p_source,p_accuracy) returning id into v_id;
  insert into public.contributions(incident_id,user_id) values(v_id,v_uid);
  update public.incidents set previous_incident_id=(select old.id from public.incidents old
    where old.status='solucionado' and old.merged_into_id is null and old.problem_type=p_type
      and public.barrio_distance_m(p_lat,p_lon,old.latitude,old.longitude)<=30
    order by old.resolved_at desc,old.id limit 1) where id=v_id;
  perform public.barrio_event(v_id,null,'pendiente',null);
  perform public.barrio_save_receipt(p_key,'create_geo',v_payload,v_id);
  return jsonb_build_object('id',v_id,'result','created');
end; $$;

-- Se conserva la proyección segura original y se añaden los datos geográficos.
alter function public.get_incident(uuid) rename to get_incident_v1;
revoke all on function public.get_incident_v1(uuid) from public,anon,authenticated;
create function public.get_incident(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_base jsonb; v_geo jsonb; v_target uuid;
begin
  select merged_into_id into v_target from public.incidents where id=p_id;
  if v_target is not null then return public.get_incident(v_target); end if;
  v_base:=public.get_incident_v1(p_id);
  select jsonb_build_object('latitude',latitude,'longitude',longitude,'district',district,'accuracy_m',accuracy_m,
    'location_source',location_source,'point_name',coalesce(district,v_base->>'point_name'),
    'previous_incident_id',previous_incident_id,
    'merged_reports',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'location_text',s.location_text,'events',public.get_incident_v1(s.id)->'events'))
      from public.incidents s where s.merged_into_id=p_id),'[]'::jsonb),
    'has_my_photo',exists(select 1 from public.evidence e join public.incidents s on s.id=e.incident_id
      where e.kind='reporte' and e.uploaded_by=auth.uid() and (s.id=p_id or s.merged_into_id=p_id)),
    'photos',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'object_path',e.object_path)
      order by e.created_at) from public.evidence e join public.incidents s on s.id=e.incident_id
      where s.id=p_id or s.merged_into_id=p_id),'[]'::jsonb),
    'can_set_location',latitude is null and (created_by=auth.uid() or exists(select 1 from public.profiles where id=auth.uid() and role='responsable')))
  into v_geo from public.incidents where id=p_id;
  return v_base||v_geo;
end; $$;

create function public.browse_incidents(p_mode text default 'nearby',p_lat double precision default null,
  p_lon double precision default null,p_radius integer default 1000,p_district text default null,
  p_status text default null,p_type text default null,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.barrio_actor();
  if p_mode is null or p_mode not in ('nearby','district','unlocated','all') then raise exception 'Filtro de ubicación inválido.'; end if;
  if p_mode='nearby' then
    perform public.barrio_validate_location(p_lat,p_lon,'Consulta','manual',null);
    if p_radius is null or p_radius not between 100 and 20000 then raise exception 'El radio debe estar entre 100 m y 20 km.'; end if;
  end if;
  if p_mode='district' and (p_district is null or char_length(trim(p_district)) not between 3 and 120) then raise exception 'Selecciona un distrito (3 a 120 caracteres).'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.distance_m nulls last,t.created_at desc,t.id desc) from (
    select i.id,i.location_text,i.description,i.problem_type,i.status,i.version,i.created_at,i.updated_at,
      coalesce(i.district,p.name) as point_name,i.reference_point_id,i.latitude,i.longitude,i.district,
      case when p_mode='nearby' then public.barrio_distance_m(p_lat,p_lon,i.latitude,i.longitude) end as distance_m,
      (select count(*)::integer from public.contributions c where c.incident_id=i.id) as participants,
      exists(select 1 from public.contributions c where c.incident_id=i.id and c.user_id=auth.uid()) as has_contributed,
      i.assigned_to=auth.uid() as assigned_to_me,
      (select e.object_path from public.evidence e where e.incident_id=i.id order by e.created_at limit 1) as photo_path
    from public.incidents i join public.reference_points p on p.id=i.reference_point_id
    where i.merged_into_id is null and (p_status is null or i.status=p_status) and (p_type is null or i.problem_type=p_type)
      and (p_mode='all' or (p_mode='unlocated' and i.latitude is null)
        or (p_mode='district' and public.barrio_district(i.district)=public.barrio_district(p_district))
        or (p_mode='nearby' and i.latitude between p_lat-p_radius/110000.0 and p_lat+p_radius/110000.0
          and public.barrio_distance_m(p_lat,p_lon,i.latitude,i.longitude)<=p_radius))
    order by distance_m nulls last,i.created_at desc,i.id desc limit 20 offset greatest(0,least(p_offset,100000))
  ) t),'[]'::jsonb);
end; $$;

create function public.list_districts() returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public.barrio_actor();
  return coalesce((select jsonb_agg(district order by district) from (
    select min(district) as district from public.incidents where district is not null and merged_into_id is null
    group by public.barrio_district(district) limit 200) t),'[]'::jsonb);
end; $$;

create function public.locate_legacy_incident(p_id uuid,p_key uuid,p_lat double precision,p_lon double precision,
  p_district text,p_source text,p_accuracy double precision default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=public.barrio_actor(); v_row public.incidents; v_old uuid;
  v_payload text:=jsonb_build_array(p_id,p_lat,p_lon,trim(p_district),p_source,p_accuracy)::text;
begin
  perform public.barrio_validate_location(p_lat,p_lon,p_district,p_source,p_accuracy);
  v_old:=public.barrio_receipt(p_key,'locate',v_payload);
  if v_old is not null then return v_old; end if;
  perform pg_advisory_xact_lock(hashtextextended('barrio-geo-create',2));
  select * into v_row from public.incidents where id=p_id for update;
  if v_row.id is null or (v_row.created_by<>v_uid and not exists(select 1 from public.profiles where id=v_uid and role='responsable')) then
    raise exception 'Solo el creador o un responsable puede ubicar el reporte antiguo.';
  end if;
  if v_row.latitude is not null then raise exception 'Este reporte ya tiene una ubicación confirmada.'; end if;
  update public.incidents set latitude=p_lat,longitude=p_lon,district=trim(p_district),location_source=p_source,
    accuracy_m=p_accuracy,updated_at=now(),version=version+1 where id=p_id;
  insert into public.location_events(incident_id,actor_id,latitude,longitude,district) values(p_id,v_uid,p_lat,p_lon,trim(p_district));
  perform public.barrio_save_receipt(p_key,'locate',v_payload,p_id);
  return p_id;
end; $$;

-- Archivar duplicados preservando originales, fotografías y bitácoras.
create function public.merge_incidents(p_source uuid,p_target uuid,p_note text,p_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=public.barrio_actor(); v_source public.incidents; v_target public.incidents;
  v_old uuid; v_event uuid; v_payload text:=jsonb_build_array(p_source,p_target,trim(p_note))::text;
begin
  if not exists(select 1 from public.profiles where id=v_uid and role='responsable') then raise exception 'Solo un responsable puede unir reportes.'; end if;
  v_old:=public.barrio_receipt(p_key,'merge',v_payload);
  if v_old is not null then return v_old; end if;
  if p_source=p_target or p_note is null or char_length(trim(p_note)) not between 10 and 300 then raise exception 'Selecciona dos casos distintos y explica por qué son el mismo problema.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('barrio-geo-create',2));
  perform 1 from public.incidents where id in (p_source,p_target) order by id for update;
  select * into v_source from public.incidents where id=p_source;
  select * into v_target from public.incidents where id=p_target;
  if v_source.id is null or v_target.id is null or v_source.merged_into_id is not null or v_target.merged_into_id is not null
    or v_source.status='solucionado' or v_target.status='solucionado' then raise exception 'Solo se pueden unir casos abiertos que no estén unidos a otro.'; end if;
  if (v_source.assigned_to is not null and v_source.assigned_to<>v_uid) or (v_target.assigned_to is not null and v_target.assigned_to<>v_uid) then
    raise exception 'No puedes unir un caso que está atendiendo otro responsable.';
  end if;
  if v_source.latitude is null or v_target.latitude is null or public.barrio_distance_m(v_source.latitude,v_source.longitude,v_target.latitude,v_target.longitude)>100 then
    raise exception 'Primero confirma las ubicaciones. Los casos deben estar a 100 m o menos.';
  end if;
  insert into public.contributions(incident_id,user_id)
    select p_target,user_id from public.contributions where incident_id=p_source on conflict do nothing;
  update public.incidents set merged_into_id=p_target,version=version+1,updated_at=now() where id=p_source or merged_into_id=p_source;
  update public.incidents set version=version+1,updated_at=now() where id=p_target;
  insert into public.status_events(incident_id,actor_id,from_status,to_status,note)
    values(p_target,v_uid,v_target.status,v_target.status,'Reportes unidos: '||trim(p_note)) returning id into v_event;
  insert into public.notifications(recipient_id,incident_id,status_event_id,event_type)
    select user_id,p_target,v_event,'fusionado' from public.contributions where incident_id=p_target;
  perform public.barrio_save_receipt(p_key,'merge',v_payload,p_target);
  return p_target;
end; $$;

create function public.barrio_guard_merged() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.merged_into_id is not null and
    (new.status,new.assigned_to,new.latitude,new.longitude,new.district,new.description,new.problem_type)
      is distinct from (old.status,old.assigned_to,old.latitude,old.longitude,old.district,old.description,old.problem_type) then
    raise exception 'Este reporte fue unido a otro. Abre el caso principal.';
  end if;
  return new;
end; $$;
create trigger guard_merged before update on public.incidents for each row execute function public.barrio_guard_merged();
create function public.barrio_guard_contribution() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.incidents where id=new.incident_id and merged_into_id is not null) then
    raise exception 'Este reporte fue unido a otro. Abre el caso principal.';
  end if;
  return new;
end; $$;
create trigger guard_merged_contribution before insert on public.contributions for each row execute function public.barrio_guard_contribution();

create or replace function public.can_upload_evidence(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_path,'/',1)=auth.uid()::text
    and split_part(p_path,'/',4) ~ '^[0-9a-f-]{36}\.(jpg|png)$' and array_length(string_to_array(p_path,'/'),1)=4
    and exists(select 1 from public.incidents i where i.id::text=split_part(p_path,'/',2) and i.merged_into_id is null
      and ((split_part(p_path,'/',3)='reporte' and i.status<>'solucionado'
        and exists(select 1 from public.contributions c where c.incident_id=i.id and c.user_id=auth.uid()))
      or (split_part(p_path,'/',3)='solucion' and i.status='en_proceso' and i.assigned_to=auth.uid()
        and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='responsable'))));
$$;
revoke all on function public.barrio_guard_merged(),public.barrio_guard_contribution() from public,anon,authenticated;
revoke all on function public.merge_incidents(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.merge_incidents(uuid,uuid,text,uuid) to authenticated;

-- Impedir que una versión antigua del cliente cree nuevos casos sin coordenadas.
revoke execute on function public.create_incident(uuid,uuid,text,text,text,uuid[],text) from authenticated;
revoke execute on function public.list_incidents(text,text,integer),public.find_matches(uuid,text) from authenticated;
revoke all on function public.barrio_district(text),public.barrio_distance_m(double precision,double precision,double precision,double precision),
  public.barrio_validate_location(double precision,double precision,text,text,double precision) from public,anon,authenticated;
revoke all on function public.nearby_matches(double precision,double precision,text),
  public.create_geo_incident(uuid,double precision,double precision,text,text,text,text,text,double precision,uuid[],text),
  public.get_incident(uuid),public.browse_incidents(text,double precision,double precision,integer,text,text,text,integer),
  public.list_districts(),public.locate_legacy_incident(uuid,uuid,double precision,double precision,text,text,double precision) from public,anon,authenticated;
grant execute on function public.nearby_matches(double precision,double precision,text),
  public.create_geo_incident(uuid,double precision,double precision,text,text,text,text,text,double precision,uuid[],text),
  public.get_incident(uuid),public.browse_incidents(text,double precision,double precision,integer,text,text,text,integer),
  public.list_districts(),public.locate_legacy_incident(uuid,uuid,double precision,double precision,text,text,double precision) to authenticated;

notify pgrst,'reload schema';
commit;
