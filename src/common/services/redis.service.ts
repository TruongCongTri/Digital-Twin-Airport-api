import { createClient } from 'redis';
import { env } from '../configs/env';

// Define the shape of our local memory cache (null = cached miss)
interface LocalCacheItem {
  value: string | null;
  expiry: number;
}

class RedisCacheService {
  private client;
  public isConnected = false;

  // L1 In-Memory Cache
  private localCache: Map<string, LocalCacheItem> = new Map();

  // Tracks what was last written to Redis so identical payloads are not re-sent
  private remoteWrites: Map<string, LocalCacheItem> = new Map();

  // Set how long data lives in Node.js memory before checking Redis again.
  // Example: 1 Hour (3600 seconds * 1000 ms)
  private readonly LOCAL_TTL_MS = 60 * 60 * 1000;

  // Remember misses briefly so a missing key does not cost 1 Redis command per request
  private readonly MISS_TTL_MS = 30 * 1000;

  constructor() {
    this.client = createClient({
      url: env.REDIS_URL,
      socket: {
        // Keep retrying with backoff (capped at 30s) so the cache comes back on its own
        // when the local Docker Redis is started after the API.
        reconnectStrategy: (retries) => {
          if (retries === 3) {
            console.warn(
              '⚠️ [Redis] Server offline. Bypassing cache (Fallback to Postgres active). Retrying in background...'
            );
          }
          return Math.min(500 * 2 ** retries, 30_000);
        },
      },
    });

    this.client.on('error', (err: any) => {
      if (err?.code !== 'ECONNREFUSED') {
        console.error('[Redis Error]', err.message);
      }
    });

    this.client.on('ready', () => {
      console.log('🟢 [Redis] Connected and caching active.');
      this.isConnected = true;
    });

    this.client.on('end', () => {
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      this.isConnected = false;
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
        for (const [key, item] of this.remoteWrites.entries()) {
          if (item.expiry <= now) {
            this.remoteWrites.delete(key);
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

      // 3. Save to local memory: hits for the next hour, misses for 30s
      this.localCache.set(key, {
        value,
        expiry: now + (value ? this.LOCAL_TTL_MS : this.MISS_TTL_MS),
      });

      return value;
    } catch (_e) {
      return null;
    }
  }

  /**
   * @method setLocal
   * @description Writes to local memory only (Cost: 0 Upstash Commands).
   * Use for high-frequency data; persist it with setEx at a slower cadence.
   */
  public setLocal(key: string, seconds: number, value: string): void {
    this.localCache.set(key, {
      value,
      expiry: Date.now() + Math.min(seconds * 1000, this.LOCAL_TTL_MS),
    });
  }

  /**
   * @method setEx
   * @description Writes to both Redis and local memory simultaneously.
   * Skips the Redis write when the same value is already stored there with
   * more than half of its TTL remaining.
   */
  public async setEx(key: string, seconds: number, value: string): Promise<void> {
    // 1. Update L1 Memory immediately
    this.setLocal(key, seconds, value);

    if (!this.isConnected) return;

    const now = Date.now();
    const lastWrite = this.remoteWrites.get(key);
    if (lastWrite && lastWrite.value === value && lastWrite.expiry - now > (seconds * 1000) / 2) {
      return;
    }

    try {
      // 2. Update L2 Redis
      await this.client.setEx(key, seconds, value);
      this.remoteWrites.set(key, { value, expiry: now + seconds * 1000 });
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
    this.remoteWrites.delete(key);

    if (!this.isConnected) return;

    try {
      // 2. Delete from L2 Redis
      await this.client.del(key);
    } catch (error) {
      console.error(`[Redis] Error deleting key ${key}:`, error);
    }
  }

  /**
   * @method quit
   * @description Closes the Redis connection during graceful shutdown.
   */
  public async quit(): Promise<void> {
    if (!this.client.isOpen) return;
    try {
      await this.client.quit();
    } catch (_e) {
      // Already closed
    }
  }
}

export default new RedisCacheService();
