import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { api } from '../../services/api';
import { friendlyError, TYPE_LABEL, validateDistinctReason, validateGeoDraft, type GeoDraft, type Match, type Photo, type ProblemType } from '../../domain/models';
import { Button, colors, Field, Message, RemotePhoto, Screen, StatusBadge, styles, Title } from '../../components/ui';
import { Disclosure } from '../../components/Disclosure';
import { SelectField } from '../../components/SelectField';
import { DistrictField } from '../../components/DistrictField';
import { PhotoPicker } from '../../components/PhotoPicker';
import { LocationPicker } from '../../components/LocationPicker';
import { distanceLabel, type GeoLocation } from '../../domain/geo';
import { useSession } from '../../hooks/session';
import { useArea } from '../../hooks/area';

const emptyDraft: GeoDraft = { geo: null, district: '', location: '', description: '', type: 'basura', distinctReason: '' };
export default function Report() {
  const { profile } = useSession();
  const { center } = useArea();
  const [draft, setDraft] = useState<GeoDraft>({ ...emptyDraft });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const inFlight = useRef(false);
  const matchRequest = useRef(0);
  const keys = useRef(new Map<string, string>());
  function keyFor(fingerprint: string) {
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, randomUUID());
    return keys.current.get(fingerprint)!;
  }
  useFocusEffect(useCallback(() => {
    let alive = true;
    void api.districts().then(data => { if (alive) setDistricts(data); }).catch(e => { if (alive) setError(friendlyError(e)); });
    return () => { alive = false; };
  }, []));
  async function search(geo: GeoLocation, type: ProblemType) {
    const request = ++matchRequest.current;
    setFinding(true); setError('');
    try {
      const data = await api.nearby(geo, type);
      if (request === matchRequest.current) {
        setMatches(data);
        setInfo(data.length ? 'Ya hay reportes cerca. Revísalos antes de crear otro.' : '');
      }
    } catch (e) { if (request === matchRequest.current) setError(friendlyError(e)); }
    finally { if (request === matchRequest.current) setFinding(false); }
  }
  function update<K extends keyof GeoDraft>(field: K, value: GeoDraft[K]) {
    if (inFlight.current || savedId) return;
    setDraft(old => ({ ...old, [field]: value })); setError('');
    if (field === 'geo' || field === 'type') { matchRequest.current++; setFinding(false); setMatches([]); setInfo(''); }
  }
  function reset() {
    setStep(0);
    matchRequest.current++; setFinding(false);
    setDraft(old => ({ ...emptyDraft, district: old.district })); setPhoto(null); setSavedId(null); setMatches([]); setInfo(''); setError(''); keys.current.clear();
  }
  function finish(id: string) { reset(); router.push({ pathname: '/incident/[id]', params: { id } }); }
  function goTo(next: 0 | 1 | 2) { setStep(next); scroll.current?.scrollTo({ y: 0, animated: true }); }
  function nextStep() {
    setError('');
    if (step === 0) {
      if (!draft.geo) { setError('Confirma el lugar en el mapa para continuar.'); return; }
      goTo(1); return;
    }
    const validation = validateGeoDraft(draft);
    if (validation) { setError(validation); scroll.current?.scrollTo({ y: 0, animated: true }); return; }
    if (matches.length && !validateDistinctReason(draft.distinctReason)) {
      setError('Explica por qué este problema es distinto de los reportes cercanos.'); scroll.current?.scrollTo({ y: 0, animated: true }); return;
    }
    goTo(2);
  }
  async function save(existingId?: string) {
    if (inFlight.current || !profile) return;
    if (!savedId && !existingId) {
      const validation = validateGeoDraft(draft);
      if (validation) { setError(validation); return; }
      if (matches.length && !validateDistinctReason(draft.distinctReason)) {
        setError('Si es otro montón, explica la diferencia con los casos cercanos (10 a 300 caracteres).'); return;
      }
    }
    inFlight.current = true; setBusy(true); setError(''); setInfo('');
    let id = savedId;
    try {
      if (!id && existingId) id = await api.confirm(existingId, keyFor(`confirm:${existingId}`));
      else if (!id) {
        const result = await api.create(draft, keyFor(JSON.stringify(draft)), matches.map(m => m.id));
        if (result.result === 'matches') {
          setMatches(result.matches ?? []); setInfo('Aparecieron reportes cercanos. Revisa si es el mismo problema.'); goTo(0); return;
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
      setError(`${id ? 'El reporte o aporte está guardado, pero la foto no quedó confirmada. Reintenta la fotografía o abre el caso. ' : ''}${friendlyError(e)}`);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <Screen bottomSafeArea={false}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Title title="Nuevo reporte" description={step === 0 ? '¿Dónde está la basura?' : step === 1 ? 'Cuéntanos qué encontraste.' : 'Revisa tu reporte antes de enviarlo.'} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {['Ubicación', 'Detalles', 'Revisar'].map((label, index) => <View key={label} style={{ flex: 1, gap: 7 }}>
          <View style={{ height: 4, borderRadius: 4, backgroundColor: index <= step ? colors.green : colors.line }} />
          <Text style={{ fontSize: 12, color: index === step ? colors.green : colors.muted, fontWeight: index === step ? '700' : '400' }}>{index + 1}. {label}</Text>
        </View>)}
      </View>
      <Message text={error} error /><Message text={info} />
      {step === 0 && !savedId ? <>
      <LocationPicker value={draft.geo} initial={center} disabled={busy || Boolean(savedId)}
        onEdit={() => update('geo', null)} onChange={geo => { update('geo', geo); void search(geo, draft.type); }} />
      <Button label="Revisar reportes cercanos" secondary busy={finding} disabled={!draft.geo || busy || Boolean(savedId)}
        onPress={() => { if (draft.geo) void search(draft.geo, draft.type); }} />
      {matches.length > 0 && !savedId ? <Disclosure title="¿Alguien ya lo reportó?" summary={`${matches.length} posibles coincidencias`} defaultOpen>
        {matches.map(match => <View key={match.id} style={styles.card}><StatusBadge status={match.status} />
          <Text style={styles.heading}>{match.location_text}</Text>
          <Text style={styles.subtitle}>A {distanceLabel(match.distance_m)} · {match.problem_type ? TYPE_LABEL[match.problem_type] : 'Caso abierto'}</Text>
          {match.photo_path ? <RemotePhoto path={match.photo_path} label="Foto del caso cercano" /> : null}
          <Text style={styles.text}>{match.description}</Text>
          <Button label="Es el mismo: sumar mi aporte" busy={busy} onPress={() => void save(match.id)} />
          <Button label="Ver detalle" secondary disabled={busy} onPress={() => router.push({ pathname: '/incident/[id]', params: { id: match.id } })} />
        </View>)}
      </Disclosure> : null}
      </> : null}
      {step === 1 && !savedId ? <>
      <View pointerEvents={busy || savedId ? 'none' : 'auto'} style={{ gap: 14, opacity: savedId ? 0.65 : 1 }}>
        <DistrictField value={draft.district} options={districts} onChange={v => update('district', v)} disabled={busy} />
        <Field label="Lugar exacto o referencia" placeholder="Ej. frente al parque, junto al poste" maxLength={160} value={draft.location} onChangeText={v => update('location', v)} editable={!busy && !savedId} />
        <SelectField<ProblemType> label="Tipo de problema" value={draft.type} disabled={busy}
          options={(Object.keys(TYPE_LABEL) as ProblemType[]).map(type => ({ value: type, label: TYPE_LABEL[type] }))}
          onChange={type => { update('type', type); if (draft.geo) void search(draft.geo, type); }} />
        <Field label="Descripción" placeholder="Qué residuos hay y cómo se encuentra el lugar" multiline maxLength={1000} value={draft.description} onChangeText={v => update('description', v)} editable={!busy && !savedId} />
        <Disclosure title={photo ? 'Fotografía agregada' : 'Agregar una fotografía'} summary="Opcional · Ayuda a identificar el problema">
          <PhotoPicker value={photo} onChange={setPhoto} disabled={busy || Boolean(savedId)} />
        </Disclosure>
        {matches.length > 0 && !savedId ? <Field label="Si es otro problema, explica qué lo diferencia" multiline maxLength={300} value={draft.distinctReason} onChangeText={v => update('distinctReason', v)} editable={!busy} /> : null}
      </View>
      {matches.length > 0 ? <Button label="Volver a ver coincidencias" secondary onPress={() => goTo(0)} /> : null}
      </> : null}
      {step === 2 || savedId ? <>
        <View style={styles.card}>
          <Text style={styles.heading}>{draft.location}</Text><Text style={styles.subtitle}>{draft.district} · {TYPE_LABEL[draft.type]}</Text>
          <Text style={styles.text}>{draft.description}</Text>
          <Text style={styles.subtitle}>Ubicación confirmada en el mapa</Text>
          {photo ? <Image source={{ uri: photo.uri }} accessibilityLabel="Fotografía que se enviará" style={{ height: 150, borderRadius: 12, width: '100%' }} /> : null}
          {draft.distinctReason.trim() ? <Text style={styles.subtitle}>Es otro problema: {draft.distinctReason}</Text> : null}
        </View>
      <Button label={savedId ? 'Reintentar fotografía' : 'Enviar reporte'} busy={busy}
        disabled={finding || (!savedId && !draft.geo)} onPress={() => void save()} />
      {savedId ? <Button label="Abrir reporte guardado" secondary disabled={busy} onPress={() => finish(savedId)} /> : null}
      </> : <Button label={step === 0 && matches.length ? 'Es otro problema · Continuar' : 'Continuar'} busy={finding} disabled={busy || (step === 0 && !draft.geo)} onPress={nextStep} />}
      {step > 0 && !savedId ? <Button label="Volver al paso anterior" secondary disabled={busy} onPress={() => goTo(step === 2 ? 1 : 0)} /> : null}
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
