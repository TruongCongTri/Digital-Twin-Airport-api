/**
 * @file server.ts
 * @description Application bootstrap with global error trapping.
 */
import { prisma } from './common/configs/prisma';
import { env } from './common/configs/env';
import app from './app';

import { createServer } from 'http';
import { socketConfig } from './common/configs/socket';
import { SimulationService } from './modules/simulation/simulation-v2.service';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as SocketIOServer, ServerOptions } from 'socket.io';
import redisClient from './common/services/redis.service';

// --- GLOBAL CRASH HANDLERS ---
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const startServer = async () => {
  try {
    console.log('[System]: server.ts has started!');
    console.log('[System]: Starting initialization...');

    // 1. Database Check
    await prisma.$connect();
    console.log('[System]: DB Connected.');

    // 2. Socket.IO Adapter
    // The Redis adapter turns EVERY emit into a Redis PUBLISH. With a single API instance
    // the default in-memory adapter is enough, so it is opt-in via SOCKET_REDIS_ADAPTER.
    let pubClient: ReturnType<typeof createClient> | null = null;
    let subClient: ReturnType<typeof createClient> | null = null;
    const socketOptions: Partial<ServerOptions> = {
      cors: { origin: env.CLIENT_URL.split(','), credentials: true },
    };

    if (env.SOCKET_REDIS_ADAPTER) {
      console.log('[System]: Connecting Redis adapter for Socket.IO...');
      pubClient = createClient({ url: env.REDIS_URL });
      subClient = pubClient.duplicate();
      await Promise.all([pubClient.connect(), subClient.connect()]);
      socketOptions.adapter = createAdapter(pubClient, subClient);
      console.log('[System]: Socket.IO Redis adapter connected.');
    } else {
      console.log('[System]: Socket.IO using in-memory adapter (single instance).');
    }

    // 3. Server Setup
    const httpServer = createServer(app);
    const io = new SocketIOServer(httpServer, socketOptions);

    socketConfig.init(io);

    // 4. Force Bind to 0.0.0.0 and correct PORT
    const port = parseInt(process.env.PORT || '10000', 10);

    // Fail loudly if the port is taken. On Windows an IPv4-only bind could silently
    // share the port with another app on IPv6, and browsers resolve localhost to ::1 first.
    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `[FATAL] Port ${port} is already in use by another process. Change PORT in .env.`
        );
        process.exit(1);
      }
      throw err;
    });

    // No host = dual-stack (IPv6 + IPv4), so both localhost (::1) and 127.0.0.1 reach this API
    httpServer.listen(port, () => {
      console.log(`=================================`);
      console.log(`API Server is running on port ${port} (IPv4 + IPv6)`);
      console.log(`=================================`);
    });

    // Shutdown logic...
    const gracefulShutdown = async () => {
      console.log('\n🛑 Shutting down...');
      SimulationService.getInstance().stop();
      await prisma.$disconnect();
      await pubClient?.quit();
      await subClient?.quit();
      await redisClient.quit();
      httpServer.close(() => process.exit(0));
    };
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  } catch (error) {
    console.error('[FATAL] Initialization Error:', error);
    process.exit(1);
  }
};

startServer();
