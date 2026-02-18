import io from 'socket.io-client';

const socket = io.connect(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', {
  autoConnect: false 
});

export default socket;
