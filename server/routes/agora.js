import pkg from 'agora-token';
const { RtcTokenBuilder, RtcRole } = pkg;
import express from 'express';

const router = express.Router();

router.post('/', (req, res) => {
    // Force the client payload to provide what we need
    const { channelName, uid } = req.body;
    
    // In a real app we would load Cert from process.env, 
    // but the user only supplied App ID for now. We will use AppID token mode.
    const appId = process.env.AGORA_APP_ID || '11579438c5924e1896ff965fbea3460a'; 
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || ''; // Required for production security!

    if (!channelName) {
        return res.status(400).json({ error: 'channelName is required' });
    }

    if (!appCertificate) {
         // If there is no certificate provided, we just return the App ID as the token 
         // since they are probably in Testing Mode on the Agora console (which doesn't enforce tokens).
        return res.json({ token: appId }); 
    }

    // Set token expiry to 1 hour
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Use integer UID or 0 if string
    let numericUid = 0; 
    if (uid && !isNaN(uid)) {
        numericUid = parseInt(uid, 10);
    }

    // Generate Token
    try {
        const token = RtcTokenBuilder.buildTokenWithUid(
            appId,
            appCertificate,
            channelName,
            numericUid,
            RtcRole.PUBLISHER,
            privilegeExpiredTs
        );
        res.json({ token });
    } catch (err) {
        console.error("Agora Token Generation Error:", err);
        res.status(500).json({ error: "Failed to generate Agora token" });
    }
});

export default router;
