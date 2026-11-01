import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import GeoMap from './GeoMap';
import { Button, Field, Message, styles } from './ui';
import { friendlyError } from '../domain/models';
import { INITIAL_MAP_CENTER, parseCoordinates, type Coordinates, type GeoLocation } from '../domain/geo';
import { getDeviceLocation } from '../services/location';
import { Disclosure } from './Disclosure';

export function LocationPicker({ value, onChange, onEdit, initial, disabled = false, title = 'Ubicación de la basura' }: {
  value: GeoLocation | null; onChange: (location: GeoLocation) => void; onEdit?: () => void; initial?: Coordinates | null; disabled?: boolean; title?: string;
}) {
  const [draft, setDraft] = useState<GeoLocation | null>(value);
  const [lat, setLat] = useState(value?.latitude.toFixed(6) ?? '');
  const [lon, setLon] = useState(value?.longitude.toFixed(6) ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!value);
  const request = useRef(0);
  function select(location: GeoLocation) {
    request.current++;
    onEdit?.();
    setDraft(location); setLat(location.latitude.toFixed(6)); setLon(location.longitude.toFixed(6)); setError('');
  }
  async function gps() {
    if (busy) return;
    const current = ++request.current;
    setBusy(true); setError('');
    try { const location = await getDeviceLocation(); if (current === request.current) select(location); }
    catch (e) { if (current === request.current) setError(friendlyError(e)); }
    finally { setBusy(false); }
  }
  function applyCoordinates() {
    const point = parseCoordinates(lat, lon);
    if (!point) { setError('Ingresa latitud entre −90 y 90 y longitud entre −180 y 180.'); return; }
    select({ ...point, source: 'manual', accuracy: null });
  }
  return <Disclosure title={title} summary={value ? 'Punto confirmado · Toca para cambiar' : 'Elige y confirma un punto'} open={editing} onToggle={() => setEditing(value => !value)}>
    <Text style={styles.subtitle}>Toca el lugar exacto donde está la basura.</Text>
    <Button label="Usar mi ubicación" secondary busy={busy} disabled={disabled} onPress={() => void gps()} />
    <View pointerEvents={disabled ? 'none' : 'auto'} style={{ height: 260, borderRadius: 12, overflow: 'hidden' }}>
      <GeoMap center={draft ?? initial ?? INITIAL_MAP_CENTER} marker={draft} interactive={!disabled}
        onSelect={point => select({ ...point, source: 'mapa', accuracy: null })} />
    </View>
    {!draft ? <Text style={styles.subtitle}>El mapa es una referencia. Tócalo para elegir el lugar.</Text> : null}
    {draft?.accuracy != null ? <Message text={`Precisión GPS aproximada: ${Math.round(draft.accuracy)} m.${draft.accuracy > 30 ? ' Ajusta el punto en el mapa antes de confirmarlo.' : ' Verifica que corresponda al lugar.'}`} /> : null}
    <Disclosure title="Ingresar coordenadas" summary="Opcional, si no puedes usar el mapa">
    <Field label="Latitud" value={lat} onChangeText={text => { onEdit?.(); setLat(text); }} placeholder="Ej. -12.046400" keyboardType="numbers-and-punctuation" editable={!disabled && !busy} />
    <Field label="Longitud" value={lon} onChangeText={text => { onEdit?.(); setLon(text); }} placeholder="Ej. -77.042800" keyboardType="numbers-and-punctuation" editable={!disabled && !busy} />
    <Button label="Aplicar coordenadas" secondary disabled={disabled || busy} onPress={applyCoordinates} />
    </Disclosure>
    <Message text={error} error />
    <Button label="Confirmar este punto" disabled={disabled || busy || !draft} onPress={() => {
      if (!draft) return;
      const fields = parseCoordinates(lat, lon);
      if (!fields || Math.abs(fields.latitude - draft.latitude) > 0.000001 || Math.abs(fields.longitude - draft.longitude) > 0.000001) {
        setError('Pulsa Aplicar coordenadas antes de confirmar los valores editados.'); return;
      }
      onChange(draft);
      setEditing(false);
    }} />
  </Disclosure>;
}
