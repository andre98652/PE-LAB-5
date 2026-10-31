import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from '../hooks/session';
export default function Layout() {
  return <SessionProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false }} /></SessionProvider>;
}
