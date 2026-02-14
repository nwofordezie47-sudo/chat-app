import io from 'socket.io-client';

const socket = io.connect('http://localhost:3001', {
  autoConnect: false // We connect manually after login
});

export default socket;
