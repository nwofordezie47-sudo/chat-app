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
import feedRoute from './routes/feed.js';
import personalSpaceRoute from './routes/personalSpace.js';
import storiesRoute from './routes/stories.js';
import uploadRoute from './routes/upload.js';
import agoraTokenRoute from './routes/agora.js';
// Expo SDK Import
import { Expo } from 'expo-server-sdk';

import path from 'path';
import { fileURLToPath } from 'url';
import { sendLoginAlertEmail, sendWelcomeEmail } from './utils/mailer.js';

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
app.use('/upload', uploadRoute);
app.use('/personal-space', personalSpaceRoute);
app.use('/feed', feedRoute);
app.use('/stories', storiesRoute);
app.use('/agora-token', agoraTokenRoute);


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

    // Send welcome email asynchronously
    sendWelcomeEmail(email, username);
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

    // Send login alert email asynchronously
    sendLoginAlertEmail(user.email, username);
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

// --- USER PROFILE ENDPOINTS ---

app.get('/user/profile/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/user/profile', async (req, res) => {
  try {
    const { username, bio, profilePic } = req.body;
    let updateFields = {};
    if (bio !== undefined) updateFields.bio = bio;
    if (profilePic !== undefined) updateFields.profilePic = profilePic;

    const user = await User.findOneAndUpdate({ username }, updateFields, { new: true }).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('Profile update error:', err);
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
    
    // Fetch last message for each friend
    const friendsWithMessages = await Promise.all(user.friends.map(async (friend) => {
        const roomName = [user.username, friend.username].sort().join('_');
        const lastMessage = await Message.findOne({ room: roomName }).sort({ _id: -1 }); // Sorting by _id gives chronological order if createdAt is missing
        
        return {
            _id: friend._id,
            username: friend.username,
            profilePic: friend.profilePic,
            lastMessage: lastMessage ? {
                text: lastMessage.message,
                createdAt: lastMessage.time,
                type: lastMessage.fileType,
                fileUrl: lastMessage.file,
                sender: lastMessage.author,
            } : null
        };
    }));

    // Sort friends by last action (most recent first)
    // If there is no last message, we can push them to the bottom by giving them a very old timestamp or 0
    friendsWithMessages.sort((a, b) => {
        const timeA = a.lastMessage && a.lastMessage.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const timeB = b.lastMessage && b.lastMessage.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return timeB - timeA;
    });

    res.json(friendsWithMessages);
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
    const populatedUser = await User.findOne({ username: req.params.username }).populate({
      path: 'groups',
      populate: { path: 'members', select: 'username profilePic' }
    });
    
    if (!populatedUser) return res.status(404).json({ error: 'User not found' });

    // Format for frontend and fetch last messages
    const formattedGroups = await Promise.all(populatedUser.groups.map(async (g) => {
      const lastMessage = await Message.findOne({ room: g.name }).sort({ _id: -1 });

      return {
        _id: g._id,
        name: g.name,
        groupPic: g.groupPic || '',
        isGroup: true,
        members: g.members.map(m => m.username),
        lastMessage: lastMessage ? {
            text: lastMessage.message,
            createdAt: lastMessage.time,
            type: lastMessage.fileType,
            fileUrl: lastMessage.file,
            sender: lastMessage.author,
        } : null
      };
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
    const messages = await Message.find({ room: req.params.room }).sort({ time: 1 });
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
    // Broadcast to all clients
    io.emit('update_user_list', Object.values(users)); 
  });

  socket.on('get_online_users', () => {
    // Send back to the requesting client
    socket.emit('update_user_list', Object.values(users));
  });

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room ${room}`);
  });

  socket.on('send_message', async (data, callback) => {
    try {
      const newMessage = new Message(data);
      await newMessage.save();

      socket.to(data.room).emit('receive_message', data);
      
      // Determine recipients for this message
      let recipientList = [];
      if (data.room.includes('_')) {
          recipientList = data.room.split('_');
      } else {
          const groupInfo = await Group.findOne({ name: data.room }).populate('members');
          if (groupInfo) {
              recipientList = groupInfo.members.map(m => m.username);
          }
      }

      // Emit a global event for the Friends screen to update its recent messages list
      io.emit('recent_message_update', {
          room: data.room,
          recipients: recipientList,
          message: {
              text: data.message,
              createdAt: data.time,
              type: data.fileType,
              fileUrl: data.file,
              sender: data.author,
          }
      });

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

      if (typeof callback === 'function') {
        callback({ status: 'ok' });
      }

    } catch (err) {
      console.error('Error in send_message:', err);
      if (typeof callback === 'function') {
        callback({ status: 'error' });
      }
    }
  });

  socket.on('typing', (data) => {
    socket.to(data.room).emit('user_typing', data);
  });

  socket.on('stop_typing', (data) => {
    socket.to(data.room).emit('user_stopped_typing', data);
  });

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

  // --- VOICE CALLING SOCKET LOGIC ---

  socket.on('initiate_call', async (data) => {
    // data: { from: 'caller_username', to: 'receiver_username', channelName: 'room_id' }
    const targetSocketId = Object.keys(users).find(key => users[key] === data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming_call', data);
    }
  });

  socket.on('accept_call', (data) => {
    // data: { from: 'receiver_username', to: 'caller_username', channelName: 'room_id' }
    const targetSocketId = Object.keys(users).find(key => users[key] === data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_accepted', data);
    }
  });

  socket.on('reject_call', (data) => {
    // data: { from: 'receiver_username', to: 'caller_username' }
    const targetSocketId = Object.keys(users).find(key => users[key] === data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_rejected', data);
    }
  });

  socket.on('end_call', (data) => {
    // data: { to: 'other_username' }
    const targetSocketId = Object.keys(users).find(key => users[key] === data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete users[socket.id];
    io.emit('update_user_list', Object.values(users));
  });

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
