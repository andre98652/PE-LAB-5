import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const isConfigured = /^https:\/\/[^/]+\.supabase\.co\/?$/.test(url)
  && !url.includes('TU-PROYECTO') && key.length > 25 && !key.includes('TU_CLAVE');

// La clave publicable identifica el proyecto. La seguridad reside en RLS y RPC.
export const supabase = createClient(isConfigured ? url : 'https://unconfigured.supabase.co',
  isConfigured ? key : 'unconfigured-public-key-placeholder', {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true,
      detectSessionInUrl: false, lock: processLock },
  });
