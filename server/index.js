import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in dev
    methods: ["GET", "POST"]
  }
});

// Simple in-memory store: { "roomName": [message1, message2, ...] }
const messages = {};

// User Registry: { "socketId": "username" }
const users = {}; 

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('login', (username) => {
    users[socket.id] = username;
    io.emit('user_list', Object.values(users)); // Broadcast all active users
  });

  socket.on('join_room', (data) => {
    socket.join(data);
    console.log(`User ${users[socket.id] || socket.id} joined room: ${data}`);
    
    // Send existing messages
    if (messages[data]) {
      socket.emit('load_messages', messages[data]);
    }
  });

  socket.on('join_private', (targetUser) => {
    const currentUser = users[socket.id];
    if (!currentUser) return;

    // Create a unique room name based on both usernames (alphabetically sorted)
    // e.g. "Alice_Bob" (consistent regardless of who initiated)
    const roomName = [currentUser, targetUser].sort().join('_');
    
    socket.join(roomName);
    socket.emit('private_room_joined', { room: roomName, partner: targetUser });
    
    // Load history for this private room
    if (messages[roomName]) {
      socket.emit('load_messages', messages[roomName]);
    }
  });

  socket.on('send_message', (data) => {
    // Store message
    if (!messages[data.room]) {
      messages[data.room] = [];
    }
    messages[data.room].push(data);

    socket.to(data.room).emit('receive_message', data);
  });

  socket.on('disconnect', () => {
    console.log('User Disconnected', socket.id);
    delete users[socket.id];
    io.emit('user_list', Object.values(users));
  });
});

const PORT = 3001;

server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});
