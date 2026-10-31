import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { Button, colors, Field, Message, Screen, styles, Title } from '../components/ui';
import { useSession } from '../hooks/session';
import { isConfigured, supabase } from '../lib/supabase';
import { friendlyError } from '../domain/models';

export default function Login() {
  const { loading, profile, session, error: profileError, reload } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (loading) return <Screen><ActivityIndicator style={{ margin: 60 }} color={colors.green} /></Screen>;
  if (profile) return <Redirect href="/home" />;
  async function login() {
    setBusy(true); setError('');
    try {
      if (!email.trim() || !password) throw new Error('Ingresa tu correo y contraseña.');
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  }
  return <Screen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 }]} keyboardShouldPersistTaps="handled">
      <View style={{ backgroundColor: colors.green, padding: 26, borderRadius: 22, gap: 12 }}>
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>ACCIÓN VECINAL</Text>
        <Text style={{ color: colors.white, fontSize: 36, fontWeight: '800', letterSpacing: -1 }}>Barrio Limpio</Text>
        <Text style={{ color: '#E0E9DC', fontSize: 16, lineHeight: 24 }}>Un lugar para reportar, sumar evidencia y seguir la limpieza de tu barrio.</Text>
      </View>
      <Title title="Bienvenido" description="Ingresa con tu cuenta de vecino o responsable del piloto." />
      {!isConfigured ? <Message text="La app está preparada. Falta conectar el proyecto Supabase usando la configuración pública en el archivo .env. Consulta la guía de instalación incluida con el proyecto." /> : null}
      {session && profileError ? <><Message text={profileError} error /><Button label="Volver a cargar mi perfil" onPress={reload} secondary />
        <Button label="Salir de esta cuenta" secondary onPress={() => { void supabase.auth.signOut().catch(e => setError(friendlyError(e))); }} /></> : <>
        <Field label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!busy} />
        <Field label="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="current-password" editable={!busy} onSubmitEditing={() => { if (isConfigured && !busy) void login(); }} />
        <Message text={error} error /><Button label="Ingresar" busy={busy} disabled={!isConfigured} onPress={() => void login()} />
      </>}
      <Text style={styles.subtitle}>Proyecto académico · Piloto con cuentas preparadas. Los datos de demostración están identificados como DEMO.</Text>
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
