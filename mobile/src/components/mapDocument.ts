import { INITIAL_MAP_CENTER, validCoordinates, type Coordinates } from '../domain/geo.ts';

export type MapProps = { center: Coordinates; marker: Coordinates | null; interactive: boolean; onSelect?: (point: Coordinates) => void };
export function mapDocument(props: Omit<MapProps, 'onSelect'>): string {
  const center = validCoordinates(props.center) ? props.center : INITIAL_MAP_CENTER;
  const marker = validCoordinates(props.marker) ? props.marker : null;
  // Solo valores numéricos validados se interpolan; nunca textos o credenciales del usuario.
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>html,body,#map{margin:0;width:100%;height:100%;font-family:system-ui}#error{display:none;position:absolute;top:12px;left:50px;right:12px;background:white;padding:10px;z-index:1000;font-size:12px}.leaflet-control-attribution{font-size:10px}</style></head>
  <body><div id="map" aria-label="Mapa de ubicación de la basura"></div><div id="error">No se pudo cargar el mapa. Puedes usar GPS o ingresar las coordenadas debajo.</div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onerror="document.getElementById('error').style.display='block'"></script>
  <script>if(window.L){const map=L.map('map',{scrollWheelZoom:false}).setView([${center.latitude},${center.longitude}],${marker ? 17 : 13});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',keepBuffer:0,updateWhenIdle:true}).addTo(map).on('tileerror',function(){document.getElementById('error').style.display='block'});
  let pin=${marker ? `L.circleMarker([${marker.latitude},${marker.longitude}],{radius:10,color:'#174B3D',fillOpacity:.8}).addTo(map)` : 'null'};
  function pick(e){if(pin)pin.remove();pin=L.circleMarker(e.latlng,{radius:10,color:'#174B3D',fillOpacity:.8}).addTo(map);const payload=JSON.stringify({type:'select',latitude:e.latlng.lat,longitude:((e.latlng.lng+180)%360+360)%360-180});
  if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(payload);else window.parent.postMessage(payload,'*');}
  ${props.interactive ? "map.on('click',pick);" : ''}
  }else document.getElementById('error').style.display='block';</script></body></html>`;
}
