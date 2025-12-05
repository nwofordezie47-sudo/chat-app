import io from 'socket.io-client';

const socket = io.connect('https://chat-app-f9bz.onrender.com');

export default socket;
