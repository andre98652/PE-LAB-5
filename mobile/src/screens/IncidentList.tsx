import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../services/api';
import { friendlyError, STATUS_LABEL, TYPE_LABEL, type Incident, type Status, type ProblemType } from '../domain/models';
import { Button, colors, IncidentCard, Message, Screen, styles, Title } from '../components/ui';
import { Disclosure } from '../components/Disclosure';
import { SelectField } from '../components/SelectField';
import { useSession } from '../hooks/session';
import { useRefresh } from '../hooks/useRefresh';
import { supabase } from '../lib/supabase';
import { AreaSelector } from '../components/AreaSelector';
import { useArea } from '../hooks/area';
import type { AreaFilter, AreaMode } from '../domain/geo';

export function IncidentList({ mode }: { mode: 'home' | 'history' | 'work' }) {
  const { profile } = useSession();
  const { center } = useArea();
  const [areaMode, setAreaMode] = useState<AreaMode>(mode === 'home' ? 'nearby' : 'all');
  const [radius, setRadius] = useState(1000);
  const [district, setDistrict] = useState('');
  const filter = useMemo<AreaFilter>(() => ({ mode: areaMode, center, radius, district }), [areaMode, center, radius, district]);
  const [status, setStatus] = useState<Status | null>(mode === 'work' ? 'pendiente' : null);
  const [type, setType] = useState<ProblemType | null>(null);
  const [items, setItems] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const sequence = useRef(0);
  const inFlight = useRef(false);
  const pageOffset = useRef(0);
  const load = useCallback(async (append = false) => {
    if (!profile || (mode === 'work' && profile.role !== 'responsable') || (append && inFlight.current)) return;
    const seq = ++sequence.current;
    if ((filter.mode === 'nearby' && !filter.center) || (filter.mode === 'district' && !filter.district)) {
      setItems([]); setError(''); setHasMore(false); setLoading(false); inFlight.current = false; return;
    }
    inFlight.current = true; setLoading(true); setError('');
    try {
      const page = await api.browse(filter, status, type, append ? pageOffset.current : 0);
      if (seq !== sequence.current) return;
      pageOffset.current = append ? pageOffset.current + page.length : page.length;
      setItems(old => append ? [...old, ...page.filter(row => !old.some(existing => existing.id === row.id))] : page);
      setHasMore(page.length === 20);
    } catch (e) { if (seq === sequence.current) setError(friendlyError(e)); }
    finally { if (seq === sequence.current) { setLoading(false); inFlight.current = false; } }
  }, [mode, profile, status, type, filter]);
  const connectionIssue = useRefresh(load);
  if (mode === 'work' && profile?.role !== 'responsable') return <Screen><View style={styles.content}><Message text="Esta sección está disponible para el responsable de limpieza." /></View></Screen>;
  const title = mode === 'home' ? 'Nuestro barrio' : mode === 'history' ? 'Historial' : 'Bandeja de atención';
  const description = mode === 'home' ? 'Los reportes de tu zona, en un solo lugar.'
    : mode === 'history' ? 'Consulta cómo van los reportes.' : 'Elige un caso para atenderlo.';
  return <Screen bottomSafeArea={false}><FlatList data={items} keyExtractor={item => item.id}
    contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
    refreshing={loading} onRefresh={() => void load()}
    ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><View style={{ flex: 1 }}>
        <Text style={styles.label}>BARRIO LIMPIO</Text><Text style={styles.subtitle}>{profile?.role === 'responsable' ? 'Responsable de limpieza' : 'Comunidad vecinal'}</Text></View>
        <Button secondary label="Salir" onPress={() => { void supabase.auth.signOut().then(({ error: e }) => { if (e) setError(friendlyError(e)); }); }} /></View>
      <Title title={title} description={description} />
      {mode === 'home' ? <Button label="Nuevo reporte" onPress={() => router.push('/report')} /> : null}
      <AreaSelector mode={areaMode} radius={radius} district={district} allowAll={mode !== 'home'} onMode={setAreaMode} onRadius={setRadius} onDistrict={setDistrict} />
      <Disclosure title="Filtrar reportes" summary={`${status ? STATUS_LABEL[status] : 'Todos los estados'} · ${type ? TYPE_LABEL[type] : 'Todos los tipos'}`}>
        <SelectField<Status | null> label="Estado" value={status} onChange={setStatus} options={[
          ...(mode !== 'work' ? [{ value: null, label: 'Todos los estados' }] : []),
          ...(Object.keys(STATUS_LABEL) as Status[]).filter(s => mode !== 'work' || s !== 'solucionado').map(s => ({ value: s, label: STATUS_LABEL[s] })),
        ]} />
        <SelectField<ProblemType | null> label="Tipo de problema" value={type} onChange={setType} options={[
          { value: null, label: 'Todos los tipos' }, ...(Object.keys(TYPE_LABEL) as ProblemType[]).map(t => ({ value: t, label: TYPE_LABEL[t] })),
        ]} />
        <Button label="Restablecer filtros" secondary onPress={() => { setStatus(mode === 'work' ? 'pendiente' : null); setType(null); }} />
      </Disclosure>
      <Message text={error} error />{error ? <Button label="Reintentar" secondary onPress={() => void load()} /> : null}
      {connectionIssue ? <Message text="La actualización automática está desconectada. Desliza para actualizar los datos." /> : null}
    </View>}
    ListEmptyComponent={loading ? <ActivityIndicator color={colors.green} /> : error ? undefined :
      <View style={styles.card}><Text style={styles.heading}>{areaMode === 'nearby' && !center ? 'Selecciona dónde buscar' : areaMode === 'district' && !district ? 'Selecciona un distrito' : 'No hay reportes con estos filtros'}</Text>
        <Text style={styles.subtitle}>Puedes ajustar la zona o el radio, revisar los casos antiguos sin ubicación o registrar un problema.</Text></View>}
    renderItem={({ item }) => <IncidentCard incident={item} />}
    ListFooterComponent={hasMore ? <View style={{ paddingTop: 16 }}><Button label="Ver más reportes" secondary busy={loading} onPress={() => void load(true)} /></View> : undefined} />
  </Screen>;
}

