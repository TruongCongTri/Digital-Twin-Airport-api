import { createClient } from 'redis';
import { env } from '../configs/env';

class RedisCacheService {
  private client;
  public isConnected = false;

  constructor() {
    this.client = createClient({
      url: env.REDIS_URL || 'redis://127.0.0.1:6379',
      socket: {
        // Circuit Breaker: Stop spamming the console after 3 failed attempts
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            console.warn(
              '⚠️ [Redis] Server offline. Bypassing cache (Fallback to Postgres active).'
            );
            return new Error('Redis connection bypassed.');
          }
          return 500; // wait 500ms between attempts
        },
      },
    });

    // Suppress the massive block of ECONNREFUSED terminal spam
    this.client.on('error', (err: any) => {
      if (err?.code !== 'ECONNREFUSED' && err?.message !== 'Redis connection bypassed.') {
        console.error('[Redis Error]', err.message);
      }
    });

    this.client.on('ready', () => {
      console.log('🟢 [Redis] Connected and caching active.');
      this.isConnected = true;
    });

    this.client.connect().catch(() => {
      this.isConnected = false;
    });
  }

  /**
   * @method get
   * @description Safely attempts to retrieve a key. Returns null if Redis is offline.
   */
  public async get(key: string): Promise<string | null> {
    if (!this.isConnected) return null;
    try {
      return await this.client.get(key);
    } catch (_e) {
      return null;
    }
  }

  /**
   * @method setEx
   * @description Safely attempts to write a key. Fails silently if Redis is offline.
   */
  public async setEx(key: string, seconds: number, value: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.client.setEx(key, seconds, value);
    } catch (_e) {
      // Silently fail
    }
  }

  public async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`[Redis] Error deleting key ${key}:`, error);
    }
  }
}

// Export as a singleton instance
export default new RedisCacheService();
