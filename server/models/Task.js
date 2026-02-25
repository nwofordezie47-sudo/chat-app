import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    dueDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending'
    },
    type: {
        type: String,
        enum: ['task', 'goal'],
        default: 'task'
    }
}, { timestamps: true });

export default mongoose.model('Task', taskSchema);
