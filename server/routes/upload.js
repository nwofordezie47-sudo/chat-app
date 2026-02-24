import { v2 as cloudinary } from 'cloudinary';
import express from 'express';
import multer from 'multer';

const router = express.Router();

// Parse multipart/form-data into memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Configure Cloudinary using env variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Wrap Cloudinary's stream uploader in a promise to await it
    const uploadStream = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'auto', // Automatically detects audio vs image
            folder: 'messaging_app_media'
          },
          (error, result) => {
            if (result) {
              resolve(result);
            } else {
              reject(error);
            }
          }
        );
        // Write the Buffer from multer into the stream
        stream.end(req.file.buffer);
      });
    };

    const result = await uploadStream();
    
    // Send back the secure URL
    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ error: 'Failed to upload file to Cloudinary' });
  }
});

export default router;
