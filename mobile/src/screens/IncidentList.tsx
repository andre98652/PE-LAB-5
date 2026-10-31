import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../services/api';
import { friendlyError, STATUS_LABEL, TYPE_LABEL, type Incident, type Status, type ProblemType } from '../domain/models';
import { Button, Choice, colors, IncidentCard, Message, Screen, styles, Title } from '../components/ui';
import { useSession } from '../hooks/session';
import { useRefresh } from '../hooks/useRefresh';
import { supabase } from '../lib/supabase';

export function IncidentList({ mode }: { mode: 'home' | 'history' | 'work' }) {
  const { profile } = useSession();
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
    inFlight.current = true; setLoading(true); setError('');
    try {
      const page = await api.list(status, type, append ? pageOffset.current : 0);
      if (seq !== sequence.current) return;
      pageOffset.current = append ? pageOffset.current + page.length : page.length;
      setItems(old => append ? [...old, ...page.filter(row => !old.some(existing => existing.id === row.id))] : page);
      setHasMore(page.length === 20);
    } catch (e) { if (seq === sequence.current) setError(friendlyError(e)); }
    finally { if (seq === sequence.current) { setLoading(false); inFlight.current = false; } }
  }, [mode, profile, status, type]);
  const connectionIssue = useRefresh(load);
  if (mode === 'work' && profile?.role !== 'responsable') return <Screen><View style={styles.content}><Message text="Esta sección está disponible para el responsable de limpieza." /></View></Screen>;
  const title = mode === 'home' ? 'Nuestro barrio' : mode === 'history' ? 'Historial' : 'Bandeja de atención';
  const description = mode === 'home' ? 'Cada reporte reúne a los vecinos que observan el mismo problema.'
    : mode === 'history' ? 'Consulta los casos y el seguimiento de su atención.' : 'Abre un caso para aceptarlo y registrar su solución.';
  return <Screen bottomSafeArea={false}><FlatList data={items} keyExtractor={item => item.id}
    contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
    refreshing={loading} onRefresh={() => void load()}
    ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 16 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}><Text style={styles.subtitle}>BARRIO LIMPIO · {profile?.role === 'responsable' ? 'RESPONSABLE' : 'VECINO'}</Text>
        <Button secondary label="Salir" onPress={() => { void supabase.auth.signOut().then(({ error: e }) => { if (e) setError(friendlyError(e)); }); }} /></View>
      <Title title={title} description={description} />
      {mode === 'home' ? <Button label="Registrar un problema" onPress={() => router.push('/report')} /> : null}
      <Text style={styles.label}>Estado</Text><View style={styles.row}>
        {mode !== 'work' ? <Choice label="Todos" selected={status === null} onPress={() => setStatus(null)} /> : null}
        {(Object.keys(STATUS_LABEL) as Status[]).filter(s => mode !== 'work' || s !== 'solucionado').map(s =>
          <Choice key={s} label={STATUS_LABEL[s]} selected={status === s} onPress={() => setStatus(s)} />)}
      </View>
      <Text style={styles.label}>Tipo de problema</Text><View style={styles.row}><Choice label="Todos" selected={type === null} onPress={() => setType(null)} />
        {(Object.keys(TYPE_LABEL) as ProblemType[]).map(t => <Choice key={t} label={TYPE_LABEL[t]} selected={type === t} onPress={() => setType(t)} />)}</View>
      <Message text={error} error />{error ? <Button label="Reintentar" secondary onPress={() => void load()} /> : null}
      {connectionIssue ? <Message text="La actualización automática está desconectada. Desliza para actualizar los datos." /> : null}
    </View>}
    ListEmptyComponent={loading ? <ActivityIndicator color={colors.green} /> : error ? undefined :
      <View style={styles.card}><Text style={styles.heading}>No hay reportes con estos filtros</Text><Text style={styles.subtitle}>Puedes cambiar los filtros o registrar el primer problema del barrio.</Text></View>}
    renderItem={({ item }) => <IncidentCard incident={item} />}
    ListFooterComponent={hasMore ? <View style={{ paddingTop: 16 }}><Button label="Ver más reportes" secondary busy={loading} onPress={() => void load(true)} /></View> : undefined} />
  </Screen>;
}

