import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import Group from './models/Group.js';
import Message from './models/Message.js';
import User from './models/User.js';
// Expo SDK Import
import { Expo } from 'expo-server-sdk';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Initialize Expo SDK
const expo = new Expo();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/messaging-app')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ... (Logging middleware remains the same, omitted for brevity in replacement if unchanged, but for full file context I will keep it clean or just append functions if possible. 
// Since replace_file_content replaces a block, I will target specific areas or rewriting the whole file is too big. 
// I will start by adding imports and the helper function at the top, then adding the endpoint, then the socket listeners.)

// I'll effectively rewrite the file to ensure everything is in place correctly without complex piecemeal edits.
// Actually, piecemeal is better for stability.

// STRATEGY: 
// 1. Add Import and Helper Function at top.
// 2. Add Endpoint.
// 3. Update Socket Listeners.

// WAIT. replace_file_content replaces a *block*. I can't easily do 3 separate edits in one tool call if they are far apart. 
// Refactoring to just do the import and setup first.

// ... 

// Request Logging Middleware
app.use((req, res, next) => {
// ...
  next();
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});


// Helper Function for Push Notifications
const sendPushNotification = async (pushToken, title, body, data = {}) => {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error(`Push token ${pushToken} is not a valid Expo push token`);
    return;
  }

  const messages = [{
    to: pushToken,
    sound: 'default',
    title,
    body,
    data,
  }];

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (let chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        console.error('Error sending push notification chunk:', error);
      }
    }
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
};


app.post('/register', async (req, res) => {
// ...
});

app.post('/login', async (req, res) => {
// ...
});

// Save Push Token Endpoint
app.post('/user/push-token', async (req, res) => {
  try {
    const { username, token } = req.body;
    if (!username || !token) return res.status(400).json({ error: 'Username and token required' });

    await User.findOneAndUpdate({ username }, { pushToken: token });
    res.json({ message: 'Push token updated' });
  } catch (err) {
    console.error('Error saving push token:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ...

// ... (Rest of endpoints)

// ...

// Socket.io Logic
const users = {}; 

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('login', async (username) => {
    users[socket.id] = username;
    // Update socket ID mapping? Ideally we use DB for push tokens so we just need to know who is who.
    io.emit('user_list', Object.values(users)); 
  });

  // ... (join_room, join_private)

  socket.on('send_message', async (data) => {
    try {
      const newMessage = new Message(data);
      await newMessage.save();

      socket.to(data.room).emit('receive_message', data);

      // Push Notification Logic
      // 1. Identify recipients
      // If room has underscore, it's private.
      if (data.room.includes('_')) {
        const parts = data.room.split('_');
        const receiverUsername = parts.find(u => u !== data.sender);
        
        if (receiverUsername) {
             const receiverUser = await User.findOne({ username: receiverUsername });
             if (receiverUser && receiverUser.pushToken) {
                 await sendPushNotification(receiverUser.pushToken, `New Message from ${data.sender}`, data.text || 'Sent an attachment', { type: 'message', room: data.room });
             }
        }
      } else {
        // Group logic (simplified for now, might need optimization for large groups)
        const group = await Group.findOne({ name: data.room }).populate('members');
        if (group) {
            for (const member of group.members) {
                if (member.username !== data.sender && member.pushToken) {
                     await sendPushNotification(member.pushToken, `#${data.room}: ${data.sender}`, data.text || 'Sent an attachment', { type: 'message', room: data.room });
                }
            }
        }
      }

    } catch (err) {
      console.error('Error in send_message:', err);
    }
  });

  // ... (typing)

  socket.on('friend_request', async ({ to, from }) => {
    // Socket emit
    const targetSocketId = Object.keys(users).find(key => users[key] === to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend_request_received', { from });
    }

    // Push Notification
    const receiverUser = await User.findOne({ username: to });
    if (receiverUser && receiverUser.pushToken) {
        await sendPushNotification(receiverUser.pushToken, 'New Friend Request', `${from} sent you a friend request!`, { type: 'friend_request' });
    }
  });

  socket.on('friend_accept', async ({ to, from }) => {
    const targetSocketId = Object.keys(users).find(key => users[key] === to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend_request_accepted', { from });
    }

    // Push Notification
    const receiverUser = await User.findOne({ username: to });
    if (receiverUser && receiverUser.pushToken) {
        await sendPushNotification(receiverUser.pushToken, 'Friend Request Accepted', `${from} accepted your friend request!`, { type: 'friend_accept' });
    }
  });

  // ... (rest)
});


const PORT = process.env.PORT || 3001;

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
  console.log('Database URL:', process.env.MONGODB_URI ? 'Defined' : 'Using Default');
});
