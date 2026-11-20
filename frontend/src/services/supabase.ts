import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

const SUPABASE_URL = (
  import.meta.env.VITE_SUPABASE_URL ||
  'https://rlimmcvdayfekbjstyod.supabase.co'
).trim();

const SUPABASE_PUBLISHABLE_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_CRDGWovx6YFYpCJ3CUwyFg_RvFLX0rY'
).trim();

/**
 * Singleton Supabase Client for Frontend Authentication
 * Configured with PKCE flow for secure browser OAuth (Discord, etc.)
 */
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

/**
 * Initiates Discord OAuth login via Supabase.
 * Redirects user to Discord authorization prompt with PKCE protection.
 */
export async function signInWithDiscord(): Promise<{
  data: { provider: string; url: string | null } | null;
  error: Error | null;
}> {
  const redirectTo =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/`
      : 'https://7anime-new.vercel.app/';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo,
      scopes: 'identify email',
    },
  });

  return {
    data: data ? { provider: data.provider, url: data.url } : null,
    error: error ? new Error(error.message) : null,
  };
}

/**
 * Retrieves the currently active Supabase session.
 */
export async function getSupabaseSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    return null;
  }
  return data.session;
}

/**
 * Signs out from Supabase client-side session.
 */
export async function signOutSupabase(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch {}
}

export type { Session, User };
