import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in dev
    methods: ["GET", "POST"]
  }
});

// Paths
const USERS_FILE = path.join(__dirname, 'users.json');

// Helper Functions
const getUsers = () => {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE));
};

const saveUsers = (users) => {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

// Endpoints
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const users = getUsers();
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = { username, password: hashedPassword };
    users.push(newUser);
    saveUsers(users);

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username);

    if (!user) return res.status(400).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    res.json({ message: 'Login successful', username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Simple in-memory store: { "roomName": [message1, message2, ...] }
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

const getMessages = () => {
  if (!fs.existsSync(MESSAGES_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE));
  } catch (e) {
    return {};
  }
};

const saveMessages = async (msgs) => {
  try {
    await fs.promises.writeFile(MESSAGES_FILE, JSON.stringify(msgs, null, 2));
  } catch (err) {
    console.error('Error saving messages:', err);
  }
};

let messages = getMessages();

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

    // Join the target user in the background if they are online
    const targetSocketId = Object.keys(users).find(key => users[key] === targetUser);
    if (targetSocketId) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.join(roomName);
        // We no longer emit 'private_room_joined' to the target socket here.
        // This keeps the chat in the background for them until they open it.
      }
    }
    
    // Load history for the requester only
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
    
    // Save asynchronously, don't wait
    saveMessages(messages);

    socket.to(data.room).emit('receive_message', data);
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('typing', data);
  });

  socket.on('read_messages', ({ room, user }) => {
    if (messages[room]) {
      let changed = false;
      messages[room].forEach(msg => {
        if (msg.author !== user && !msg.read) {
          msg.read = true;
          changed = true;
        }
      });
      if (changed) {
        saveMessages(messages);
        io.to(room).emit('messages_read', { room });
      }
    }
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
