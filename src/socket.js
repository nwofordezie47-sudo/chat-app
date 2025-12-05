import io from 'socket.io-client';

const socket = io.connect('http://192.168.100.49:3001');

export default socket;
