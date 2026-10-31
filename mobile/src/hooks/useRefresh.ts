import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useSession } from './session';

// Volver a consultar siempre al enfocar/reconectar: Realtime no es una cola durable.
export function useRefresh(refresh: () => void) {
  const { session } = useSession();
  const [connectionIssue, setConnectionIssue] = useState(false);
  useFocusEffect(useCallback(() => {
    refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const userId = session?.user.id;
    const channel = userId ? supabase.channel(`screen-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => refresh())
      .subscribe(status => {
        setConnectionIssue(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT');
        if (status === 'SUBSCRIBED') refresh();
      }) : null;
    return () => { listener.remove(); if (channel) void supabase.removeChannel(channel); };
  }, [session?.user.id, refresh]));
  return connectionIssue;
}
