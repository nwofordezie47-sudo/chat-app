import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  room: { type: String, required: true },
  author: { type: String, required: true },
  message: { type: String },
  file: { type: String },
  fileName: { type: String },
  fileType: { type: String },
  time: { type: String, required: true },
  read: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
