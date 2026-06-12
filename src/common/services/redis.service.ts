import { createClient } from 'redis';
import { env } from '../configs/env';

// Define the shape of our local memory cache
interface LocalCacheItem {
  value: string;
  expiry: number;
}

class RedisCacheService {
  private client;
  public isConnected = false;

  // L1 In-Memory Cache
  private localCache: Map<string, LocalCacheItem> = new Map();

  // Set how long data lives in Node.js memory before checking Redis again.
  // Example: 1 Hour (3600 seconds * 1000 ms)
  private readonly LOCAL_TTL_MS = 60 * 60 * 1000;

  constructor() {
    this.client = createClient({
      url: env.REDIS_URL || 'redis://127.0.0.1:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            console.warn(
              '⚠️ [Redis] Server offline. Bypassing cache (Fallback to Postgres active).'
            );
            return new Error('Redis connection bypassed.');
          }
          return 500;
        },
      },
    });

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

    // Run a silent garbage collector every 10 minutes to prevent memory leaks
    setInterval(
      () => {
        const now = Date.now();
        for (const [key, item] of this.localCache.entries()) {
          if (item.expiry <= now) {
            this.localCache.delete(key);
          }
        }
      },
      10 * 60 * 1000
    ).unref(); // .unref() ensures this timer won't prevent Node from exiting
  }

  /**
   * @method get
   * @description Checks L1 (Memory) first. If miss, checks L2 (Redis).
   */
  public async get(key: string): Promise<string | null> {
    const now = Date.now();

    // 1. Check L1 Cache (Cost: 0 Upstash Commands)
    const localData = this.localCache.get(key);
    if (localData && localData.expiry > now) {
      return localData.value;
    }

    if (!this.isConnected) return null;

    try {
      // 2. Fallback to L2 Cache (Cost: 1 Upstash Command)
      const value = await this.client.get(key);

      // 3. If found in Redis, save it to local memory for the next hour
      if (value) {
        this.localCache.set(key, {
          value,
          expiry: now + this.LOCAL_TTL_MS,
        });
      }

      return value;
    } catch (_e) {
      return null;
    }
  }

  /**
   * @method setEx
   * @description Writes to both Redis and local memory simultaneously.
   */
  public async setEx(key: string, seconds: number, value: string): Promise<void> {
    // 1. Update L1 Memory immediately
    this.localCache.set(key, {
      value,
      expiry: Date.now() + Math.min(seconds * 1000, this.LOCAL_TTL_MS),
    });

    if (!this.isConnected) return;

    try {
      // 2. Update L2 Redis
      await this.client.setEx(key, seconds, value);
    } catch (_e) {
      // Silently fail
    }
  }

  /**
   * @method del
   * @description Deletes from both Memory and Redis.
   */
  public async del(key: string): Promise<void> {
    // 1. Delete from L1 Memory
    this.localCache.delete(key);

    if (!this.isConnected) return;

    try {
      // 2. Delete from L2 Redis
      await this.client.del(key);
    } catch (error) {
      console.error(`[Redis] Error deleting key ${key}:`, error);
    }
  }
}

export default new RedisCacheService();
