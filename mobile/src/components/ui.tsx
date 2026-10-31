import { useEffect, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api } from '../services/api';
import { STATUS_LABEL, TYPE_LABEL, type Incident, type Status } from '../domain/models';

export const colors = { green: '#174B3D', accent: '#D6E7B0', background: '#F5F6F1', white: '#FFFFFF',
  ink: '#1E3029', muted: '#64736A', line: '#DCE3DA', error: '#A23232' };
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.7 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.muted },
  heading: { fontSize: 19, fontWeight: '700', color: colors.ink },
  text: { fontSize: 15, lineHeight: 23, color: colors.ink },
  label: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 7 },
  input: { backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 12,
    padding: 14, fontSize: 16, color: colors.ink, minHeight: 48 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: colors.line, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  button: { minHeight: 48, borderRadius: 12, backgroundColor: colors.green, paddingVertical: 12,
    paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15, textAlign: 'center' },
  secondary: { backgroundColor: '#E8EDE5' },
  pill: { paddingHorizontal: 13, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E8EDE5', minHeight: 44, justifyContent: 'center' },
  selected: { backgroundColor: colors.green },
  note: { padding: 14, borderRadius: 12, backgroundColor: '#E8EDE5', gap: 8 },
});
export function Screen({ children, bottomSafeArea = true }: PropsWithChildren<{ bottomSafeArea?: boolean }>) {
  // Las pestañas ya reservan su margen inferior; las pantallas del Stack no.
  return <SafeAreaView edges={bottomSafeArea ? ['top', 'left', 'right', 'bottom'] : ['top', 'left', 'right']}
    style={styles.screen}>{children}</SafeAreaView>;
}
export function Title({ title, description }: { title: string; description?: string }) {
  return <View style={{ gap: 6 }}><Text style={styles.title}>{title}</Text>{description ? <Text style={styles.subtitle}>{description}</Text> : null}</View>;
}
export function Button({ label, onPress, busy = false, disabled = false, secondary = false }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, { opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1 }]}>
    {busy ? <ActivityIndicator color={secondary ? colors.green : colors.white} /> :
      <Text style={[styles.buttonText, secondary && { color: colors.green }]}>{label}</Text>}
  </Pressable>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label}
    placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 108, textAlignVertical: 'top' }, props.style]} /></View>;
}
export function Message({ text, error = false }: { text: string; error?: boolean }) {
  if (!text) return null;
  return <View accessibilityLiveRegion="polite" style={[styles.note, error && { backgroundColor: '#FBECEC' }]}>
    <Text style={[styles.text, error && { color: colors.error }]}>{text}</Text></View>;
}
export function StatusBadge({ status }: { status: Status }) {
  const palette = { pendiente: ['#FFF1D7', '#775410'], en_proceso: ['#E8EFF7', '#35577F'], solucionado: ['#E2EFDC', '#2E6339'] }[status];
  return <View style={{ backgroundColor: palette[0], borderRadius: 7, paddingVertical: 5, paddingHorizontal: 9, alignSelf: 'flex-start' }}>
    <Text style={{ fontSize: 12, fontWeight: '700', color: palette[1] }}>{STATUS_LABEL[status]}</Text></View>;
}
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[styles.pill, selected && styles.selected]}><Text style={{ color: selected ? colors.white : colors.green, fontWeight: '600' }}>{label}</Text></Pressable>;
}
export function RemotePhoto({ path, label }: { path: string; label: string }) {
  const [result, setResult] = useState({ path: '', uri: '', failed: false });
  const uri = result.path === path ? result.uri : '';
  const failed = result.path === path && result.failed;
  useEffect(() => {
    let alive = true;
    void api.photoUrl(path).then(value => { if (alive) setResult({ path, uri: value, failed: false }); })
      .catch(() => { if (alive) setResult({ path, uri: '', failed: true }); });
    return () => { alive = false; };
  }, [path]);
  return uri ? <Image accessibilityLabel={label} source={{ uri }} onError={() => setResult({ path, uri: '', failed: true })}
    style={{ width: '100%', height: 190, borderRadius: 10, backgroundColor: colors.line }} resizeMode="cover" />
    : <View style={{ minHeight: 72, justifyContent: 'center' }}><Text style={styles.subtitle}>{failed ? 'No se pudo cargar la fotografía. Actualiza para reintentar.' : 'Cargando fotografía…'}</Text></View>;
}
export function IncidentCard({ incident }: { incident: Incident }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Ver reporte: ${incident.location_text}`}
    onPress={() => router.push({ pathname: '/incident/[id]', params: { id: incident.id } })} style={styles.card}>
    <StatusBadge status={incident.status} />
    <Text style={styles.heading}>{incident.location_text}</Text>
    <Text style={styles.subtitle}>{incident.point_name} · {TYPE_LABEL[incident.problem_type]}</Text>
    {incident.photo_path ? <RemotePhoto path={incident.photo_path} label="Fotografía del reporte" /> : null}
    <Text style={styles.text} numberOfLines={2}>{incident.description}</Text>
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <Text style={styles.subtitle}>{incident.participants} {incident.participants === 1 ? 'vecino confirma' : 'vecinos confirman'}</Text>
      <Text style={styles.subtitle}>{formatDate(incident.created_at)}</Text>
    </View>
  </Pressable>;
}
export function formatDate(value: string) {
  return new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
