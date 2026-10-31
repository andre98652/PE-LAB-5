import { supabase } from '../lib/supabase';
import type { Draft, Incident, IncidentDetail, Match, Notice, Photo, Point, Status, ProblemType } from '../domain/models';
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
  create: (draft: Draft, key: string, seen: string[]) => rpc<{ id?: string; result: 'created' | 'matches'; matches?: Match[] }>('create_incident', {
    p_key: key, p_point: draft.point, p_location: draft.location.trim(), p_description: draft.description.trim(),
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
