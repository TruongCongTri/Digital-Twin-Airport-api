/**
 * @file server.ts
 * @description Application bootstrap and server entry point.
 * Ensures infrastructure (Database) is ready before accepting incoming HTTP traffic.
 * @module Server
 */
import { prisma } from './common/configs/prisma';
import { env } from './common/configs/env';
import app from './app';
import { createServer } from 'http'; // Import native HTTP
import { socketConfig } from './common/configs/socket'; // Import Socket.IO config

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

    httpServer.listen(port, () => {
      console.log(`=================================`);
      console.log(`API Server is running at: http://localhost:${port}`);
      console.log(`Accepting connections from: ${env.CLIENT_URL}`);
      console.log(`=================================`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

startServer();
