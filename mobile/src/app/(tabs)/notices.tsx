import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../services/api';
import { friendlyError, type Notice } from '../../domain/models';
import { useRefresh } from '../../hooks/useRefresh';
import { Button, formatDate, Message, Screen, styles, Title } from '../../components/ui';
export default function Notices() {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems(await api.notices()); } catch (e) { setError(friendlyError(e)); } finally { setLoading(false); }
  }, []);
  const connectionIssue = useRefresh(load);
  async function open(item: Notice) {
    try { await api.read(item.id); setItems(old => old.map(n => n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)); }
    catch (e) { setError(friendlyError(e)); }
    router.push({ pathname: '/incident/[id]', params: { id: item.incident_id } });
  }
  return <Screen bottomSafeArea={false}><FlatList data={items} keyExtractor={item => item.id} refreshing={loading} onRefresh={() => void load()}
    contentContainerStyle={styles.content} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
    ListHeaderComponent={<View style={{ gap: 12, paddingBottom: 16 }}><Title title="Tus avisos" description="Consulta los cambios y abre cada caso para ver su seguimiento." />
      <Message text={error} error />{error ? <Button label="Reintentar" onPress={() => void load()} secondary /> : null}
      {connectionIssue ? <Message text="Sin actualización automática. Desliza para consultar los avisos guardados." /> : null}</View>}
    ListEmptyComponent={!loading && !error ? <Message text="Todavía no tienes avisos. Aparecerán aquí cuando cambie un caso en el que participas." /> : undefined}
    renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => void open(item)} style={styles.card}>
      <Text style={styles.label}>{item.read_at ? 'LEÍDO' : 'NUEVO'}</Text><Text style={styles.heading}>{
        item.event_type === 'nuevo' ? 'Hay un nuevo caso por atender' : item.event_type === 'en_proceso' ? 'Tu reporte está en proceso' : 'Tu reporte fue solucionado'}</Text>
      <Text style={styles.subtitle}>{formatDate(item.created_at)} · Ver detalle</Text></Pressable>} />
  </Screen>;
}
