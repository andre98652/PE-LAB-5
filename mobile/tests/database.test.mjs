import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

// Ejecuta SQL real. Auth y Storage se modelan solo para las reglas de datos;
// no emula red, archivos binarios, Auth HTTP ni entrega Realtime.
test('Migración y reglas de Barrio Limpio en PostgreSQL', async t => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant select,insert,delete,update on storage.objects to authenticated;
    create publication supabase_realtime;
  `);
  const migration = await readFile(new URL('../../supabase/migrations/202610310001_barrio_limpio.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const users = { a: randomUUID(), b: randomUUID(), responsible: randomUUID(), other: randomUUID() };
  for (const id of Object.values(users)) {
    await db.query(`insert into auth.users(id,raw_user_meta_data) values($1,'{"role":"responsable"}')`, [id]);
  }
  await db.query("update public.profiles set role='responsable' where id in ($1,$2)", [users.responsible, users.other]);
  const points = (await db.query('select id from public.reference_points order by name')).rows;
  async function asUser(id, callback) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec('set role authenticated');
    try { return await callback(); }
    finally { await db.exec('reset role'); }
  }
  async function value(sql, args = []) { return (await db.query(sql, args)).rows[0].result; }
  function create(id, point = points[0].id, key = randomUUID(), seen = [], reason = null, description = 'Hay bolsas de basura junto a la entrada.') {
    return asUser(id, () => value('select public.create_incident($1,$2,$3,$4,$5,$6,$7) as result',
      [key, point, 'Frente a la entrada principal', description, 'basura', seen, reason]));
  }
  let incidentId;
  const creationKey = randomUUID();
  await t.test('alta ignora roles enviados por el cliente', async () => {
    const role = await value('select role as result from public.profiles where id=$1', [users.a]);
    assert.equal(role, 'vecino');
  });
  await t.test('crear registra participación, evento y avisos juntos', async () => {
    const result = await create(users.a, points[0].id, creationKey);
    assert.equal(result.result, 'created'); incidentId = result.id;
    assert.equal(await value('select count(*)::integer as result from public.contributions where incident_id=$1', [incidentId]), 1);
    assert.equal(await value('select count(*)::integer as result from public.status_events where incident_id=$1', [incidentId]), 1);
    assert.equal(await value('select count(*)::integer as result from public.notifications where incident_id=$1', [incidentId]), 2);
  });
  await t.test('reintentar la creación devuelve el mismo resultado', async () => {
    assert.equal((await create(users.a, points[0].id, creationKey)).id, incidentId);
    assert.equal(await value('select count(*)::integer as result from public.incidents'), 1);
  });
  await t.test('reutilizar clave con otro contenido es rechazado', async () => {
    await assert.rejects(create(users.a, points[0].id, creationKey, [], null, 'Un texto diferente que no corresponde al primer envío.'), /otro contenido/);
  });
  await t.test('otra creación encuentra la coincidencia del servidor', async () => {
    const result = await create(users.b);
    assert.equal(result.result, 'matches'); assert.equal(result.matches[0].id, incidentId);
    assert.equal(await value('select count(*)::integer as result from public.incidents'), 1);
  });
  await t.test('confirmar dos veces solo agrega un vecino y no repite avisos', async () => {
    const key = randomUUID();
    for (const request of [key, key, randomUUID()]) await asUser(users.b, () => value('select public.confirm_incident($1,$2) as result', [incidentId, request]));
    assert.equal(await value('select count(*)::integer as result from public.contributions where incident_id=$1', [incidentId]), 2);
    assert.equal(await value('select count(*)::integer as result from public.notifications where incident_id=$1', [incidentId]), 2);
  });
  await t.test('segundo problema requiere explicación y conocer candidatos', async () => {
    assert.equal((await create(users.b, points[0].id, randomUUID(), [], 'Es otra acumulación en el lado opuesto del parque.')).result, 'matches');
    const result = await create(users.b, points[0].id, randomUUID(), [incidentId], 'Es otra acumulación en el lado opuesto del parque.');
    assert.equal(result.result, 'created'); assert.notEqual(result.id, incidentId);
  });
  await t.test('lectura no expone IDs de autores y el contador es correcto', async () => {
    const detail = await asUser(users.b, () => value('select public.get_incident($1) as result', [incidentId]));
    assert.equal(detail.participants, 2); assert.equal(detail.has_contributed, true);
    assert.equal('created_by' in detail, false);
    assert.equal(JSON.stringify(detail).includes(users.a), false);
  });
  await t.test('vecino no cambia estado, rol ni ejecuta helpers privados', async () => {
    await assert.rejects(asUser(users.a, () => value('select public.accept_incident($1,1,$2) as result', [incidentId, randomUUID()])), /Solo el responsable/);
    await assert.rejects(asUser(users.a, () => db.query("update public.profiles set role='responsable' where id=$1", [users.a])), /permission denied/);
    await assert.rejects(asUser(users.a, () => db.query("update public.incidents set status='solucionado' where id=$1", [incidentId])), /permission denied/);
    await assert.rejects(asUser(users.a, () => db.query('select public.barrio_actor()')), /permission denied/);
  });
  const acceptKey = randomUUID();
  await t.test('aceptar asigna una vez y rechaza otra aceptación con versión antigua', async () => {
    await asUser(users.responsible, () => value('select public.accept_incident($1,1,$2) as result', [incidentId, acceptKey]));
    await asUser(users.responsible, () => value('select public.accept_incident($1,1,$2) as result', [incidentId, acceptKey]));
    await assert.rejects(asUser(users.other, () => value('select public.accept_incident($1,1,$2) as result', [incidentId, randomUUID()])), /El caso cambió/);
    const row = (await db.query('select status,assigned_to,version from public.incidents where id=$1', [incidentId])).rows[0];
    assert.equal(row.status, 'en_proceso'); assert.equal(row.assigned_to, users.responsible); assert.equal(row.version, 2);
  });
  await t.test('avisos personales solo son visibles al destinatario', async () => {
    const notices = await asUser(users.a, () => db.query('select * from public.notifications'));
    assert.equal(notices.rows.length, 1); assert.equal(notices.rows[0].recipient_id, users.a);
    const otherNotice = await value('select id as result from public.notifications where recipient_id=$1 limit 1', [users.b]);
    await asUser(users.a, () => db.query('select public.read_notification($1)', [otherNotice]));
    assert.equal(await value('select read_at as result from public.notifications where id=$1', [otherNotice]), null);
  });
  const solutionPath = `${users.responsible}/${incidentId}/solucion/${randomUUID()}.jpg`;
  await t.test('no cerrar sin archivo ni desde otro responsable', async () => {
    await assert.rejects(asUser(users.responsible, () => value('select public.resolve_incident($1,2,$2,$3,$4) as result',
      [incidentId, 'Se retiraron las bolsas del lugar.', solutionPath, randomUUID()])), /imagen no existe/);
    await assert.rejects(asUser(users.other, () => value('select public.resolve_incident($1,2,$2,$3,$4) as result',
      [incidentId, 'Se retiraron las bolsas del lugar.', solutionPath, randomUUID()])), /No puedes cerrar/);
    assert.equal(await value('select status as result from public.incidents where id=$1', [incidentId]), 'en_proceso');
  });
  await t.test('políticas de Storage rechazan rutas ajenas y aceptan evidencia propia', async () => {
    await assert.rejects(asUser(users.a, () => db.query("insert into storage.objects(bucket_id,name,metadata) values('evidencias',$1,'{\"size\":800,\"mimetype\":\"image/jpeg\"}')", [solutionPath])), /row-level security/);
    await asUser(users.responsible, () => db.query("insert into storage.objects(bucket_id,name,metadata) values('evidencias',$1,'{\"size\":800,\"mimetype\":\"image/jpeg\"}')", [solutionPath]));
  });
  await t.test('cierre con evidencia produce un evento y avisos por vecino', async () => {
    const key = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) await asUser(users.responsible, () => value('select public.resolve_incident($1,2,$2,$3,$4) as result',
      [incidentId, 'Se retiraron las bolsas del lugar.', solutionPath, key]));
    assert.equal(await value('select status as result from public.incidents where id=$1', [incidentId]), 'solucionado');
    assert.equal(await value("select count(*)::integer as result from public.status_events where incident_id=$1 and to_status='solucionado'", [incidentId]), 1);
    assert.equal(await value("select count(*)::integer as result from public.notifications where incident_id=$1 and event_type='solucionado'", [incidentId]), 2);
    await assert.rejects(asUser(users.b, () => value('select public.confirm_incident($1,$2) as result', [incidentId, randomUUID()])), /ya no está abierta/);
  });
  await t.test('evidencia adjuntada no puede borrarse desde Storage', async () => {
    const result = await asUser(users.responsible, () => db.query("delete from storage.objects where name=$1 returning id", [solutionPath]));
    assert.equal(result.rows.length, 0);
    assert.equal(await value('select count(*)::integer as result from storage.objects where name=$1', [solutionPath]), 1);
  });
  await t.test('episodio solucionado no bloquea un reporte nuevo en su punto', async () => {
    const result = await create(users.a, points[1].id);
    assert.equal(result.result, 'created');
    // No hay un bloqueo único que impida recurrencias; las coincidencias solo miran casos abiertos.
    const matches = await asUser(users.a, () => value('select public.find_matches($1,$2) as result', [points[0].id, 'basura']));
    assert.equal(matches.some(row => row.id === incidentId), false);
  });
  await t.test('diez vecinos adicionales se agrupan en una incidencia con once participantes', async () => {
    const point = points[2].id;
    const initial = await create(users.a, point);
    assert.equal(initial.result, 'created');
    for (let index = 0; index < 10; index++) {
      const neighbour = randomUUID();
      await db.query('insert into auth.users(id) values($1)', [neighbour]);
      const attempt = await create(neighbour, point);
      assert.equal(attempt.result, 'matches');
      assert.equal(attempt.matches[0].id, initial.id);
      await asUser(neighbour, () => value('select public.confirm_incident($1,$2) as result', [initial.id, randomUUID()]));
    }
    assert.equal(await value('select count(*)::integer as result from public.incidents where reference_point_id=$1', [point]), 1);
    assert.equal(await value('select count(*)::integer as result from public.contributions where incident_id=$1', [initial.id]), 11);
    assert.equal(await value("select count(*)::integer as result from public.notifications where incident_id=$1 and event_type='nuevo'", [initial.id]), 2);
  });
  await t.test('migración geográfica conserva datos y permisos', async () => {
    const before = await value('select count(*)::integer as result from public.incidents');
    await db.exec(await readFile(new URL('../../supabase/migrations/202610310002_ubicacion.sql', import.meta.url), 'utf8'));
    assert.equal(await value('select count(*)::integer as result from public.incidents'), before);
    assert.equal(await value('select status as result from public.incidents where id=$1', [incidentId]), 'solucionado');
    await assert.rejects(create(users.a), /permission denied/);
    const old = await asUser(users.a, () => value('select public.get_incident($1) as result', [incidentId]));
    assert.equal(old.latitude, null); assert.equal(old.can_set_location, true);
    assert.equal(old.photos.length, 1);
  });
  const origin = { lat: -12.05, lon: -77.05 };
  let geoId;
  let duplicateId;
  const geoKey = randomUUID();
  function createGeo(user, lat = origin.lat, lon = origin.lon, key = randomUUID(), type = 'basura', district = 'Comas, Lima', seen = [], reason = null) {
    return asUser(user, () => value('select public.create_geo_incident($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as result',
      [key, lat, lon, district, 'Junto al poste del parque', 'Bolsas acumuladas en la vía pública.', type, 'mapa', null, seen, reason]));
  }
  await t.test('distancia en metros, cruce de meridiano y coordenadas inválidas', async () => {
    assert.ok(Math.abs(await value('select public.barrio_distance_m(0,0,1,0) as result') - 111195.08) < 1);
    assert.ok(await value('select public.barrio_distance_m(0,179.999,0,-179.999) as result') < 223);
    for (const bad of [91, 'NaN', 'Infinity', null]) await assert.rejects(createGeo(users.a, bad), /coordenadas válidas/);
    await assert.rejects(createGeo(users.a, origin.lat, origin.lon, randomUUID(), 'basura', ' '), /distrito y provincia/);
  });
  await t.test('crear por coordenadas y repetir petición conserva una incidencia', async () => {
    const result = await createGeo(users.a, origin.lat, origin.lon, geoKey);
    assert.equal(result.result, 'created'); geoId = result.id;
    assert.equal((await createGeo(users.a, origin.lat, origin.lon, geoKey)).id, geoId);
    const detail = await asUser(users.a, () => value('select public.get_incident($1) as result', [geoId]));
    assert.equal(detail.latitude, origin.lat); assert.equal(detail.district, 'Comas, Lima');
    assert.equal(detail.can_set_location, false); assert.equal('created_by' in detail, false);
  });
  await t.test('otra foto, clasificación y distrito próximos sugieren el mismo caso', async () => {
    const result = await createGeo(users.b, origin.lat + 0.0001, origin.lon, randomUUID(), 'contenedor', 'Otro distrito, Lima');
    assert.equal(result.result, 'matches'); assert.equal(result.matches[0].id, geoId);
    assert.ok(result.matches[0].distance_m > 10 && result.matches[0].distance_m < 12);
    await asUser(users.b, () => value('select public.confirm_incident($1,$2) as result', [geoId, randomUUID()]));
    assert.equal(await value('select count(*)::integer as result from public.contributions where incident_id=$1', [geoId]), 2);
  });
  await t.test('candidato nuevo al guardar exige volver a confirmar', async () => {
    const attempt = await createGeo(users.b, origin.lat, origin.lon, randomUUID(), 'basura', 'Comas, Lima', [], 'Es otra acumulación del otro lado de la calle.');
    assert.equal(attempt.result, 'matches');
    const different = await createGeo(users.b, origin.lat, origin.lon, randomUUID(), 'basura', 'Comas, Lima', [geoId], 'Es otra acumulación del otro lado de la calle.');
    assert.equal(different.result, 'created');
    duplicateId = different.id;
  });
  await t.test('radio y distrito se filtran en servidor; antiguos se conservan aparte', async () => {
    const far = await createGeo(users.a, origin.lat + 0.01, origin.lon);
    assert.equal(far.result, 'created');
    const nearby = await asUser(users.a, () => value("select public.browse_incidents('nearby',$1,$2,500) as result", [origin.lat, origin.lon]));
    assert.ok(nearby.some(row => row.id === geoId)); assert.equal(nearby.some(row => row.id === far.id), false);
    assert.ok(nearby.every(row => row.distance_m <= 500 && row.latitude != null));
    const wider = await asUser(users.a, () => value("select public.browse_incidents('nearby',$1,$2,2000) as result", [origin.lat, origin.lon]));
    assert.ok(wider.some(row => row.id === far.id));
    for (let i = 1; i < wider.length; i++) assert.ok(wider[i].distance_m >= wider[i - 1].distance_m);
    const district = await asUser(users.a, () => value("select public.browse_incidents('district',null,null,1000,'  CÓMAS,   LIMA ') as result"));
    assert.ok(district.some(row => row.id === far.id));
    const old = await asUser(users.a, () => value("select public.browse_incidents('unlocated') as result"));
    assert.ok(old.some(row => row.id === incidentId)); assert.ok(old.every(row => row.latitude === null));
    await assert.rejects(asUser(users.a, () => value("select public.browse_incidents('nearby',null,null) as result")), /coordenadas válidas/);
    await assert.rejects(asUser(users.a, () => value("select public.browse_incidents('nearby',$1,$2,0) as result", [origin.lat, origin.lon])), /radio/);
  });
  await t.test('solo creador o responsable ubica un caso antiguo; no se reubica uno confirmado', async () => {
    const args = [incidentId, randomUUID(), origin.lat + 0.1, origin.lon, 'Comas, Lima', 'manual'];
    await assert.rejects(asUser(users.b, () => value('select public.locate_legacy_incident($1,$2,$3,$4,$5,$6) as result', args)), /Solo el creador/);
    await asUser(users.a, () => value('select public.locate_legacy_incident($1,$2,$3,$4,$5,$6) as result', args));
    await asUser(users.a, () => value('select public.locate_legacy_incident($1,$2,$3,$4,$5,$6) as result', args));
    assert.equal(await value('select count(*)::integer as result from public.location_events where incident_id=$1', [incidentId]), 1);
    args[1] = randomUUID();
    await assert.rejects(asUser(users.responsible, () => value('select public.locate_legacy_incident($1,$2,$3,$4,$5,$6) as result', args)), /ya tiene una ubicación/);
    assert.equal(await value('select status as result from public.incidents where id=$1', [incidentId]), 'solucionado');
  });
  await t.test('caso solucionado permite un episodio nuevo en el mismo lugar', async () => {
    const lat = origin.lat + 0.03;
    const first = await createGeo(users.a, lat);
    await asUser(users.responsible, () => value('select public.accept_incident($1,1,$2) as result', [first.id, randomUUID()]));
    const path = `${users.responsible}/${first.id}/solucion/${randomUUID()}.jpg`;
    await asUser(users.responsible, () => db.query("insert into storage.objects(bucket_id,name,metadata) values('evidencias',$1,'{\"size\":800,\"mimetype\":\"image/jpeg\"}')", [path]));
    await asUser(users.responsible, () => value('select public.resolve_incident($1,2,$2,$3,$4) as result', [first.id, 'Se retiraron todos los residuos del lugar.', path, randomUUID()]));
    const second = await createGeo(users.b, lat);
    assert.equal(second.result, 'created'); assert.notEqual(second.id, first.id);
    const detail = await asUser(users.b, () => value('select public.get_incident($1) as result', [second.id]));
    assert.equal(detail.previous_incident_id, first.id);
  });
  await t.test('responsable une duplicados sin perder fotos, participantes ni historial', async () => {
    const third = randomUUID();
    await db.query('insert into auth.users(id) values($1)', [third]);
    await asUser(third, () => value('select public.confirm_incident($1,$2) as result', [duplicateId, randomUUID()]));
    const path = `${users.b}/${duplicateId}/reporte/${randomUUID()}.jpg`;
    await asUser(users.b, () => db.query("insert into storage.objects(bucket_id,name,metadata) values('evidencias',$1,'{\"size\":800,\"mimetype\":\"image/jpeg\"}')", [path]));
    await asUser(users.b, () => db.query('select public.attach_report_photo($1,$2)', [duplicateId, path]));
    const note = 'Se verificó que las fotos muestran el mismo episodio junto al poste.';
    await assert.rejects(asUser(users.b, () => value('select public.merge_incidents($1,$2,$3,$4) as result', [duplicateId, geoId, note, randomUUID()])), /Solo un responsable/);
    await assert.rejects(asUser(users.responsible, () => value('select public.merge_incidents($1,$2,$3,$4) as result', [geoId, geoId, note, randomUUID()])), /dos casos distintos/);
    const key = randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) await asUser(users.responsible, () => value('select public.merge_incidents($1,$2,$3,$4) as result', [duplicateId, geoId, note, key]));
    const detail = await asUser(users.b, () => value('select public.get_incident($1) as result', [duplicateId]));
    assert.equal(detail.id, geoId); assert.equal(detail.participants, 3);
    assert.ok(detail.photos.some(photo => photo.object_path === path)); assert.equal(detail.has_my_photo, true);
    assert.ok(detail.merged_reports.some(row => row.id === duplicateId && row.events.length > 0));
    assert.equal(await value('select incident_id as result from public.evidence where object_path=$1', [path]), duplicateId);
    assert.equal(await value("select count(*)::integer as result from public.notifications where incident_id=$1 and event_type='fusionado'", [geoId]), 3);
    const browse = await asUser(users.a, () => value("select public.browse_incidents('all') as result"));
    assert.equal(browse.some(row => row.id === duplicateId), false);
    await assert.rejects(asUser(third, () => value('select public.confirm_incident($1,$2) as result', [duplicateId, randomUUID()])), /unido a otro/);
    await assert.rejects(asUser(users.responsible, () => value('select public.accept_incident($1,2,$2) as result', [duplicateId, randomUUID()])), /unido a otro/);
    const allowed = await asUser(users.b, () => value('select public.can_upload_evidence($1) as result', [`${users.b}/${duplicateId}/reporte/${randomUUID()}.jpg`]));
    assert.equal(allowed, false);
    const next = await createGeo(users.a, origin.lat + 0.00005, origin.lon, randomUUID(), 'basura', 'Comas, Lima', [geoId], 'Otro caso que el responsable revisará después.');
    assert.equal(next.result, 'created');
    await asUser(users.responsible, () => value('select public.merge_incidents($1,$2,$3,$4) as result', [geoId, next.id, note, randomUUID()]));
    const chained = await asUser(users.b, () => value('select public.get_incident($1) as result', [duplicateId]));
    assert.equal(chained.id, next.id); assert.equal(chained.participants, 3);
    assert.ok(chained.photos.some(photo => photo.object_path === path));
    assert.equal(chained.merged_reports.length, 2);
  });
  await db.close();
});
