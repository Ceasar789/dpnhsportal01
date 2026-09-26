import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const tabStorageKey = 'smartedu-auth-tab-id';
const tabId = sessionStorage.getItem(tabStorageKey) || (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
);
sessionStorage.setItem(tabStorageKey, tabId);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

console.log(`🔗 Supabase URL: ${supabaseUrl}`);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    storage: sessionStorage,
    storageKey: `smartedu-auth-${tabId}`,
    detectSessionInUrl: true,
  },
});

// Helper to get public school-assets URLs
export const assetUrl = (filename, v) =>
  `${supabaseUrl}/storage/v1/object/public/school-assets/${filename}${v ? `?v=${v}` : ''}`;

export default supabase;