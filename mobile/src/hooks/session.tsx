import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from '../lib/supabase';
import { friendlyError, type Profile } from '../domain/models';

type SessionState = { session: Session | null; profile: Profile | null; loading: boolean; error: string; reload: () => void };
const SessionContext = createContext<SessionState>({ session: null, profile: null, loading: true, error: '', reload: () => {} });
export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    let generation = 0;
    async function applySession(next: Session | null) {
      const current = ++generation;
      if (!alive) return;
      setSession(next); setProfile(null); setError(''); setLoading(Boolean(next));
      if (!next) { setLoading(false); return; }
      const { data, error: queryError } = await supabase.from('profiles').select('id,display_name,role').eq('id', next.user.id).single();
      if (!alive || current !== generation) return;
      if (queryError) setError(friendlyError(queryError));
      else setProfile(data as Profile);
      setLoading(false);
    }
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) { setError(friendlyError(sessionError)); setLoading(false); }
      else void applySession(data.session);
    });
    // Salir del callback antes de consultar: evita interbloquear el lock de Auth.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setTimeout(() => { if (alive) void applySession(next); }, 0);
    });
    const state = AppState.addEventListener('change', value => {
      if (value === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh();
    });
    supabase.auth.startAutoRefresh();
    return () => { alive = false; generation++; listener.subscription.unsubscribe(); state.remove(); supabase.auth.stopAutoRefresh(); };
  }, [reloadKey]);
  return <SessionContext.Provider value={{ session, profile, loading, error, reload }}>{children}</SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);
