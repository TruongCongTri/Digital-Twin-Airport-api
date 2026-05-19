import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { env } from './env';

let io: SocketIOServer;

export const socketConfig = {
  /**
   * Initializes the Socket.io server and attaches it to the Express HTTP server.
   */
  init: (server: HTTPServer) => {
    io = new SocketIOServer(server, {
      cors: {
        origin: [env.CLIENT_URL],
        credentials: true,
      },
    });

    io.on('connection', (socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      });
    });

    return io;
  },

  /**
   * Retrieves the initialized Socket.io instance.
   * Throws an error if called before init().
   */
  getIO: () => {
    if (!io) {
      throw new Error('Socket.io has not been initialized!');
    }
    return io;
  },
};
