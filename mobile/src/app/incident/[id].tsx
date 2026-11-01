import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { api } from '../../services/api';
import { friendlyError, STATUS_LABEL, TYPE_LABEL, type IncidentDetail, type Match, type Photo } from '../../domain/models';
import { Button, colors, Field, formatDate, Message, RemotePhoto, Screen, StatusBadge, styles, Title } from '../../components/ui';
import { PhotoPicker } from '../../components/PhotoPicker';
import { useSession } from '../../hooks/session';
import { useRefresh } from '../../hooks/useRefresh';
import { LocationPicker } from '../../components/LocationPicker';
import GeoMap from '../../components/GeoMap';
import { useArea } from '../../hooks/area';
import { distanceLabel, type GeoLocation } from '../../domain/geo';
import { Disclosure } from '../../components/Disclosure';

export default function Detail() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { profile, loading: sessionLoading } = useSession();
  const { center } = useArea();
  const [legacyLocation, setLegacyLocation] = useState<GeoLocation | null>(null);
  const [district, setDistrict] = useState('');
  const [mergeMatches, setMergeMatches] = useState<Match[]>([]);
  const [mergeNote, setMergeNote] = useState('');
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [note, setNote] = useState('');
  const inFlight = useRef(false);
  const keys = useRef(new Map<string, string>());
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!profile || !id) return;
    const seq = ++sequence.current;
    setLoading(true);
    try {
      const data = await api.detail(id);
      if (seq !== sequence.current) return;
      if (data.id !== id) { router.replace({ pathname: '/incident/[id]', params: { id: data.id } }); return; }
      setIncident(data);
    }
    catch (e) { if (seq === sequence.current) setError(friendlyError(e)); }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [id, profile]);
  useRefresh(load);
  function key(fingerprint: string) {
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, randomUUID());
    return keys.current.get(fingerprint)!;
  }
  async function locate() {
    if (!legacyLocation || inFlight.current) return;
    if (district.trim().length < 3) { setError('Confirma el distrito y provincia.'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      await api.locate(id, key(`locate:${id}:${JSON.stringify(legacyLocation)}:${district.trim()}`), legacyLocation, district);
      setInfo('Ubicación guardada. Este reporte ya puede aparecer en las búsquedas cercanas.'); setLegacyLocation(null);
    } catch (e) { setError(friendlyError(e)); }
    finally { await load(); inFlight.current = false; setBusy(false); }
  }
  async function findDuplicates() {
    if (!incident || incident.latitude == null || incident.longitude == null || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const matches = (await api.nearby({ latitude: incident.latitude, longitude: incident.longitude, source: 'manual', accuracy: null }, incident.problem_type)).filter(row => row.id !== id);
      setMergeMatches(matches); setInfo(matches.length ? 'Compara las evidencias y confirma solo si se trata del mismo episodio.' : 'No hay otros casos abiertos a 30 m o menos.');
    } catch (e) { setError(friendlyError(e)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function merge(source: string) {
    if (inFlight.current) return;
    if (mergeNote.trim().length < 10) { setError('Explica por qué ambos reportes representan el mismo problema (10 a 300 caracteres).'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      await api.merge(source, id, mergeNote, key(`merge:${source}:${id}:${mergeNote.trim()}`));
      setMergeMatches([]); setMergeNote(''); setInfo('Reportes unidos. Se conservaron fotos, participantes e historial.');
    } catch (e) { setError(friendlyError(e)); }
    finally { await load(); inFlight.current = false; setBusy(false); }
  }
  async function act(operation: 'confirm' | 'accept' | 'photo' | 'resolve') {
    if (!incident || !profile || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setInfo('');
    try {
      if (operation === 'confirm') await api.confirm(id, key(`confirm:${id}`));
      if (operation === 'accept') await api.accept(incident, key(`accept:${id}:${incident.version}`));
      if (operation === 'photo' || operation === 'resolve') {
        if (!photo) throw new Error('Selecciona una fotografía antes de continuar.');
        if (operation === 'resolve' && (note.trim().length < 10 || note.trim().length > 1000)) throw new Error('Describe la solución con 10 a 1000 caracteres.');
        const path = await api.upload(profile.id, id, operation === 'resolve' ? 'solucion' : 'reporte', photo);
        if (operation === 'photo') await api.attach(id, path);
        else await api.resolve(incident, note, path, key(`resolve:${id}:${incident.version}:${path}:${note.trim()}`));
        setPhoto(null); setNote('');
      }
      setInfo(operation === 'confirm' ? 'Tu confirmación quedó registrada una sola vez.' : operation === 'accept' ? 'Aceptaste el caso. Ahora está en proceso.'
        : operation === 'photo' ? 'Fotografía adjuntada.' : 'Caso solucionado. Se guardaron los avisos para los vecinos.');
    } catch (e) { setError(friendlyError(e)); }
    finally { await load(); inFlight.current = false; setBusy(false); }
  }
  if (sessionLoading) return <Screen><ActivityIndicator color={colors.green} style={{ margin: 60 }} /></Screen>;
  if (!profile) return <Redirect href="/login" />;
  const canResolve = incident?.status === 'en_proceso' && incident.assigned_to_me && profile.role === 'responsable';
  const primaryPhoto = incident?.photos.find(photo => photo.kind === 'solucion') ?? incident?.photos[0];
  return <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.row}><Button label="Volver" secondary onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/home'); }} />
        <Button label="Actualizar" secondary busy={loading} disabled={busy} onPress={() => { setError(''); void load(); }} /></View>
      <Message text={error} error /><Message text={info} />
      {!incident && loading ? <ActivityIndicator color={colors.green} /> : null}
      {incident ? <>
        <StatusBadge status={incident.status} /><Title title={incident.location_text} description={incident.point_name} />
        {incident.latitude != null && incident.longitude != null ? <Disclosure title="Ver ubicación en el mapa" summary={incident.district ?? incident.point_name}>
          <View style={{ height: 260, borderRadius: 12, overflow: 'hidden' }}><GeoMap center={{ latitude: incident.latitude, longitude: incident.longitude }} marker={{ latitude: incident.latitude, longitude: incident.longitude }} interactive={false} /></View>
        </Disclosure> : <Disclosure title="Ubicación pendiente" summary="Este reporte todavía no tiene un punto en el mapa">
          {incident.can_set_location ? <View style={{ gap: 12 }}>
            <LocationPicker value={legacyLocation} initial={center} onChange={setLegacyLocation} onEdit={() => setLegacyLocation(null)} disabled={busy} />
            <Field label="Distrito y provincia del reporte antiguo" value={district} maxLength={120} onChangeText={setDistrict} editable={!busy} />
            <Button label="Guardar ubicación de este reporte" busy={busy} disabled={!legacyLocation} onPress={() => void locate()} />
          </View> : null}
        </Disclosure>}
        <View style={styles.card}><Text style={styles.label}>{TYPE_LABEL[incident.problem_type]}</Text><Text style={styles.text}>{incident.description}</Text>
          <Text style={styles.subtitle}>Registrado: {formatDate(incident.created_at)}</Text>
          <Text style={styles.heading}>{incident.participants} {incident.participants === 1 ? 'vecino confirma' : 'vecinos confirman'}</Text>
          {incident.distinct_reason ? <Text style={styles.subtitle}>Problema distinto: {incident.distinct_reason}</Text> : null}</View>
        {primaryPhoto ? <View style={styles.card}>
          <Text style={styles.label}>{primaryPhoto.kind === 'solucion' ? 'ASÍ QUEDÓ EL LUGAR' : 'FOTOGRAFÍA DEL REPORTE'}</Text>
          <RemotePhoto key={`${primaryPhoto.object_path}:${incident.updated_at}`} path={primaryPhoto.object_path} label="Fotografía principal del caso" />
        </View> : null}
        {incident.photos.length > 1 ? <Disclosure title="Más fotografías" summary={`${incident.photos.length - 1} imágenes de los vecinos y de la atención`}>
        {incident.photos.filter(photo => photo.id !== primaryPhoto?.id).map(evidence => <View key={evidence.id} style={{ gap: 10 }}>
          <Text style={styles.label}>{evidence.kind === 'solucion' ? 'EVIDENCIA DE SOLUCIÓN' : 'FOTOGRAFÍA DEL REPORTE'}</Text>
          <RemotePhoto key={`${evidence.object_path}:${incident.updated_at}`} path={evidence.object_path} label={evidence.kind === 'solucion' ? 'Fotografía de la limpieza realizada' : 'Fotografía del problema'} /></View>)}
        </Disclosure> : null}
        {incident.status !== 'solucionado' && !incident.has_contributed ?
          <Button label="También lo vi" secondary={profile.role === 'responsable'} busy={busy} onPress={() => void act('confirm')} /> : null}
        {incident.has_contributed ? <Text style={styles.subtitle}>Ya confirmaste este reporte. Te avisaremos cuando cambie.</Text> : null}
        {incident.status === 'pendiente' && profile.role === 'responsable' ?
          <Button label="Atender este reporte" busy={busy} onPress={() => void act('accept')} /> : null}
        {incident.status === 'en_proceso' ? <Message text={incident.assigned_to_me ? 'Tú estás atendiendo este caso.' : 'Un responsable del piloto está atendiendo este caso.'} /> : null}
        {canResolve ? <View style={styles.card}><Text style={styles.heading}>Registrar solución</Text>
          <Field label="Qué se hizo para resolverlo" multiline value={note} onChangeText={setNote} maxLength={1000} editable={!busy} />
          <PhotoPicker value={photo} onChange={setPhoto} required disabled={busy} />
          <Button label="Marcar como solucionado" busy={busy} onPress={() => void act('resolve')} /></View>
          : incident.status !== 'solucionado' && incident.has_contributed && !incident.has_my_photo ?
            <Disclosure title="Agregar mi fotografía" summary={photo ? 'Foto lista para adjuntar' : 'Opcional'}><PhotoPicker value={photo} onChange={setPhoto} disabled={busy} />
              <Button label="Adjuntar fotografía" busy={busy} disabled={!photo} onPress={() => void act('photo')} /></Disclosure> : null}
        {incident.resolution_note ? <View style={styles.card}><Text style={styles.heading}>Solución registrada</Text><Text style={styles.text}>{incident.resolution_note}</Text></View> : null}
        {incident.previous_incident_id ? <Button label="Ver reporte anterior cercano" secondary onPress={() => router.push({ pathname: '/incident/[id]', params: { id: incident.previous_incident_id! } })} /> : null}
        {profile.role === 'responsable' && incident.status !== 'solucionado' && incident.latitude != null ? <Disclosure title="Revisar duplicados" summary="Opciones del responsable">
          <Text style={styles.subtitle}>Unir conserva este caso como principal. Verifica lugar, fotos y episodio; la cercanía por sí sola no basta.</Text>
          <Button label="Buscar casos cercanos para revisar" secondary busy={busy} onPress={() => void findDuplicates()} />
          {mergeMatches.length > 0 ? <Field label="Motivo de la unión" value={mergeNote} maxLength={300} onChangeText={setMergeNote} multiline editable={!busy} /> : null}
          {mergeMatches.map(match => <View key={match.id} style={styles.card}>
            <Text style={styles.heading}>{match.location_text}</Text><Text style={styles.subtitle}>A {distanceLabel(match.distance_m)}</Text>
            <Text style={styles.text}>{match.description}</Text>
            {match.photo_path ? <RemotePhoto path={match.photo_path} label="Foto del posible duplicado" /> : null}
            <Button label="Ver el otro reporte" secondary disabled={busy} onPress={() => router.push({ pathname: '/incident/[id]', params: { id: match.id } })} />
            <Button label="Confirmo: unir al caso actual" busy={busy} disabled={mergeNote.trim().length < 10} onPress={() => void merge(match.id)} />
          </View>)}
        </Disclosure> : null}
        {incident.merged_reports?.map(source => <Disclosure key={source.id} title="Historial de un reporte unido" summary={source.location_text}>
          {source.events.map(event => <Text key={event.id} style={styles.subtitle}>{STATUS_LABEL[event.to_status]} · {formatDate(event.created_at)}{event.note ? ` · ${event.note}` : ''}</Text>)}
        </Disclosure>)}
        <Disclosure title="Seguimiento del caso" summary={`${incident.events.length} movimientos registrados`}>
        {incident.events.map(event => <View key={event.id} style={styles.card}><Text style={styles.label}>{STATUS_LABEL[event.to_status]}</Text>
          <Text style={styles.subtitle}>{formatDate(event.created_at)} · {event.actor_role === 'responsable' ? 'Responsable' : 'Vecino'}</Text>
          {event.note ? <Text style={styles.text}>{event.note}</Text> : null}</View>)}
        </Disclosure>
      </> : null}
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
