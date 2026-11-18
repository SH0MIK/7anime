import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns/promises';
import { URL } from 'node:url';

// Shared DNS resolver configured with Cloudflare & Google public DNS to bypass ISP sinkholes
const publicResolver = new dns.Resolver();
publicResolver.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);

// In-memory DNS cache to avoid resolving repeatedly
const dnsCache = new Map<string, { ips: string[]; timestamp: number }>();
const DNS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Custom DNS lookup handler for node https/http agents.
 */
async function resolveHost(hostname: string): Promise<string[]> {
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL_MS) {
    return cached.ips;
  }

  try {
    const ips = await publicResolver.resolve4(hostname);
    if (ips && ips.length > 0) {
      dnsCache.set(hostname, { ips, timestamp: Date.now() });
      return ips;
    }
  } catch (err) {
    // If custom resolver fails, fall back to default resolver
  }

  return [];
}

function customLookup(
  hostname: string,
  options: any,
  callback: (err: Error | null, address?: any, family?: number) => void
) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  resolveHost(hostname)
    .then((ips) => {
      if (ips && ips.length > 0) {
        if (options && options.all) {
          return callback(
            null,
            ips.map((ip) => ({ address: ip, family: 4 }))
          );
        }
        return callback(null, ips[0], 4);
      }
      // If no IPs from custom resolver, delegate to system
      return callback(new Error(`Unable to resolve host: ${hostname}`));
    })
    .catch((err) => callback(err));
}

// Custom HTTPS agent with custom lookup
const secureAgent = new https.Agent({
  keepAlive: true,
  timeout: 15000,
  lookup: customLookup,
});

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

export class HttpClient {
  /**
   * Performs an HTTP GET request and returns parsed JSON.
   */
  public static async get<T>(rawUrl: string, options: HttpRequestOptions = {}): Promise<T> {
    const url = new URL(rawUrl);

    if (options.params) {
      Object.entries(options.params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      });
    }

    const headers = {
      Accept: 'application/json',
      'User-Agent': '7Anime-API-Client/1.0.0 (https://7anime.ct.ws)',
      ...(options.headers || {}),
    };

    const isHttps = url.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options.timeoutMs || 15000;

      const req = requestModule.request(
        url,
        {
          method: 'GET',
          headers,
          agent: isHttps ? secureAgent : undefined,
          timeout: timeoutMs,
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');

          res.on('data', (chunk) => {
            body += chunk;
          });

          res.on('end', () => {
            const statusCode = res.statusCode || 0;
            if (statusCode < 200 || statusCode >= 300) {
              return reject(
                new Error(
                  `HTTP request failed [${statusCode} ${res.statusMessage}] for ${url.origin}${url.pathname}: ${body.slice(0, 300)}`
                )
              );
            }

            try {
              const parsed = JSON.parse(body) as T;
              resolve(parsed);
            } catch (parseErr) {
              reject(new Error(`Failed to parse JSON response from ${url.origin}${url.pathname}: ${(parseErr as Error).message}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error(`HTTP request timed out after ${timeoutMs}ms for ${url.origin}${url.pathname}`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  /**
   * Performs an HTTP POST request sending JSON and returns parsed JSON.
   */
  public static async post<T>(
    rawUrl: string,
    payload: any,
    options: HttpRequestOptions = {}
  ): Promise<T> {
    const url = new URL(rawUrl);

    if (options.params) {
      Object.entries(options.params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      });
    }

    const bodyString = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Content-Length': Buffer.byteLength(bodyString),
      'User-Agent': '7Anime-API-Client/1.0.0 (https://7anime.ct.ws)',
      ...(options.headers || {}),
    };

    const isHttps = url.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = options.timeoutMs || 15000;

      const req = requestModule.request(
        url,
        {
          method: 'POST',
          headers,
          agent: isHttps ? secureAgent : undefined,
          timeout: timeoutMs,
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');

          res.on('data', (chunk) => {
            body += chunk;
          });

          res.on('end', () => {
            const statusCode = res.statusCode || 0;
            if (statusCode < 200 || statusCode >= 300) {
              return reject(
                new Error(
                  `HTTP POST request failed [${statusCode} ${res.statusMessage}] for ${url.origin}${url.pathname}: ${body.slice(0, 300)}`
                )
              );
            }

            try {
              const parsed = JSON.parse(body) as T;
              resolve(parsed);
            } catch (parseErr) {
              reject(new Error(`Failed to parse JSON response from ${url.origin}${url.pathname}: ${(parseErr as Error).message}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error(`HTTP POST request timed out after ${timeoutMs}ms for ${url.origin}${url.pathname}`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(bodyString);
      req.end();
    });
  }
}
