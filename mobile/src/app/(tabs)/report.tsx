import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { api } from '../../services/api';
import { friendlyError, TYPE_LABEL, validateDistinctReason, validateDraft, type Draft, type Match, type Photo, type Point, type ProblemType } from '../../domain/models';
import { Button, Choice, Field, Message, Screen, StatusBadge, styles, Title } from '../../components/ui';
import { PhotoPicker } from '../../components/PhotoPicker';
import { useSession } from '../../hooks/session';

const emptyDraft: Draft = { point: '', location: '', description: '', type: 'basura', distinctReason: '' };
export default function Report() {
  const { profile } = useSession();
  const [points, setPoints] = useState<Point[]>([]);
  const [draft, setDraft] = useState<Draft>({ ...emptyDraft });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const inFlight = useRef(false);
  const keys = useRef(new Map<string, string>());
  function keyFor(fingerprint: string) {
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, randomUUID());
    return keys.current.get(fingerprint)!;
  }
  const loadPoints = useCallback(async () => {
    try { setPoints(await api.points()); } catch (e) { setError(friendlyError(e)); }
  }, []);
  useFocusEffect(useCallback(() => { void loadPoints(); }, [loadPoints]));
  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    if (inFlight.current || savedId) return;
    setDraft(old => ({ ...old, [field]: value }));
    setError(''); setInfo('');
    if (field === 'point' || field === 'type') setMatches([]);
  }
  function reset() {
    setDraft({ ...emptyDraft }); setPhoto(null); setSavedId(null); setMatches([]); setInfo(''); setError(''); keys.current.clear();
  }
  function finish(id: string) { reset(); router.push({ pathname: '/incident/[id]', params: { id } }); }
  async function save(existingId?: string) {
    if (inFlight.current || !profile) return;
    if (!savedId && !existingId) {
      const validation = validateDraft(draft);
      if (validation) { setError(validation); return; }
      if (matches.length && !validateDistinctReason(draft.distinctReason)) {
        setError('Si es otro problema, explica la diferencia con los casos mostrados (10 a 300 caracteres).'); return;
      }
    }
    inFlight.current = true; setBusy(true); setError(''); setInfo('');
    let id = savedId;
    try {
      if (!id && existingId) {
        id = await api.confirm(existingId, keyFor(`confirm:${existingId}`));
      } else if (!id) {
        const result = await api.create(draft, keyFor(JSON.stringify(draft)), matches.map(m => m.id));
        if (result.result === 'matches') {
          setMatches(result.matches ?? []);
          setInfo('Encontramos reportes del mismo punto y tipo. Revisa si se trata del mismo problema.');
          return;
        }
        id = result.id ?? null;
      }
      if (!id) throw new Error('No recibimos confirmación del servidor. Vuelve a intentarlo.');
      setSavedId(id);
      if (photo) {
        const path = await api.upload(profile.id, id, 'reporte', photo);
        await api.attach(id, path);
      }
      finish(id);
    } catch (e) {
      setError(`${id ? 'El reporte o aporte está guardado, pero la foto no quedó confirmada. Puedes reintentar solo la fotografía o abrir el caso. ' : ''}${friendlyError(e)}`);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <Screen bottomSafeArea={false}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Title title="Reportar un problema" description="Elige el punto y describe lo que observaste. Tu foto puede ayudar a ubicarlo." />
      <Message text="Si alguien ya reportó el mismo problema, suma tu confirmación y tu foto al caso existente. Al guardar revisaremos los casos abiertos del punto y tipo elegidos." />
      <Message text={error} error /><Message text={info} />
      {!points.length ? <Button label="Cargar puntos de referencia" secondary busy={busy} onPress={() => void loadPoints()} /> : null}
      <View pointerEvents={busy || savedId ? 'none' : 'auto'} style={{ gap: 14, opacity: savedId ? 0.65 : 1 }}>
        <Text style={styles.label}>Punto de referencia</Text>
        {points.map(point => <Choice key={point.id} label={point.name} selected={draft.point === point.id} onPress={() => update('point', point.id)} />)}
        {draft.point ? <Text style={styles.subtitle}>{points.find(p => p.id === draft.point)?.reference}</Text> : null}
        <Field label="Lugar exacto o referencia" placeholder="Ej. junto a la entrada, lado de la avenida" maxLength={160} value={draft.location} onChangeText={v => update('location', v)} editable={!busy && !savedId} />
        <Text style={styles.label}>Tipo de problema</Text><View style={styles.row}>{(Object.keys(TYPE_LABEL) as ProblemType[]).map(type =>
          <Choice key={type} label={TYPE_LABEL[type]} selected={draft.type === type} onPress={() => update('type', type)} />)}</View>
        <Field label="Descripción" placeholder="Qué residuos hay y cómo se encuentra el lugar" multiline maxLength={1000} value={draft.description} onChangeText={v => update('description', v)} editable={!busy && !savedId} />
        <PhotoPicker value={photo} onChange={setPhoto} disabled={busy || Boolean(savedId)} />
      </View>
      {matches.length && !savedId ? <View style={{ gap: 12 }}>
        <Text style={styles.heading}>¿Es uno de estos problemas?</Text>
        {matches.map(match => <View key={match.id} style={styles.card}><StatusBadge status={match.status} />
          <Text style={styles.heading}>{match.location_text}</Text><Text style={styles.text}>{match.description}</Text>
          <Button label="Es el mismo: sumar mi aporte" busy={busy} onPress={() => void save(match.id)} />
          <Button label="Ver detalle" secondary disabled={busy} onPress={() => router.push({ pathname: '/incident/[id]', params: { id: match.id } })} />
        </View>)}
        <Field label="Si es otro problema, explica qué lo diferencia" multiline maxLength={300} value={draft.distinctReason} onChangeText={v => update('distinctReason', v)} editable={!busy} />
      </View> : null}
      <Button label={savedId ? 'Reintentar fotografía' : matches.length ? 'Registrar un problema distinto' : 'Comprobar y guardar reporte'} busy={busy}
        disabled={!points.length} onPress={() => void save()} />
      {savedId ? <Button label="Abrir reporte guardado" secondary disabled={busy} onPress={() => finish(savedId)} /> : null}
      <Text style={styles.subtitle}>La app registra el problema y su seguimiento. La atención depende del responsable del piloto.</Text>
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
