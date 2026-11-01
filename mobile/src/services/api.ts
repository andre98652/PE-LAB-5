import { supabase } from '../lib/supabase';
import type { GeoDraft, Incident, IncidentDetail, Match, Notice, Photo, Point, Status, ProblemType } from '../domain/models';
import type { AreaFilter, GeoLocation } from '../domain/geo';
import { toByteArray } from 'base64-js';

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export const api = {
  async points(): Promise<Point[]> {
    const { data, error } = await supabase.from('reference_points').select('id,name,reference').eq('active', true).order('name');
    if (error) throw error;
    return data ?? [];
  },
  list: (status: Status | null, type: ProblemType | null, offset = 0) =>
    rpc<Incident[]>('list_incidents', { p_status: status, p_type: type, p_offset: offset }),
  detail: (id: string) => rpc<IncidentDetail>('get_incident', { p_id: id }),
  matches: (point: string, type: ProblemType) => rpc<Match[]>('find_matches', { p_point: point, p_type: type }),
  districts: () => rpc<string[]>('list_districts', {}),
  browse: (filter: AreaFilter, status: Status | null, type: ProblemType | null, offset = 0) => rpc<Incident[]>('browse_incidents', {
    p_mode: filter.mode, p_lat: filter.center?.latitude ?? null, p_lon: filter.center?.longitude ?? null,
    p_radius: filter.radius, p_district: filter.district.trim() || null, p_status: status, p_type: type, p_offset: offset,
  }),
  nearby: (geo: GeoLocation, type: ProblemType) => rpc<Match[]>('nearby_matches', { p_lat: geo.latitude, p_lon: geo.longitude, p_type: type }),
  locate: (id: string, key: string, geo: GeoLocation, district: string) => rpc<string>('locate_legacy_incident', {
    p_id: id, p_key: key, p_lat: geo.latitude, p_lon: geo.longitude, p_district: district.trim(), p_source: geo.source, p_accuracy: geo.accuracy,
  }),
  merge: (source: string, target: string, note: string, key: string) => rpc<string>('merge_incidents', {
    p_source: source, p_target: target, p_note: note.trim(), p_key: key,
  }),
  create: (draft: GeoDraft, key: string, seen: string[]) => rpc<{ id?: string; result: 'created' | 'matches'; matches?: Match[] }>('create_geo_incident', {
    p_key: key, p_lat: draft.geo?.latitude, p_lon: draft.geo?.longitude, p_district: draft.district.trim(),
    p_source: draft.geo?.source, p_accuracy: draft.geo?.accuracy,
    p_location: draft.location.trim(), p_description: draft.description.trim(),
    p_type: draft.type, p_seen: seen, p_distinct_reason: draft.distinctReason.trim() || null,
  }),
  confirm: (id: string, key: string) => rpc<string>('confirm_incident', { p_id: id, p_key: key }),
  accept: (incident: Incident, key: string) => rpc<string>('accept_incident', { p_id: incident.id, p_version: incident.version, p_key: key }),
  resolve: (incident: Incident, note: string, path: string, key: string) => rpc<string>('resolve_incident', {
    p_id: incident.id, p_version: incident.version, p_note: note.trim(), p_path: path, p_key: key,
  }),
  attach: (id: string, path: string) => rpc<void>('attach_report_photo', { p_id: id, p_path: path }),
  async notices(): Promise<Notice[]> {
    const { data, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return data ?? [];
  },
  read: (id: string) => rpc<void>('read_notification', { p_id: id }),
  async photoUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from('evidencias').createSignedUrl(path, 600);
    if (error) throw error;
    return data.signedUrl;
  },
  async upload(userId: string, incidentId: string, kind: 'reporte' | 'solucion', photo: Photo): Promise<string> {
    const path = `${userId}/${incidentId}/${kind}/${photo.pathId}.jpg`;
    const bytes = toByteArray(photo.base64);
    if (bytes.byteLength === 0 || bytes.byteLength > 2097152) throw new Error('La imagen debe pesar como máximo 2 MB.');
    // Reintento determinista: si ya se subió, verificar acceso en vez de sobrescribir.
    const { error } = await supabase.storage.from('evidencias').upload(path, bytes.buffer as ArrayBuffer,
      { contentType: 'image/jpeg', upsert: false });
    if (error) {
      if (!/already exists|duplicate/i.test(error.message)) throw error;
      await api.photoUrl(path);
    }
    return path;
  },
};
