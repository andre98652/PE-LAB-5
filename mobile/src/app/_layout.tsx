import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '../hooks/session';
import { AreaProvider } from '../hooks/area';
export default function Layout() {
  return <SessionProvider><AreaProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></AreaProvider></SessionProvider>;
}
