import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../../hooks/session';
import { supabase } from '../../lib/supabase';
import { colors, Screen } from '../../components/ui';
export const unstable_settings = { initialRouteName: 'home' };
export default function TabLayout() {
  const { profile, loading } = useSession();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!profile) return;
    let alive = true;
    function refresh() {
      void supabase.from('notifications').select('id', { head: true, count: 'exact' }).is('read_at', null)
        .then(({ count, error }) => { if (alive && !error) setUnread(count ?? 0); });
    }
    refresh();
    const channel = supabase.channel(`badge-${profile.id}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}`,
    }, refresh).subscribe();
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [profile]);
  if (loading) return <Screen><ActivityIndicator style={{ margin: 60 }} color={colors.green} /></Screen>;
  if (!profile) return <Redirect href="/login" />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.green,
    tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.line }, tabBarLabelStyle: { fontSize: 11 } }}>
    <Tabs.Screen name="home" options={{ title: 'Inicio', tabBarIcon: ({ focused, size }) => <Ionicons name="home-outline" color={focused ? colors.green : colors.muted} size={size} /> }} />
    <Tabs.Screen name="report" options={{ title: 'Reportar', tabBarIcon: ({ focused, size }) => <Ionicons name="add-circle-outline" color={focused ? colors.green : colors.muted} size={size} /> }} />
    <Tabs.Screen name="history" options={{ title: 'Historial', tabBarIcon: ({ focused, size }) => <Ionicons name="time-outline" color={focused ? colors.green : colors.muted} size={size} /> }} />
    <Tabs.Screen name="notices" options={{ title: 'Avisos', tabBarBadge: unread || undefined, tabBarIcon: ({ focused, size }) => <Ionicons name="notifications-outline" color={focused ? colors.green : colors.muted} size={size} /> }} />
    <Tabs.Screen name="work" options={{ title: 'Atender', href: profile.role === 'responsable' ? '/work' : null,
      tabBarIcon: ({ focused, size }) => <Ionicons name="checkmark-circle-outline" color={focused ? colors.green : colors.muted} size={size} /> }} />
  </Tabs>;
}
