/**
 * @file server.ts
 * @description Application bootstrap and server entry point.
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
import redisCache from './common/services/redis.service'; // Ensure this path is correct

const checkDatabaseConnection = async () => {
  try {
    await prisma.$connect();
    console.log('[Database]: Connected successfully!');
  } catch (error) {
    console.error('[Database]: Failed to connect. Error:', error);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    console.log('[System]: Starting DB check...');
    await checkDatabaseConnection();
    console.log('[System]: DB check passed.');

    console.log('[System]: Connecting Redis...');
    // 2. Setup Redis for Pub/Sub and Cache
    const pubClient = createClient({ url: env.REDIS_URL });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    console.log('[Redis]: Pub/Sub clients connected.');

    // --- TEST REDIS CONNECTION ---
    try {
      await redisCache.setEx('demo-ping', 60, 'pong');
      const pingResult = await redisCache.get('demo-ping');
      if (pingResult === 'pong') {
        console.log('✅ [Redis]: Cache Service test passed.');
      }
    } catch (_err) {
      console.error('⚠️ [Redis]: Cache Service test failed, but Pub/Sub is active.');
    }

    const httpServer = createServer(app);

    // 3. Initialize Socket.io with Redis Adapter
    const io = new SocketIOServer(httpServer, {
      adapter: createAdapter(pubClient, subClient),
      cors: { origin: [env.CLIENT_URL], credentials: true },
    });

    // 4. Attach Socket.IO to the native HTTP server
    socketConfig.init(io);

    const port = parseInt(env.PORT || '10000', 10);
    const serverInstance = httpServer.listen(port, '0.0.0.0', () => {
      console.log(`=================================`);
      console.log(`API Server is running at: http://localhost:${port}`);
      console.log(`Accepting connections from: ${env.CLIENT_URL}`);
      console.log(`=================================`);
    });

    // ==========================================
    // GRACEFUL SHUTDOWN LOGIC
    // ==========================================
    const gracefulShutdown = async () => {
      console.log('\n🛑 Shutting down gracefully...');

      // Stop simulation
      const sim = SimulationService.getInstance();
      sim.stop();
      console.log('✅ Simulation engine stopped.');

      // Disconnect DB
      await prisma.$disconnect();
      console.log('✅ Database disconnected.');

      // Disconnect Redis
      await pubClient.quit();
      await subClient.quit();
      console.log('✅ Redis clients disconnected.');

      // Close Server
      serverInstance.close(() => {
        console.log('✅ HTTP server closed. Goodbye!');
        process.exit(0);
      });
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

startServer();
