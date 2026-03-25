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
import Streak from './models/Streak.js';
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
    const user = await User.findOne({ username: req.params.username }).populate('friends', 'username profilePic shotScore');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Fetch last message for each friend & check streaks
    const friendsWithMessages = await Promise.all(user.friends.map(async (friend) => {
        const roomName = [user.username, friend.username].sort().join('_');
        const lastMessage = await Message.findOne({ room: roomName, $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }).sort({ _id: -1 });
        
        const streak = await Streak.findOne({ room: roomName });

        return {
            _id: friend._id,
            username: friend.username,
            profilePic: friend.profilePic,
            shotScore: friend.shotScore,
            streak: streak ? streak.count : 0,
            lastMessage: lastMessage ? {
                text: lastMessage.message,
                createdAt: lastMessage.time,
                type: lastMessage.fileType,
                fileUrl: lastMessage.file,
                sender: lastMessage.author,
                read: lastMessage.read
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
    const { name, members, admin, description, groupPic } = req.body;
    
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
      description: description || '',
      groupPic: groupPic || '',
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

app.get('/groups/details/:name', async (req, res) => {
  try {
    const group = await Group.findOne({ name: req.params.name }).populate('members', 'username profilePic').populate('admins', 'username');
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (err) {
    console.error('Get group details error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/groups/:id', async (req, res) => {
  try {
    const { name, description, groupPic } = req.body;
    let updateFields = {};
    if (name) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;
    if (groupPic !== undefined) updateFields.groupPic = groupPic;

    const updatedGroup = await Group.findByIdAndUpdate(req.params.id, updateFields, { new: true });
    if (!updatedGroup) return res.status(404).json({ error: 'Group not found' });
    
    res.json(updatedGroup);
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

app.delete('/groups/:id', async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    // Remove group reference from all members
    await User.updateMany(
      { groups: group._id },
      { $pull: { groups: group._id } }
    );
    
    // Delete all messages in the group room
    await Message.deleteMany({ room: group.name });
    
    // Finally, run delete on the group document itself
    await Group.findByIdAndDelete(req.params.id);

    res.json({ message: 'Group deleted successfully' });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

app.put('/groups/:id/add-members', async (req, res) => {
  try {
    const { members } = req.body; // array of usernames
    const memberUsers = await User.find({ username: { $in: members } });
    const memberIds = memberUsers.map(u => u._id);

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Add only new members
    const newMemberIds = memberIds.filter(id => !group.members.includes(id));
    group.members.push(...newMemberIds);
    await group.save();

    // Update the groups array for the new members
    await User.updateMany(
      { _id: { $in: newMemberIds } },
      { $push: { groups: group._id } }
    );

    res.json(group);
  } catch (err) {
    console.error('Add members error:', err);
    res.status(500).json({ error: 'Failed to add members' });
  }
});

app.put('/groups/:id/remove-member', async (req, res) => {
  try {
    const { username } = req.body;
    const userToRemove = await User.findOne({ username });
    if (!userToRemove) return res.status(404).json({ error: 'User not found' });

    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.members = group.members.filter(id => id.toString() !== userToRemove._id.toString());
    
    // If they were an admin, remove from admins too
    group.admins = group.admins.filter(id => id.toString() !== userToRemove._id.toString());
    await group.save();

    // Remove from user's groups array
    userToRemove.groups = userToRemove.groups.filter(id => id.toString() !== group._id.toString());
    await userToRemove.save();

    res.json(group);
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
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
            read: lastMessage.read
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
    const now = new Date();
    // Fetch messages, excluding expired shots
    const messages = await Message.find({ 
      room: req.params.room,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: now } }
      ]
    }).sort({ time: 1 });
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
      if (data.fileType === 'shot') {
          // Set expiration to 48 hours and update user shot score
          data.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
          await User.updateOne({ username: data.author }, { $inc: { shotScore: 1 } });
          io.emit('shot_score_update', { username: data.author });

          // Handle Streaks for 1-on-1 chats
          if (data.room.includes('_')) {
             let streak = await Streak.findOne({ room: data.room });
             if (!streak) {
                 streak = new Streak({ room: data.room, count: 0 });
             }

             const now = new Date();
             const users = data.room.split('_');
             const otherUser = users.find(u => u !== data.author);

             const isUser1 = users[0] === data.author;
             
             if (isUser1) {
                 streak.lastShotUser1 = now;
             } else {
                 streak.lastShotUser2 = now;
             }

             // If both have sent a shot within 24 hours
             if (streak.lastShotUser1 && streak.lastShotUser2) {
                 const timeDiff = Math.abs(streak.lastShotUser1.getTime() - streak.lastShotUser2.getTime());
                 const diffHours = timeDiff / (1000 * 3600);
                 
                 const lastUpdateDiff = streak.lastStreakUpdate ? (now.getTime() - streak.lastStreakUpdate.getTime()) / (1000 * 3600) : 25;

                 if (diffHours <= 24 && lastUpdateDiff > 24) {
                     streak.count += 1;
                     streak.lastStreakUpdate = now;
                     io.emit('streak_updated', { room: data.room, streak: streak.count });
                 }
             }
             await streak.save();
          }
      }

      data.read = false; // default for new messages
      const newMessage = new Message(data);
      await newMessage.save();

      // Return the generated ObjectId to sender
      if (typeof callback === 'function') {
        callback({ status: 'ok', _id: newMessage._id });
        callback = null; // Prevent double call
      }

      socket.to(data.room).emit('receive_message', { ...data, _id: newMessage._id });
      
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
              read: false
          }
      });

      // Push Notification Logic
      // 1. Identify recipients
      // ... same push notification logic ...
      if (data.room.includes('_')) {
        const parts = data.room.split('_');
        const receiverUsername = parts.find(u => u !== data.author);
        
        if (receiverUsername) {
             const receiverUser = await User.findOne({ username: receiverUsername });
             if (receiverUser && receiverUser.pushToken) {
                 await sendPushNotification(receiverUser.pushToken, `New Message from ${data.author}`, data.message || (data.fileType === 'shot' ? 'Sent a shot!' : 'Sent an attachment'), { type: 'message', room: data.room });
             }
        }
      } else {
        const group = await Group.findOne({ name: data.room }).populate('members');
        if (group) {
            for (const member of group.members) {
                if (member.username !== data.author && member.pushToken) {
                     await sendPushNotification(member.pushToken, `#${data.room}: ${data.author}`, data.message || 'Sent an attachment', { type: 'message', room: data.room });
                }
            }
        }
      }

      if (typeof callback === 'function') {
        callback({ status: 'ok', _id: newMessage._id });
      }

    } catch (err) {
      console.error('Error in send_message:', err);
      if (typeof callback === 'function') {
        callback({ status: 'error' });
      }
    }
  });

  socket.on('mark_read', async ({ room, username }) => {
     try {
         await Message.updateMany(
             { room, author: { $ne: username }, read: false },
             { $set: { read: true } }
         );
         
         socket.to(room).emit('messages_read', { room, byId: username });
         io.emit('global_read_update', { room, reader: username });
     } catch(e) {
         console.error('Error marking messages as read:', e);
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

  socket.on('reject_call', async (data) => {
    // data: { from: 'receiver_username', to: 'caller_username' }
    const targetSocketId = Object.keys(users).find(key => users[key] === data.to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_rejected', data);
    }
    
    // Create Missed Call system message
    try {
        const roomName = [data.from, data.to].sort().join('_');
        const missedCallMsg = new Message({
            room: roomName,
            author: data.from, // Not exactly the author, but 'from' in reject_call stands for the receiver
            message: 'Missed voice call',
            fileType: 'missed_call',
            time: new Date().toISOString(),
            read: false
        });
        await missedCallMsg.save();

        io.emit('recent_message_update', {
          room: roomName,
          recipients: [data.from, data.to],
          message: {
              text: 'Missed voice call',
              createdAt: missedCallMsg.time,
              type: 'missed_call',
              sender: data.to, // To show it clearly as missed from caller
              read: false
          }
        });
        
    } catch(e) {
        console.error('Failed to log missed call:', e);
    }
  });

  socket.on('end_call', async (data) => {
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
