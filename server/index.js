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

dotenv.config();


mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/messaging-app')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging Middleware
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('[BODY]', JSON.stringify(req.body));
  }
  
  // Capture response status
  const originalSend = res.send;
  res.send = function (data) {
    console.log(`[RESPONSE] ${res.statusCode} ${req.url}`);
    if (res.statusCode >= 400) {
        console.log('[ERROR RESPONSE]', data);
    }
    originalSend.apply(res, arguments);
  };
  
  next();
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});


app.post('/register', async (req, res) => {
  try {
    const { username, email, password, profilePic } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword, profilePic });
    await newUser.save();

    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await User.findOne({ username });

    if (!user) return res.status(400).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    res.json({ message: 'Login successful', username: user.username, profilePic: user.profilePic });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Search Users
app.get('/users/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);
    const users = await User.find({ username: { $regex: query, $options: 'i' } }).select('username profilePic');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send Friend Request
app.post('/friends/request', async (req, res) => {
  try {
    const { fromUser, toUser } = req.body;
    const sender = await User.findOne({ username: fromUser });
    const receiver = await User.findOne({ username: toUser });

    if (!sender || !receiver) return res.status(404).json({ error: 'User not found' });
    if (sender.username === receiver.username) return res.status(400).json({ error: 'Cannot add yourself' });

    // Check if already friends or requested
    if (receiver.friendRequests.some(r => r.from.toString() === sender._id.toString())) {
      return res.status(400).json({ error: 'Request already sent' });
    }
    if (receiver.friends.includes(sender._id)) {
      return res.status(400).json({ error: 'Already friends' });
    }

    receiver.friendRequests.push({ from: sender._id, status: 'pending' });
    await receiver.save();

    res.json({ message: 'Friend request sent' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept Friend Request
app.post('/friends/accept', async (req, res) => {
  try {
    const { username, fromUsername } = req.body;
    const user = await User.findOne({ username });
    const sender = await User.findOne({ username: fromUsername });

    if (!user || !sender) return res.status(404).json({ error: 'User not found' });

    const request = user.friendRequests.find(r => r.from.toString() === sender._id.toString() && r.status === 'pending');
    if (!request) return res.status(400).json({ error: 'No pending request found' });

    request.status = 'accepted';
    user.friends.push(sender._id);
    sender.friends.push(user._id);

    await user.save();
    await sender.save();

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Friends
app.get('/friends/:username', async (req, res) => {
  try {
    console.log(`[DEBUG] GET /friends/${req.params.username}`);
    const user = await User.findOne({ username: req.params.username }).populate('friends', 'username profilePic');
    if (!user) {
        console.log(`[DEBUG] User not found: ${req.params.username}`);
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.friends);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Friend Requests
app.get('/friends/requests/:username', async (req, res) => {
  try {
    console.log(`[DEBUG] GET /friends/requests/${req.params.username}`);
    const user = await User.findOne({ username: req.params.username }).populate('friendRequests.from', 'username profilePic');
    if (!user) {
        console.log(`[DEBUG] User not found: ${req.params.username}`);
        return res.status(404).json({ error: 'User not found' });
    }
    const pending = user.friendRequests.filter(r => r.status === 'pending');
    res.json(pending);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create Group
app.post('/groups', async (req, res) => {
  try {
    const { name, members, admin } = req.body; // members is array of usernames
    const adminUser = await User.findOne({ username: admin });
    if (!adminUser) return res.status(404).json({ error: 'Admin not found' });

    const memberUsers = await User.find({ username: { $in: members } });
    const memberIds = memberUsers.map(u => u._id);
    memberIds.push(adminUser._id); // Add admin to members

    const newGroup = new Group({
      name,
      members: memberIds,
      admins: [adminUser._id]
    });
    await newGroup.save();

    // specific logic: add group to users' groups array
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $push: { groups: newGroup._id } }
    );

    res.json({ message: 'Group created', group: newGroup });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get User Groups
app.get('/groups/:username', async (req, res) => {
  try {
    console.log(`[DEBUG] GET /groups/${req.params.username}`);
    const user = await User.findOne({ username: req.params.username }).populate('groups');
    if (!user) {
        console.log(`[DEBUG] User not found: ${req.params.username}`);
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


const users = {}; 

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('login', (username) => {
    users[socket.id] = username;
    io.emit('user_list', Object.values(users)); 
  });

  socket.on('join_room', async (data) => {
    try {
      socket.join(data);
      console.log(`User ${users[socket.id] || socket.id} joined room: ${data}`);
      
      
      const history = await Message.find({ room: data }).sort({ _id: 1 });
      if (history.length > 0) {
        socket.emit('load_messages', history);
      }
    } catch (err) {
      console.error('Error in join_room:', err);
    }
  });

  socket.on('join_private', async (targetUser) => {
    try {
      const currentUser = users[socket.id];
      if (!currentUser) return;

      const roomName = [currentUser, targetUser].sort().join('_');
      
      socket.join(roomName);
      socket.emit('private_room_joined', { room: roomName, partner: targetUser });

      
      const targetSocketId = Object.keys(users).find(key => users[key] === targetUser);
      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.join(roomName);
        }
      }
      
      
      const history = await Message.find({ room: roomName }).sort({ _id: 1 });
      if (history.length > 0) {
        socket.emit('load_messages', history);
      }
    } catch (err) {
      console.error('Error in join_private:', err);
    }
  });

  socket.on('send_message', async (data) => {
    try {
      
      const newMessage = new Message(data);
      await newMessage.save();

      socket.to(data.room).emit('receive_message', data);
    } catch (err) {
      console.error('Error in send_message:', err);
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('typing', data);
  });

  socket.on('friend_request', ({ to, from }) => {
    // Find socket ID of 'to' user
    const targetSocketId = Object.keys(users).find(key => users[key] === to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend_request_received', { from });
    }
  });

  socket.on('friend_accept', ({ to, from }) => {
    const targetSocketId = Object.keys(users).find(key => users[key] === to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend_request_accepted', { from });
    }
  });

  socket.on('group_created', ({ groupName, members }) => {
     // Notify members
     members.forEach(member => {
         const targetSocketId = Object.keys(users).find(key => users[key] === member);
         if (targetSocketId) {
             io.to(targetSocketId).emit('group_added', { groupName });
         }
     });
  });

  socket.on('read_messages', async ({ room, user }) => {
    try {
      const result = await Message.updateMany(
        { room, author: { $ne: user }, read: false },
        { $set: { read: true } }
      );
      
      if (result.modifiedCount > 0) {
        io.to(room).emit('messages_read', { room });
      }
    } catch (err) {
      console.error('Error in read_messages:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User Disconnected', socket.id);
    delete users[socket.id];
    io.emit('user_list', Object.values(users));
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
  console.log('Database URL:', process.env.MONGODB_URI ? 'Defined' : 'Using Default');
});
