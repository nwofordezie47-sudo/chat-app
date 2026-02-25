import express from 'express';
import FeedPost from '../models/FeedPost.js';
import User from '../models/User.js';

const router = express.Router();

// Get feed for a user (posts from friends + themselves)
router.get('/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).populate('friends');
        if (!user) return res.status(404).json({ error: 'User not found' });

        const friendIds = user.friends.map(f => f._id);
        const targetUserIds = [...friendIds, user._id];

        const posts = await FeedPost.find({ user: { $in: targetUserIds } })
            .populate('user', 'username profilePic bio')
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(posts);
    } catch (err) {
        console.error('Error fetching feed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get feed for a specific user profile
router.get('/user/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const posts = await FeedPost.find({ user: user._id })
            .populate('user', 'username profilePic bio')
            .sort({ createdAt: -1 });

        res.json(posts);
    } catch (err) {
        console.error('Error fetching user feed:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create a feed post
router.post('/', async (req, res) => {
    try {
        const { username, content, mediaUrl, mediaType } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const newPost = new FeedPost({
            user: user._id,
            content,
            mediaUrl,
            mediaType
        });

        await newPost.save();
        
        const populatedPost = await FeedPost.findById(newPost._id).populate('user', 'username profilePic bio');
        res.status(201).json(populatedPost);
    } catch (err) {
        console.error('Error creating post:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Like/Unlike a post
router.put('/:id/like', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });
        const post = await FeedPost.findById(req.params.id);
        
        if (!user || !post) return res.status(404).json({ error: 'Not found' });

        const hasLiked = post.likes.includes(user._id);
        if (hasLiked) {
            post.likes = post.likes.filter(id => id.toString() !== user._id.toString());
        } else {
            post.likes.push(user._id);
        }

        await post.save();
        res.json(post);
    } catch (err) {
        console.error('Error liking post:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
