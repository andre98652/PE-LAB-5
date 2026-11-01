import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import type { GeoLocation } from '../domain/geo';
import { useSession } from './session';

const AreaContext = createContext<{ center: GeoLocation | null; setCenter: (point: GeoLocation | null) => void }>({ center: null, setCenter: () => {} });
export function AreaProvider({ children }: PropsWithChildren) {
  // Centro de búsqueda en memoria; no se guarda un historial de ubicación del vecino.
  const { session } = useSession();
  const owner = session?.user.id ?? null;
  const [selection, setSelection] = useState<{ owner: string | null; center: GeoLocation | null }>({ owner: null, center: null });
  const center = selection.owner === owner ? selection.center : null;
  const setCenter = (point: GeoLocation | null) => setSelection({ owner, center: point });
  return <AreaContext.Provider value={{ center, setCenter }}>{children}</AreaContext.Provider>;
}
export const useArea = () => useContext(AreaContext);
