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

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


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
  try {
    const { username, email, password, profilePic } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      profilePic
    });

    await newUser.save();
    
    const userData = newUser.toObject();
    delete userData.password;
    
    res.status(201).json(userData);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const userData = user.toObject();
    delete userData.password;
    
    res.json(userData);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
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

// --- FRIEND & USER ENDPOINTS ---

app.get('/users/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.json([]);
    
    // Search for users whose username matches the query (case-insensitive)
    const users = await User.find({ username: { $regex: query, $options: 'i' } })
                            .select('username profilePic');
    res.json(users);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

app.post('/friends/request', async (req, res) => {
  try {
    const { fromUser, toUser } = req.body;
    
    const targetUser = await User.findOne({ username: toUser });
    const sender = await User.findOne({ username: fromUser });
    
    if (!targetUser || !sender) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if friends already
    if (targetUser.friends.includes(sender._id)) {
       return res.status(400).json({ error: 'Already friends' });
    }

    // Check if request already exists
    const existingReq = targetUser.friendRequests.find(r => r.from.toString() === sender._id.toString());
    if (existingReq) {
      return res.status(400).json({ error: 'Request already sent or pending' });
    }

    targetUser.friendRequests.push({ from: sender._id, status: 'pending' });
    await targetUser.save();

    res.json({ message: 'Friend request sent' });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/friends/accept', async (req, res) => {
  try {
    const { username, fromUsername } = req.body;
    
    const userToAccept = await User.findOne({ username });
    const userWhoSent = await User.findOne({ username: fromUsername });

    if (!userToAccept || !userWhoSent) return res.status(404).json({ error: 'User not found' });

    // Update request status (or remove it)
    userToAccept.friendRequests = userToAccept.friendRequests.filter(
      req => req.from.toString() !== userWhoSent._id.toString()
    );

    // Add to friends lists
    if (!userToAccept.friends.includes(userWhoSent._id)) {
      userToAccept.friends.push(userWhoSent._id);
    }
    if (!userWhoSent.friends.includes(userToAccept._id)) {
      userWhoSent.friends.push(userToAccept._id);
    }

    await userToAccept.save();
    await userWhoSent.save();

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    console.error('Accept request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/friends/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).populate('friends', 'username profilePic');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user.friends);
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/friends/requests/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).populate('friendRequests.from', 'username profilePic');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Filter out only pending ones if needed and format
    const pending = user.friendRequests.filter(req => req.status === 'pending').map(req => req.from);
    res.json(pending);
  } catch (err) {
    console.error('Get requests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- GROUP ENDPOINTS ---

app.post('/groups', async (req, res) => {
  try {
    const { name, members, admin } = req.body;
    
    const adminUser = await User.findOne({ username: admin });
    if (!adminUser) return res.status(404).json({ error: 'Admin user not found' });

    // Find all users from the members array
    const memberUsers = await User.find({ username: { $in: members } });
    const memberIds = memberUsers.map(u => u._id);
    
    // Add admin to members if not already there
    if (!memberIds.some(id => id.toString() === adminUser._id.toString())) {
       memberIds.push(adminUser._id);
    }

    const newGroup = new Group({
      name,
      members: memberIds,
      admins: [adminUser._id]
    });

    await newGroup.save();

    // Also update all members' 'groups' array
    await User.updateMany(
      { _id: { $in: memberIds } },
      { $push: { groups: newGroup._id } }
    );

    res.status(201).json(newGroup);
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

app.get('/groups/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).populate('groups');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // The frontend expects group object to have 'name' and 'members' array (usernames)
    // We should probably populate members to send usernames, or just send group names 
    // depending on what the frontend actually needs. Let's populate members inside groups.
    const populatedUser = await User.findOne({ username: req.params.username }).populate({
      path: 'groups',
      populate: { path: 'members', select: 'username' }
    });

    // Format for frontend
    const formattedGroups = populatedUser.groups.map(g => ({
      _id: g._id,
      name: g.name,
      members: g.members.map(m => m.username)
    }));

    res.json(formattedGroups);
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- MESSAGE ENDPOINTS ---

app.get('/messages/:room', async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.room }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

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

app.use(express.static(path.join(__dirname, '../dist')));


app.get('*path', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
  console.log('Database URL:', process.env.MONGODB_URI ? 'Defined' : 'Using Default');
});
