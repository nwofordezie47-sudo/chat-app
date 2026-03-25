import mongoose from 'mongoose';

const streakSchema = new mongoose.Schema({
  room: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  lastShotUser1: { type: Date },
  lastShotUser2: { type: Date },
  lastStreakUpdate: { type: Date }
});

const Streak = mongoose.model('Streak', streakSchema);

export default Streak;
