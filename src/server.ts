/**
 * @file server.ts
 * @description Application bootstrap and server entry point.
 * Ensures infrastructure (Database) is ready before accepting incoming HTTP traffic.
 * @module Server
 */
import { prisma } from './common/configs/prisma.js';
import { env } from './common/configs/env.js';
import app from './app.js';
import { createServer } from 'http';
import { socketConfig } from './common/configs/socket.js';
import { SimulationService } from './modules/simulation/simulation.service.js';

/**
 * @function checkDatabaseConnection
 * @description Verifies that the Prisma client can establish a secure connection to the database.
 * Exits the process with code 1 if the connection fails.
 */
const checkDatabaseConnection = async () => {
  try {
    await prisma.$connect();
    console.log('[Database]: Connected successfully!');
  } catch (error) {
    console.error('[Database]: Failed to connect. Error:', error);
    process.exit(1);
  }
};

/**
 * @function startServer
 * @description Orchestrates the startup sequence: DB check -> HTTP listener.
 */
const startServer = async () => {
  try {
    await checkDatabaseConnection();

    // 1. Create native HTTP server wrapping the Express app
    const httpServer = createServer(app);

    // 2. Attach Socket.IO to the native HTTP server
    socketConfig.init(httpServer);

    const port = parseInt(env.PORT, 10);

    // Assign to a variable so we can close it gracefully later
    const serverInstance = httpServer.listen(port, () => {
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

      // 1. Stop the 3-second simulation loop to prevent zombie DB queries
      const sim = SimulationService.getInstance();
      sim.stop();
      console.log('✅ Simulation engine stopped.');

      // 2. Disconnect Database safely
      await prisma.$disconnect();
      console.log('✅ Database disconnected.');

      // 3. Close HTTP Server
      serverInstance.close(() => {
        console.log('✅ HTTP server closed. Goodbye!');
        process.exit(0);
      });
    };

    // Catch Ctrl+C and Docker/PM2 shutdown signals
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

startServer();
