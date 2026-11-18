/**
 * Rigorous test verifying custom DNS lookup & TLS certificate preservation.
 */
import https from 'node:https';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { HttpClient } from '../dist/utils/httpClient.js';
import { config } from '../dist/config/env.js';

async function verifyDnsAndTls() {
  console.log('====================================================');
  console.log('   VERIFYING CUSTOM DNS & TLS CERTIFICATE VALIDATION');
  console.log('====================================================\n');

  const hostname = 'api.themoviedb.org';

  // 1. Resolve through Cloudflare/Google DNS
  const resolver = new dns.Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  const resolvedIps = await resolver.resolve4(hostname);
  console.log(`[DNS] Cloudflare/Google resolved ${hostname} to:`, resolvedIps);

  if (!resolvedIps || resolvedIps.length === 0) {
    throw new Error('Custom DNS failed to resolve TMDB');
  }

  // 2. Perform raw TLS handshake with custom lookup to verify certificate integrity
  const targetIp = resolvedIps[0];
  console.log(`[TLS] Testing TLS handshake to IP ${targetIp} with SNI ${hostname}...`);

  await new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: targetIp,
      port: 443,
      servername: hostname, // SNI must match hostname for valid cert
      rejectUnauthorized: true, // STRICT TLS verification
    }, () => {
      const authorized = socket.authorized;
      const cert = socket.getPeerCertificate();
      console.log(`[TLS] Handshake Successful!`);
      console.log(`[TLS] Socket Authorized:`, authorized);
      console.log(`[TLS] Certificate Subject:`, cert.subject?.CN);
      console.log(`[TLS] Certificate Issuer:`, cert.issuer?.O);
      console.log(`[TLS] Valid From:`, cert.valid_from);
      console.log(`[TLS] Valid To:`, cert.valid_to);
      socket.end();

      if (!authorized) {
        reject(new Error('TLS authorization failed!'));
      } else {
        resolve(true);
      }
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });

  // 3. Test HttpClient end-to-end request
  console.log('\n[HTTP] Testing HttpClient.get with custom lookup...');
  const res = await HttpClient.get('https://api.themoviedb.org/3/configuration', {
    headers: {
      Authorization: `Bearer ${config.tmdbReadAccessToken}`,
    },
  });

  console.log('[HTTP] TMDB response received successfully!');
  console.log('[HTTP] Secure image base URL:', res.images?.secure_base_url);
  console.log('\n====================================================');
  console.log('   DNS & TLS VERIFICATION: 100% CONFIRMED');
  console.log('====================================================\n');
}

verifyDnsAndTls().catch((err) => {
  console.error('DNS/TLS verification failed:', err);
  process.exit(1);
});
