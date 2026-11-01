import { useEffect, useMemo, useRef } from 'react';
import { mapDocument, type MapProps } from './mapDocument';
import { validCoordinates } from '../domain/geo';

export default function GeoMap({ center, marker, interactive, onSelect }: MapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => mapDocument({ center, marker, interactive }), [center, marker, interactive]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!interactive || event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      try {
        const data: unknown = JSON.parse(event.data);
        if (validCoordinates(data) && 'type' in data && data.type === 'select') onSelect?.(data);
      } catch { /* Ignorar mensajes que no sean coordenadas del mapa. */ }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [interactive, onSelect]);
  return <iframe ref={frame} title="Mapa de ubicación de la basura" srcDoc={html} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
    referrerPolicy="strict-origin-when-cross-origin" style={{ border: 0, width: '100%', height: 260, borderRadius: 12 }} />;
}
