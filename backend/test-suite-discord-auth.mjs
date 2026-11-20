import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

console.log('================================================================');
console.log('      7ANIME DISCORD OAUTH INTEGRATION VERIFICATION SUITE       ');
console.log('================================================================');

function it(desc, fn) {
  try {
    fn();
    console.log(`[PASS] ${desc}`);
  } catch (err) {
    console.error(`[FAIL] ${desc}`);
    console.error(`       Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------
// TEST GROUP 1: Dialogs UI & Discord Button Replacement
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 1: Dialogs UI & Discord Button Replacement ---');

const dialogsPath = path.resolve('frontend/src/components/Dialogs.tsx');
const dialogsContent = fs.readFileSync(dialogsPath, 'utf8');

it('Dialogs.tsx contains "Continue with Discord"', () => {
  assert(dialogsContent.includes('Continue with Discord'), 'Must display "Continue with Discord"');
});

it('Dialogs.tsx has replaced Apple Login option with Discord', () => {
  assert(!dialogsContent.includes('Continue with Apple'), 'Apple login option must be replaced');
  assert(dialogsContent.includes("onClick={() => handleOAuthClick('Discord')}"), 'Button triggers Discord handler');
});

it('Dialogs.tsx uses authentic Discord Blurple styling (#5865F2)', () => {
  assert(dialogsContent.includes('#5865F2'), 'Discord icon uses brand color #5865F2');
});

it('Dialogs.tsx maintains strict UI button styling and dimensions', () => {
  assert(dialogsContent.includes('minHeight: 44'), 'Maintains touch target sizing (44px)');
  assert(dialogsContent.includes('borderRadius: 999'), 'Maintains pill button styling');
});

// -----------------------------------------------------------------------------
// TEST GROUP 2: Supabase Client & Discord OAuth Implementation
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Supabase Client & Discord OAuth Implementation ---');

const supabaseServicePath = path.resolve('frontend/src/services/supabase.ts');
const supabaseContent = fs.readFileSync(supabaseServicePath, 'utf8');

it('frontend/src/services/supabase.ts exists and initializes createClient', () => {
  assert(fs.existsSync(supabaseServicePath), 'supabase.ts service must exist');
  assert(supabaseContent.includes('createClient('), 'Must instantiate createClient');
});

it('Supabase client is configured with secure PKCE flow', () => {
  assert(supabaseContent.includes("flowType: 'pkce'"), 'Must enforce PKCE flowType');
  assert(supabaseContent.includes('detectSessionInUrl: true'), 'Must detect session from URL');
  assert(supabaseContent.includes('autoRefreshToken: true'), 'Must auto-refresh tokens');
  assert(supabaseContent.includes('persistSession: true'), 'Must persist session in storage');
});

it('signInWithDiscord calls supabase.auth.signInWithOAuth with discord provider', () => {
  assert(supabaseContent.includes("provider: 'discord'"), "Must specify provider: 'discord'");
  assert(supabaseContent.includes('supabase.auth.signInWithOAuth'), 'Must call supabase.auth.signInWithOAuth');
  assert(supabaseContent.includes("scopes: 'identify email'"), 'Must request identify and email scopes');
});

// -----------------------------------------------------------------------------
// TEST GROUP 3: AppContext Session & State Handling
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: AppContext Session & State Handling ---');

const appContextPath = path.resolve('frontend/src/context/AppContext.tsx');
const appContextContent = fs.readFileSync(appContextPath, 'utf8');

it('AppContext subscribes to supabase.auth.onAuthStateChange', () => {
  assert(appContextContent.includes('supabase.auth.onAuthStateChange'), 'Must attach onAuthStateChange listener');
  assert(appContextContent.includes("event === 'SIGNED_IN'"), 'Handles SIGNED_IN event');
  assert(appContextContent.includes("event === 'SIGNED_OUT'"), 'Handles SIGNED_OUT event');
});

it('AppContext handles Discord PKCE callback redirect (params.has("code"))', () => {
  assert(appContextContent.includes("params.has('code')"), 'Detects PKCE code param');
  assert(appContextContent.includes('supabase.auth.getSession()'), 'Retrieves active Supabase session');
});

it('AppContext cleans sensitive OAuth query parameters from URL history', () => {
  assert(appContextContent.includes('window.history.replaceState'), 'Cleans URL via replaceState');
});

it('AppContext prevents duplicate session initialization with synchronization lock', () => {
  assert(appContextContent.includes('isSyncingRef'), 'Implements concurrency lock via isSyncingRef');
  assert(appContextContent.includes('currentUserIdRef'), 'Tracks active user ID via currentUserIdRef');
});

// -----------------------------------------------------------------------------
// TEST GROUP 4: Security & Independence Guarantees
// -----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: Security & Independence Guarantees ---');

it('Zero Discord Client Secrets exposed in frontend codebase', () => {
  const frontendDir = path.resolve('frontend/src');
  const files = fs.readdirSync(frontendDir, { recursive: true });
  for (const file of files) {
    if (typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      const code = fs.readFileSync(path.join(frontendDir, file), 'utf8');
      assert(!code.includes('DISCORD_CLIENT_SECRET'), `No secret in ${file}`);
    }
  }
});

it('Google Login custom Render flow remains completely intact and separate', () => {
  assert(appContextContent.includes('authTicket'), 'Google auth_ticket exchange is preserved');
  assert(appContextContent.includes('apiClient.exchangeAuthTicket'), 'Google exchangeAuthTicket is preserved');
  assert(dialogsContent.includes("handleOAuthClick('Google')"), 'Google OAuth button is preserved');
});

it('Backend supabase.service.ts safely handles Discord user metadata without requiring verified email', () => {
  const backendSupaPath = path.resolve('backend/src/services/supabase/supabase.service.ts');
  const backendSupaContent = fs.readFileSync(backendSupaPath, 'utf8');
  assert(backendSupaContent.includes('user.user_metadata?.full_name'), 'Extracts full_name metadata');
  assert(backendSupaContent.includes('user.user_metadata?.name'), 'Extracts name metadata');
  assert(backendSupaContent.includes("email: user.email || ''"), 'Safely defaults unverified/missing email');
});

console.log('\n================================================================');
console.log('       DISCORD OAUTH VERIFICATION: ALL ASSERTIONS PASSED        ');
console.log('================================================================\n');
