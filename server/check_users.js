import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

dotenv.config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/messaging-app';
console.log('Connecting to:', uri);

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');
    console.log('Fetching users...');
    
    const users = await User.find({});
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
      console.log(`- Username: '${u.username}', Email: '${u.email}'`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
