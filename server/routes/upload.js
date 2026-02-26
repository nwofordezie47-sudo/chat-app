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
    const { base64, mimeType } = req.body;
    
    if (!req.file && !base64) {
      return res.status(400).json({ error: 'No file or base64 data uploaded' });
    }

    const result = await new Promise((resolve, reject) => {
        if (base64) {
             // Handle native React Native Base64 payload
             const dataUri = `data:${mimeType || 'auto'};base64,${base64}`;
             cloudinary.uploader.upload(dataUri, { resource_type: 'auto', folder: 'messaging_app_media' }, (error, result) => {
                 if (result) resolve(result); 
                 else reject(error);
             });
        } else {
             // Handle regular web FormData payload
             const stream = cloudinary.uploader.upload_stream(
               { resource_type: 'auto', folder: 'messaging_app_media' },
               (error, result) => { 
                   if (result) resolve(result); 
                   else reject(error); 
               }
             );
             stream.end(req.file.buffer);
        }
    });
    
    // Send back the secure URL
    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ error: 'Failed to upload file to Cloudinary' });
  }
});

export default router;
