import { Server } from 'socket.io'; // FIX: Use 'Server'

let io: Server;

export const socketConfig = {
  // Pass the io instance here
  init: (ioInstance: Server) => {
    io = ioInstance;

    io.on('connection', (socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id}`);
      socket.on('disconnect', () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error('Socket.io has not been initialized!');
    }
    return io;
  },
};
