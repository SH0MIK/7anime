import test from 'node:test';
import assert from 'node:assert/strict';
import { getValidatedDiscordClientId, COMPANION_CONFIG } from '../config.js';

test('config: getValidatedDiscordClientId rejects missing or empty ID', () => {
  const orig = process.env.DISCORD_CLIENT_ID;
  try {
    delete process.env.DISCORD_CLIENT_ID;
    assert.throws(
      () => getValidatedDiscordClientId(),
      /DISCORD_CLIENT_ID is not configured/
    );

    process.env.DISCORD_CLIENT_ID = '   ';
    assert.throws(
      () => getValidatedDiscordClientId(),
      /DISCORD_CLIENT_ID is not configured/
    );
  } finally {
    process.env.DISCORD_CLIENT_ID = orig;
  }
});

test('config: getValidatedDiscordClientId rejects malformed or non-numeric IDs', () => {
  const orig = process.env.DISCORD_CLIENT_ID;
  try {
    process.env.DISCORD_CLIENT_ID = 'short_id_123';
    assert.throws(
      () => getValidatedDiscordClientId(),
      /must be a 17-21 digit numeric Snowflake ID/
    );

    process.env.DISCORD_CLIENT_ID = '123456789012345678a'; // Contains non-digit
    assert.throws(
      () => getValidatedDiscordClientId(),
      /must be a 17-21 digit numeric Snowflake ID/
    );

    process.env.DISCORD_CLIENT_ID = '1234567890123456'; // 16 digits (too short)
    assert.throws(
      () => getValidatedDiscordClientId(),
      /must be a 17-21 digit numeric Snowflake ID/
    );

    process.env.DISCORD_CLIENT_ID = '1234567890123456789012'; // 22 digits (too long)
    assert.throws(
      () => getValidatedDiscordClientId(),
      /must be a 17-21 digit numeric Snowflake ID/
    );
  } finally {
    process.env.DISCORD_CLIENT_ID = orig;
  }
});

test('config: getValidatedDiscordClientId accepts valid 17-21 digit Snowflakes', () => {
  const orig = process.env.DISCORD_CLIENT_ID;
  try {
    // 17 digits
    process.env.DISCORD_CLIENT_ID = '12345678901234567';
    assert.equal(getValidatedDiscordClientId(), '12345678901234567');

    // 18 digits (standard Discord snowflake)
    process.env.DISCORD_CLIENT_ID = '134257987654321098';
    assert.equal(getValidatedDiscordClientId(), '134257987654321098');

    // 19 digits
    process.env.DISCORD_CLIENT_ID = '1234567890123456789';
    assert.equal(getValidatedDiscordClientId(), '1234567890123456789');

    // 21 digits
    process.env.DISCORD_CLIENT_ID = '123456789012345678901';
    assert.equal(getValidatedDiscordClientId(), '123456789012345678901');
  } finally {
    process.env.DISCORD_CLIENT_ID = orig;
  }
});

test('config: EXACT_ALLOWED_ORIGINS strictly prohibits wildcard origins', () => {
  assert.ok(COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('http://localhost:5173'));
  assert.ok(COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('http://localhost:3000'));
  assert.ok(COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('http://127.0.0.1:5173'));
  assert.ok(COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('http://127.0.0.1:3000'));
  assert.ok(COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('https://7anime-new.vercel.app'));
  assert.ok(COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('https://7anime.to'));
  assert.ok(COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('https://www.7anime.to'));

  assert.equal(COMPANION_CONFIG.WEBSITE_URL, 'https://7anime-new.vercel.app');
  assert.equal(COMPANION_CONFIG.DISCORD_INVITE_URL, 'https://discord.gg/TpqgaXjDQC');
  assert.ok(typeof COMPANION_CONFIG.DISCORD_CLIENT_ID === 'string' && COMPANION_CONFIG.DISCORD_CLIENT_ID.length >= 17);

  // Wildcards or untrusted subdomains must NOT be present
  assert.ok(!COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('*.vercel.app'));
  assert.ok(!COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('https://evil.vercel.app'));
  assert.ok(!COMPANION_CONFIG.EXACT_ALLOWED_ORIGINS.has('https://preview.vercel.app'));
});
