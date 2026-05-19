// Run this with: node test-socket.js
import io from 'socket.io-client';

// Connect to your HTTP server port
const socket = io('http://localhost:5000');

socket.on('connect', () => {
  console.log('Connected to Digital Twin Server!');
});

// Listen for the exact event emitted by your SimulationService
socket.on('sensor:stream', (data) => {
  console.log(`📡 [${data.type}] Sensor ${data.sensorId.substring(0,8)}... : ${data.value}`);
});