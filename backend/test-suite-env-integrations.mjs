import { config, getSanitizedConfigStatus, loadedEnvPath } from './dist/config/env.js';
import { supabaseService } from './dist/services/supabase/supabase.service.js';
import { mailerService } from './dist/services/mail/mailer.service.js';
import { TmdbProvider } from './dist/services/metadata/providers/tmdb.provider.js';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passed++;
  } else {
    console.error(`[FAIL] ${message}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('   7ANIME ENVIRONMENT CONFIGURATION & INTEGRATIONS TEST SUITE   ');
  console.log('================================================================\n');

  // 1. Root .env Loading & Security
  console.log('--- TEST GROUP 1: Root .env Loading & Location Security ---');
  assert(Boolean(loadedEnvPath && fs.existsSync(loadedEnvPath)), `Root .env file loaded successfully from: ${loadedEnvPath}`);
  assert(loadedEnvPath.endsWith('.env'), 'Target file is specifically named .env');
  assert(!loadedEnvPath.includes('backend\\.env') && !loadedEnvPath.includes('backend/.env'), 'Does NOT assume or load from backend/.env');

  const gitignore = fs.readFileSync('E:/7ANIME_NEW/.gitignore', 'utf8');
  assert(gitignore.includes('.env'), 'Root .gitignore explicitly protects .env files from Git commits');

  // 2. Safe Audit (Zero Secret Leaks)
  console.log('\n--- TEST GROUP 2: Safe Environment Audit (Zero Secret Leaks) ---');
  const safeStatus = getSanitizedConfigStatus();
  assert(safeStatus.port === 3001 || safeStatus.port === 5000, `Backend port configured (detected: ${safeStatus.port})`);
  assert(safeStatus.envFileLoaded === true, 'Safe status reports envFileLoaded: true');
  assert(typeof safeStatus.integrations === 'object', 'Integrations object is present in status');

  const statusJson = JSON.stringify(safeStatus);
  // Ensure no passwords, secret tokens, or access tokens are serialized
  assert(!statusJson.includes(config.smtpPassword || '---'), 'SMTP password is NEVER leaked in serialized status');
  assert(!statusJson.includes(config.googleClientSecret || '---'), 'Google Client Secret is NEVER leaked in serialized status');
  assert(!statusJson.includes(config.upstashRedisRestToken || '---'), 'Upstash Redis Token is NEVER leaked in serialized status');
  assert(!statusJson.includes(config.tmdbReadAccessToken || '---'), 'TMDB Read Access Token is NEVER leaked in serialized status');

  // 3. Supabase Integration
  console.log('\n--- TEST GROUP 3: Supabase Integration & GoTrue Auth ---');
  assert(safeStatus.integrations.supabase.configured === true, 'Supabase credentials detected in environment');
  assert(safeStatus.integrations.supabase.urlHost === 'rlimmcvdayfekbjstyod.supabase.co', 'Supabase project URL host points to 7anime_one');
  assert(supabaseService.isReady() === true, 'SupabaseService client initialized successfully');

  const supabaseHealth = await supabaseService.checkHealth();
  assert(supabaseHealth.connected === true, `Supabase Auth GoTrue service is reachable and healthy (${supabaseHealth.authService})`);

  // Verify token validation handling
  const fakeTokenCheck = await supabaseService.verifyUserToken('invalid-jwt-token-xyz');
  assert(fakeTokenCheck === null, 'SupabaseService correctly rejects invalid session tokens');

  // 4. Upstash Redis Integration
  console.log('\n--- TEST GROUP 4: Upstash Redis Connectivity & Cache ---');
  assert(safeStatus.integrations.upstashRedis.configured === true, 'Upstash Redis credentials detected');
  assert(safeStatus.integrations.upstashRedis.urlHost === 'notable-stag-75332.upstash.io', 'Upstash Redis host matches project URL');

  try {
    const redisPingRes = await fetch(`${config.upstashRedisRestUrl}/ping`, {
      headers: { Authorization: `Bearer ${config.upstashRedisRestToken}` },
    });
    const redisPingData = await redisPingRes.json();
    assert(redisPingRes.status === 200 && redisPingData.result === 'PONG', 'Upstash Redis REST ping returns HTTP 200 and PONG');
  } catch (err) {
    assert(false, `Upstash Redis connection failed: ${err.message}`);
  }

  // 5. SMTP Transport Integration (No Spam Sent)
  console.log('\n--- TEST GROUP 5: SMTP Transport Verification (Zero Test Spam) ---');
  assert(safeStatus.integrations.smtp.configured === true, 'SMTP credentials detected in environment');
  assert(safeStatus.integrations.smtp.host === 'smtp.gmail.com', 'SMTP host is smtp.gmail.com');
  assert(safeStatus.integrations.smtp.port === 465, 'SMTP port is 465 (SSL/TLS)');

  const smtpCheck = await mailerService.verifyConnection();
  assert(smtpCheck.success === true, 'SMTP transporter.verify() authenticated cleanly with mail server');

  // 6. Google OAuth Configuration
  console.log('\n--- TEST GROUP 6: Google OAuth & Redirect URI ---');
  assert(safeStatus.integrations.googleOAuth.configured === true, 'Google OAuth Client ID & Secret detected');
  assert(safeStatus.integrations.googleOAuth.hasRedirectUri === true, 'Google OAuth Redirect URI is configured');
  assert(config.googleRedirectUri === 'https://sevenanime-vodw.onrender.com/api/auth/google/callback', 'Google Redirect URI matches production callback URL');

  // 7. TMDB Configuration & Resilient Client
  console.log('\n--- TEST GROUP 7: TMDB Metadata & Resilient DNS ---');
  assert(safeStatus.integrations.tmdb.hasApiKey === true, 'TMDB API Key configured');
  assert(safeStatus.integrations.tmdb.hasReadAccessToken === true, 'TMDB Read Access Token configured');

  const onePieceDetails = await TmdbProvider.getTvDetails(37854);
  assert(onePieceDetails !== null && onePieceDetails.name === 'One Piece', 'TMDB Provider resolved One Piece TV details cleanly');
  assert(onePieceDetails && onePieceDetails.seasons && onePieceDetails.seasons.length >= 23, `TMDB Provider found all seasons (${onePieceDetails?.seasons?.length} seasons)`);

  // 8. Public Branding Configuration
  console.log('\n--- TEST GROUP 8: Public Branding Configuration ---');
  assert(safeStatus.integrations.branding.publicLogoUrl === 'https://7anime-tv.vercel.app/logo.png', 'PUBLIC_LOGO_URL matches official logo CDN URL');

  // Summary
  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
