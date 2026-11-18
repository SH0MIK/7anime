export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;     // Number of failures before tripping (default: 3)
  cooldownPeriodMs?: number;     // Time in OPEN state before trying probe in HALF_OPEN (default: 60s)
  probeThreshold?: number;       // Number of successful probes to close circuit (default: 2)
  name: string;
}

export class CircuitBreaker {
  public readonly name: string;
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successProbeCount = 0;
  private lastFailureTime = 0;
  private failureThreshold: number;
  private cooldownPeriodMs: number;
  private probeThreshold: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownPeriodMs = options.cooldownPeriodMs ?? 60000;
    this.probeThreshold = options.probeThreshold ?? 2;
  }

  public getState(): CircuitState {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.cooldownPeriodMs) {
        this.state = 'HALF_OPEN';
        this.successProbeCount = 0;
        console.log(`[CircuitBreaker:${this.name}] Cooldown elapsed. Transitioning from OPEN to HALF_OPEN probe.`);
      }
    }
    return this.state;
  }

  public isAvailable(): boolean {
    const s = this.getState();
    return s === 'CLOSED' || s === 'HALF_OPEN';
  }

  public recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successProbeCount++;
      if (this.successProbeCount >= this.probeThreshold) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successProbeCount = 0;
        console.log(`[CircuitBreaker:${this.name}] Probes succeeded. Restored circuit to CLOSED (healthy).`);
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  public recordFailure(err?: Error): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      console.warn(`[CircuitBreaker:${this.name}] Probe failed. Tripped back to OPEN. Error: ${err?.message}`);
    } else if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`[CircuitBreaker:${this.name}] Failure threshold (${this.failureThreshold}) reached. Tripping circuit to OPEN. Error: ${err?.message}`);
    }
  }

  /**
   * Executes a protected call through the circuit breaker.
   */
  public async execute<T>(
    operation: () => Promise<T>,
    fallback?: (error?: Error) => Promise<T>
  ): Promise<T> {
    if (!this.isAvailable()) {
      if (fallback) {
        return fallback(new Error(`CircuitBreaker for ${this.name} is OPEN.`));
      }
      throw new Error(`CircuitBreaker for ${this.name} is OPEN.`);
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (err: any) {
      // Do not treat legitimate 404s or empty data as provider outages
      const isOutage = err?.message?.includes('timeout') ||
        err?.message?.includes('500') ||
        err?.message?.includes('502') ||
        err?.message?.includes('503') ||
        err?.message?.includes('504') ||
        err?.message?.includes('429') ||
        err?.message?.includes('ECONNREFUSED') ||
        err?.message?.includes('ENOTFOUND');

      if (isOutage) {
        this.recordFailure(err);
      }

      if (fallback) {
        return fallback(err);
      }
      throw err;
    }
  }

  public getStatus() {
    return {
      name: this.name,
      state: this.getState(),
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
    };
  }
}

export const anilistBreaker = new CircuitBreaker({ name: 'AniList', failureThreshold: 3, cooldownPeriodMs: 60000 });
export const malBreaker = new CircuitBreaker({ name: 'MyAnimeList', failureThreshold: 3, cooldownPeriodMs: 60000 });
export const tmdbBreaker = new CircuitBreaker({ name: 'TMDB', failureThreshold: 4, cooldownPeriodMs: 45000 });
