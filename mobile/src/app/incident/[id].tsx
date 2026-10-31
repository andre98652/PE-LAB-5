import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { api } from '../../services/api';
import { friendlyError, STATUS_LABEL, TYPE_LABEL, type IncidentDetail, type Photo } from '../../domain/models';
import { Button, colors, Field, formatDate, Message, RemotePhoto, Screen, StatusBadge, styles, Title } from '../../components/ui';
import { PhotoPicker } from '../../components/PhotoPicker';
import { useSession } from '../../hooks/session';
import { useRefresh } from '../../hooks/useRefresh';

export default function Detail() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { profile, loading: sessionLoading } = useSession();
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
    try { const data = await api.detail(id); if (seq === sequence.current) setIncident(data); }
    catch (e) { if (seq === sequence.current) setError(friendlyError(e)); }
    finally { if (seq === sequence.current) setLoading(false); }
  }, [id, profile]);
  useRefresh(load);
  function key(fingerprint: string) {
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, randomUUID());
    return keys.current.get(fingerprint)!;
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
  return <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.row}><Button label="Volver" secondary onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/home'); }} />
        <Button label="Actualizar" secondary busy={loading} disabled={busy} onPress={() => { setError(''); void load(); }} /></View>
      <Message text={error} error /><Message text={info} />
      {!incident && loading ? <ActivityIndicator color={colors.green} /> : null}
      {incident ? <>
        <StatusBadge status={incident.status} /><Title title={incident.location_text} description={incident.point_name} />
        <View style={styles.card}><Text style={styles.label}>{TYPE_LABEL[incident.problem_type]}</Text><Text style={styles.text}>{incident.description}</Text>
          <Text style={styles.subtitle}>Registrado: {formatDate(incident.created_at)}</Text>
          <Text style={styles.heading}>{incident.participants} {incident.participants === 1 ? 'vecino confirma' : 'vecinos confirman'}</Text>
          {incident.distinct_reason ? <Text style={styles.subtitle}>Problema distinto: {incident.distinct_reason}</Text> : null}</View>
        {incident.photos.map(evidence => <View key={evidence.id} style={styles.card}>
          <Text style={styles.label}>{evidence.kind === 'solucion' ? 'EVIDENCIA DE SOLUCIÓN' : 'FOTOGRAFÍA DEL REPORTE'}</Text>
          <RemotePhoto key={`${evidence.object_path}:${incident.updated_at}`} path={evidence.object_path} label={evidence.kind === 'solucion' ? 'Fotografía de la limpieza realizada' : 'Fotografía del problema'} /></View>)}
        {incident.status !== 'solucionado' && !incident.has_contributed ?
          <Button label="También observé este problema" busy={busy} onPress={() => void act('confirm')} /> : null}
        {incident.has_contributed ? <Message text="Ya participas en este reporte. Recibirás sus cambios de estado en Avisos." /> : null}
        {incident.status === 'pendiente' && profile.role === 'responsable' ?
          <Button label="Aceptar y poner en proceso" busy={busy} onPress={() => void act('accept')} /> : null}
        {incident.status === 'en_proceso' ? <Message text={incident.assigned_to_me ? 'Tú estás atendiendo este caso.' : 'Un responsable del piloto está atendiendo este caso.'} /> : null}
        {canResolve ? <View style={styles.card}><Text style={styles.heading}>Registrar solución</Text>
          <Field label="Qué se hizo para resolverlo" multiline value={note} onChangeText={setNote} maxLength={1000} editable={!busy} />
          <PhotoPicker value={photo} onChange={setPhoto} required disabled={busy} />
          <Button label="Marcar como solucionado" busy={busy} onPress={() => void act('resolve')} /></View>
          : incident.status !== 'solucionado' && incident.has_contributed && !incident.has_my_photo ?
            <View style={styles.card}><Text style={styles.heading}>Agregar evidencia</Text><PhotoPicker value={photo} onChange={setPhoto} disabled={busy} />
              <Button label="Adjuntar fotografía" busy={busy} disabled={!photo} onPress={() => void act('photo')} /></View> : null}
        {incident.resolution_note ? <View style={styles.card}><Text style={styles.heading}>Solución registrada</Text><Text style={styles.text}>{incident.resolution_note}</Text></View> : null}
        <Text style={styles.heading}>Seguimiento del caso</Text>
        {incident.events.map(event => <View key={event.id} style={styles.card}><Text style={styles.label}>{STATUS_LABEL[event.to_status]}</Text>
          <Text style={styles.subtitle}>{formatDate(event.created_at)} · {event.actor_role === 'responsable' ? 'Responsable' : 'Vecino'}</Text>
          {event.note ? <Text style={styles.text}>{event.note}</Text> : null}</View>)}
      </> : null}
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
