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
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (loading) return <Screen><ActivityIndicator style={{ margin: 60 }} color={colors.green} /></Screen>;
  if (profile) return <Redirect href="/home" />;
  async function login() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!email.trim() || !password) throw new Error('Ingresa tu correo y contraseña.');
      if (registering) {
        if (name.trim().length < 2 || name.trim().length > 80) throw new Error('Ingresa tu nombre, entre 2 y 80 caracteres.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Ingresa un correo electrónico válido.');
        if (password.length < 8) throw new Error('Usa una contraseña de al menos 8 caracteres.');
        if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { display_name: name.trim() } },
        });
        if (signUpError) throw signUpError;
        setPassword(''); setConfirmation('');
        if (!data.session) {
          setRegistering(false);
          setNotice('Si el correo puede registrarse, recibirás un enlace de confirmación. Revisa tu bandeja y spam; después vuelve aquí e ingresa. Si ya tenías una cuenta, usa tu contraseña habitual.');
        }
        return;
      }
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
      <Title title={registering ? 'Únete a tu barrio' : 'Bienvenido'} description={registering ? 'Crea tu cuenta de vecino para reportar y confirmar problemas.' : 'Ingresa a tu cuenta o regístrate para participar.'} />
      {!isConfigured ? <Message text="La app está preparada. Falta conectar el proyecto Supabase usando la configuración pública en el archivo .env. Consulta la guía de instalación incluida con el proyecto." /> : null}
      {session && profileError ? <><Message text={profileError} error /><Button label="Volver a cargar mi perfil" onPress={reload} secondary />
        <Button label="Salir de esta cuenta" secondary onPress={() => { void supabase.auth.signOut().catch(e => setError(friendlyError(e))); }} /></> : <>
        {registering ? <Field label="Tu nombre" value={name} onChangeText={setName} autoComplete="name" maxLength={80} editable={!busy} /> : null}
        <Field label="Correo electrónico" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" maxLength={254} editable={!busy} />
        <Field label={registering ? 'Contraseña (mínimo 8 caracteres)' : 'Contraseña'} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={registering ? 'new-password' : 'current-password'} editable={!busy} onSubmitEditing={() => { if (!registering && isConfigured && !busy) void login(); }} />
        {registering ? <Field label="Repite tu contraseña" value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!busy} onSubmitEditing={() => { if (isConfigured && !busy) void login(); }} /> : null}
        <Message text={notice} /><Message text={error} error />
        <Button label={registering ? 'Crear mi cuenta' : 'Ingresar'} busy={busy} disabled={!isConfigured} onPress={() => void login()} />
        <Button label={registering ? 'Ya tengo cuenta · Ingresar' : 'Soy nuevo · Crear cuenta'} secondary disabled={busy} onPress={() => {
          setRegistering(!registering); setError(''); setNotice(''); setPassword(''); setConfirmation('');
        }} />
      </>}
      <Text style={styles.subtitle}>Proyecto académico · Las cuentas nuevas son de vecinos. El acceso de responsables lo asigna la administración.</Text>
    </ScrollView>
  </KeyboardAvoidingView></Screen>;
}
