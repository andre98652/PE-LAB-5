export type Coordinates = { latitude: number; longitude: number };
export type GeoLocation = Coordinates & { source: 'gps' | 'mapa' | 'manual'; accuracy: number | null };
export type AreaMode = 'nearby' | 'district' | 'unlocated' | 'all';
export type AreaFilter = { mode: AreaMode; center: Coordinates | null; radius: number; district: string };
export const MATCH_RADIUS_METERS = 30;
export const INITIAL_MAP_CENTER: Coordinates = { latitude: -12.0464, longitude: -77.0428 };

export function validCoordinates(value: unknown): value is Coordinates {
  if (typeof value !== 'object' || value === null || !('latitude' in value) || !('longitude' in value)) return false;
  return typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
export function parseCoordinates(latitude: string, longitude: string): Coordinates | null {
  if (!latitude.trim() || !longitude.trim()) return null;
  const point = { latitude: Number(latitude.trim().replace(',', '.')), longitude: Number(longitude.trim().replace(',', '.')) };
  return validCoordinates(point) ? point : null;
}
export function distanceLabel(distance: number | null | undefined): string {
  if (distance == null || !Number.isFinite(distance)) return 'Sin distancia';
  return distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`;
}
export function normalizeDistrict(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
