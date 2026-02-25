import mongoose from 'mongoose';

const storySchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    mediaUrl: {
        type: String,
        required: true
    },
    mediaType: {
        type: String,
        enum: ['image', 'video'],
        required: true
    },
    caption: {
        type: String,
        default: ''
    },
    viewers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, { timestamps: true });

// Create a TTL index on createdAt so stories expire after 24 hours (86400 seconds)
storySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export default mongoose.model('Story', storySchema);
