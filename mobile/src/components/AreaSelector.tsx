import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Message, styles } from './ui';
import { Disclosure } from './Disclosure';
import { SelectField } from './SelectField';
import { DistrictField } from './DistrictField';
import { LocationPicker } from './LocationPicker';
import { useArea } from '../hooks/area';
import { api } from '../services/api';
import { friendlyError } from '../domain/models';
import { distanceLabel, type AreaMode } from '../domain/geo';

export function AreaSelector({ mode, radius, district, allowAll, onMode, onRadius, onDistrict }: {
  mode: AreaMode; radius: number; district: string; allowAll: boolean;
  onMode: (mode: AreaMode) => void; onRadius: (radius: number) => void; onDistrict: (district: string) => void;
}) {
  const { center, setCenter } = useArea();
  const [choosing, setChoosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState(district);
  const [districts, setDistricts] = useState<string[]>([]);
  const [error, setError] = useState('');
  useFocusEffect(useCallback(() => {
    let alive = true;
    void api.districts().then(data => { if (alive) { setDistricts(data); setError(''); } }).catch(e => { if (alive) setError(friendlyError(e)); });
    return () => { alive = false; };
  }, []));
  const summary = mode === 'nearby' ? center ? `Hasta ${distanceLabel(radius)} del punto elegido` : 'Elige tu zona'
    : mode === 'district' ? district || 'Elige un distrito' : mode === 'all' ? 'Todas las incidencias' : 'Reportes sin ubicación';
  return <View style={{ gap: 10 }}>
    <Disclosure title="Zona de búsqueda" summary={summary} open={expanded} onToggle={() => setExpanded(value => !value)}>
    <SelectField<AreaMode> label="Buscar por" value={mode} onChange={onMode} options={[
      { value: 'nearby', label: 'Cerca de un lugar' }, { value: 'district', label: 'Distrito' },
      ...(allowAll ? [{ value: 'all' as const, label: 'Todas las incidencias' }] : []), { value: 'unlocated', label: 'Reportes antiguos sin ubicación' },
    ]} />
    {mode === 'nearby' ? <>
      <SelectField<number> label="Distancia máxima" value={radius} options={[500, 1000, 2000, 5000].map(value => ({ value, label: distanceLabel(value) }))} onChange={onRadius} />
      <Button label={choosing ? 'Cerrar mapa' : center ? 'Cambiar lugar' : 'Elegir lugar'} secondary onPress={() => setChoosing(value => !value)} />
      {choosing ? <LocationPicker title="Centro de búsqueda" value={center} initial={center} onChange={point => { setCenter(point); setChoosing(false); }} /> : null}
    </> : null}
    {mode === 'district' ? <>
      <DistrictField value={text} onChange={setText} options={districts} />
      <Button label="Aplicar distrito" secondary disabled={text.trim().length < 3} onPress={() => onDistrict(text.trim())} />
      {district ? <Text style={styles.subtitle}>Filtro aplicado: {district}</Text> : null}
    </> : null}
    {mode === 'unlocated' ? <Message text="Estos reportes se crearon antes de incorporar coordenadas. Su creador o un responsable puede ubicarlos desde el detalle; no se les asignó una ubicación ficticia." /> : null}
    </Disclosure>
    {mode === 'nearby' && !center && !expanded ? <Button label="Elegir mi zona" secondary onPress={() => { setExpanded(true); setChoosing(true); }} /> : null}
    <Message text={error} error />
  </View>;
}
