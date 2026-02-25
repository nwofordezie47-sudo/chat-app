import express from 'express';
import Story from '../models/Story.js';
import User from '../models/User.js';

const router = express.Router();

// Get active stories for a user (their own + friends)
router.get('/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).populate('friends');
        if (!user) return res.status(404).json({ error: 'User not found' });

        const friendIds = user.friends.map(f => f._id);
        const targetUserIds = [...friendIds, user._id];

        // Ensure we're fetching stories created within the last 24h explicitly,
        // though the TTL index should handle permanent deletion.
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const stories = await Story.find({
            user: { $in: targetUserIds },
            createdAt: { $gte: twentyFourHoursAgo }
        })
        .populate('user', 'username profilePic')
        .sort({ createdAt: 1 }); // Oldest to newest for playback order

        // Group stories by user for frontend processing
        const groupedStories = stories.reduce((acc, story) => {
            const username = story.user.username;
            if (!acc[username]) {
                acc[username] = {
                    user: story.user,
                    items: []
                };
            }
            acc[username].items.push(story);
            return acc;
        }, {});

        res.json(Object.values(groupedStories));
    } catch (err) {
        console.error('Error fetching stories:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a new story
router.post('/', async (req, res) => {
    try {
        const { username, mediaUrl, mediaType, caption } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const newStory = new Story({
            user: user._id,
            mediaUrl,
            mediaType,
            caption
        });

        await newStory.save();
        
        const populatedStory = await Story.findById(newStory._id).populate('user', 'username profilePic');
        res.status(201).json(populatedStory);
    } catch (err) {
        console.error('Error creating story:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Mark story as viewed
router.put('/:id/view', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });
        const story = await Story.findById(req.params.id);
        
        if (!user || !story) return res.status(404).json({ error: 'Not found' });

        if (!story.viewers.includes(user._id)) {
            story.viewers.push(user._id);
            await story.save();
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error viewing story:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
