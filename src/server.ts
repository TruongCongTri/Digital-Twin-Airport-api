/**
 * @file server.ts
 * @description Application bootstrap with global error trapping.
 */
import { prisma } from './common/configs/prisma';
import { env } from './common/configs/env';
import app from './app';
import { createServer } from 'http';
import { socketConfig } from './common/configs/socket';
import { SimulationService } from './modules/simulation/simulation.service';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as SocketIOServer } from 'socket.io';

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

    // 2. Redis Check
    console.log('[System]: Connecting Redis...');
    const pubClient = createClient({ url: env.REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    console.log('[System]: Redis connected.');

    // 3. Server Setup
    const httpServer = createServer(app);
    const io = new SocketIOServer(httpServer, {
      adapter: createAdapter(pubClient, subClient),
      cors: { origin: [env.CLIENT_URL], credentials: true },
    });

    socketConfig.init(io);

    // 4. Force Bind to 0.0.0.0 and correct PORT
    const port = parseInt(process.env.PORT || '10000', 10);

    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`=================================`);
      console.log(`API Server is running on 0.0.0.0:${port}`);
      console.log(`=================================`);
    });

    // Shutdown logic...
    const gracefulShutdown = async () => {
      console.log('\n🛑 Shutting down...');
      SimulationService.getInstance().stop();
      await prisma.$disconnect();
      await pubClient.quit();
      await subClient.quit();
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
