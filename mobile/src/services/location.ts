import * as Location from 'expo-location';
import { validCoordinates, type GeoLocation } from '../domain/geo';

export async function getDeviceLocation(): Promise<GeoLocation> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  if (!granted) throw new Error('Sin permiso de ubicación. Puedes elegir el punto en el mapa o escribir sus coordenadas.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Activa la ubicación del teléfono o selecciona el punto manualmente.');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('La ubicación está tardando. Elige el punto en el mapa o inténtalo otra vez.')), 20000); }),
    ]);
    if (!validCoordinates(result.coords)) throw new Error('No se obtuvo una ubicación válida.');
    return { latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy, source: 'gps' };
  } finally { if (timeout) clearTimeout(timeout); }
}
