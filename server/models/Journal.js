import mongoose from 'mongoose';

const journalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'voice', 'photo'],
        required: true
    },
    content: {
        type: String, 
        required: true 
    }
}, { timestamps: true });

export default mongoose.model('Journal', journalSchema);
