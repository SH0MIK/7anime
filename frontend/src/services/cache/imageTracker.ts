/**
 * Negative caching and suppression tracker for broken or failed image URLs.
 * Prevents continuous 404/network retries across components and page transitions.
 */
class ImageTracker {
  private brokenUrls = new Map<string, number>();
  private readonly DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown

  public isBroken(url: string | null | undefined): boolean {
    if (!url) return false;
    const expiresAt = this.brokenUrls.get(url);
    if (!expiresAt) return false;

    if (Date.now() > expiresAt) {
      this.brokenUrls.delete(url);
      return false;
    }
    return true;
  }

  public markBroken(url: string | null | undefined, cooldownMs = this.DEFAULT_COOLDOWN_MS): void {
    if (!url) return;
    this.brokenUrls.set(url, Date.now() + cooldownMs);
  }

  public clear(): void {
    this.brokenUrls.clear();
  }

  public size(): number {
    return this.brokenUrls.size;
  }
}

export const imageTracker = new ImageTracker();
