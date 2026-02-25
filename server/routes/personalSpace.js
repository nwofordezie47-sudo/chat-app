import express from 'express';
import Journal from '../models/Journal.js';
import Task from '../models/Task.js';
import User from '../models/User.js';

const router = express.Router();

// Get all journals for a user
router.get('/journals/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const journals = await Journal.find({ user: user._id }).sort({ createdAt: -1 });
        res.json(journals);
    } catch (err) {
        console.error('Error fetching journals:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a journal entry
router.post('/journals', async (req, res) => {
    try {
        const { username, type, content } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const newJournal = new Journal({
            user: user._id,
            type,
            content
        });

        await newJournal.save();
        res.status(201).json(newJournal);
    } catch (err) {
        console.error('Error creating journal:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a journal entry
router.delete('/journals/:id', async (req, res) => {
    try {
        await Journal.findByIdAndDelete(req.params.id);
        res.json({ message: 'Journal entry deleted' });
    } catch (err) {
        console.error('Error deleting journal:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all tasks for a user
router.get('/tasks/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const tasks = await Task.find({ user: user._id }).sort({ dueDate: 1 });
        res.json(tasks);
    } catch (err) {
        console.error('Error fetching tasks:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a task
router.post('/tasks', async (req, res) => {
    try {
        const { username, title, description, dueDate, type } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const newTask = new Task({
            user: user._id,
            title,
            description,
            dueDate,
            type
        });

        await newTask.save();
        res.status(201).json(newTask);
    } catch (err) {
        console.error('Error creating task:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update task status
router.put('/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(task);
    } catch (err) {
        console.error('Error updating task:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete a task
router.delete('/tasks/:id', async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: 'Task deleted' });
    } catch (err) {
        console.error('Error deleting task:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
