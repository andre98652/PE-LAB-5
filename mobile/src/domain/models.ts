export type Status = 'pendiente' | 'en_proceso' | 'solucionado';
export type ProblemType = 'basura' | 'contenedor' | 'desmonte';
export type Profile = { id: string; display_name: string; role: 'vecino' | 'responsable' };
export type Point = { id: string; name: string; reference: string };
export type Incident = {
  id: string; location_text: string; description: string; problem_type: ProblemType;
  status: Status; version: number; created_at: string; updated_at: string;
  point_name: string; reference_point_id: string; participants: number;
  has_contributed: boolean; assigned_to_me: boolean | null; photo_path?: string | null;
};
export type Evidence = { id: string; kind: 'reporte' | 'solucion'; object_path: string };
export type IncidentDetail = Incident & {
  has_my_photo: boolean; resolution_note: string | null; resolved_at: string | null;
  distinct_reason: string | null; photos: Evidence[];
  events: { id: string; to_status: Status; note: string | null; created_at: string; actor_role: string }[];
};
export type Match = Pick<Incident, 'id' | 'location_text' | 'description' | 'status'>;
export type Notice = { id: string; incident_id: string; event_type: string; read_at: string | null; created_at: string };
export type Draft = { point: string; location: string; description: string; type: ProblemType; distinctReason: string };
export type Photo = { uri: string; base64: string; pathId: string };

export const STATUS_LABEL: Record<Status, string> = {
  pendiente: 'Pendiente', en_proceso: 'En proceso', solucionado: 'Solucionado',
};
export const TYPE_LABEL: Record<ProblemType, string> = {
  basura: 'Basura acumulada', contenedor: 'Contenedor desbordado', desmonte: 'Desmonte',
};
export function validateDraft(draft: Draft): string | null {
  if (!draft.point) return 'Selecciona un punto de referencia.';
  if (draft.location.trim().length < 5 || draft.location.trim().length > 160) return 'El lugar debe tener entre 5 y 160 caracteres.';
  if (draft.description.trim().length < 10 || draft.description.trim().length > 1000) return 'La descripción debe tener entre 10 y 1000 caracteres.';
  if (!Object.hasOwn(TYPE_LABEL, draft.type)) return 'Selecciona un tipo de problema válido.';
  return null;
}
export function validateDistinctReason(reason: string): boolean {
  return reason.trim().length >= 10 && reason.trim().length <= 300;
}
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message
    : typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'No se pudo completar la operación.';
  if (/Invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(message)) return 'Esta cuenta todavía no tiene el correo confirmado.';
  if (/Failed to fetch|Network request failed|fetch failed/i.test(message)) return 'No hay conexión. Conservamos tus datos; vuelve a intentarlo.';
  if (/relation .* does not exist|Could not find the function|schema cache/i.test(message)) return 'Falta preparar la base de datos. Ejecuta el script de instalación de Supabase.';
  return message;
}
