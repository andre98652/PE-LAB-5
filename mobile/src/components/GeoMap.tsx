import { useMemo } from 'react';
import { WebView } from 'react-native-webview';
import { Linking } from 'react-native';
import { mapDocument, type MapProps } from './mapDocument';
import { validCoordinates } from '../domain/geo';

export default function GeoMap({ center, marker, interactive, onSelect }: MapProps) {
  const html = useMemo(() => mapDocument({ center, marker, interactive }), [center, marker, interactive]);
  return <WebView style={{ height: 260, backgroundColor: '#E8EDE5' }} originWhitelist={['*']}
    source={{ html, baseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://supabase.com/' }}
    applicationNameForUserAgent="BarrioLimpio/1.0 (pe.barriolimpio.app)"
    cacheEnabled javaScriptEnabled scrollEnabled={false} setSupportMultipleWindows={false}
    onShouldStartLoadWithRequest={request => {
      if (request.url.startsWith('https://www.openstreetmap.org/')) {
        void Linking.openURL(request.url).catch(() => {}); return false;
      }
      return request.url === 'about:blank' || request.url === process.env.EXPO_PUBLIC_SUPABASE_URL || request.url === `${process.env.EXPO_PUBLIC_SUPABASE_URL}/`;
    }}
    onMessage={event => {
      try {
        const data: unknown = JSON.parse(event.nativeEvent.data);
        if (interactive && validCoordinates(data) && 'type' in data && data.type === 'select') onSelect?.(data);
      } catch { /* El puente solo acepta coordenadas válidas. */ }
    }} />;
}
