import nodemailer from 'nodemailer';

// Configure transport (You'll need to set these env vars)
const transporter = nodemailer.createTransport({
    service: 'gmail', // or another provider
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

export const sendWelcomeEmail = async (userEmail, username) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: userEmail,
            subject: 'Welcome to Soroly!',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #ffe8ee; padding: 20px; border-radius: 10px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #d37e91; text-align: center;">Welcome, ${username}! 🎉</h2>
                    <p style="color: #333; font-size: 16px;">We are thrilled to have you here.</p>
                    <p style="color: #333; font-size: 16px;">Get started by adding some friends, sharing your thoughts, and creating smart tasks!</p>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="#" style="background-color: #d37e91; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Go to Dashboard</a>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Welcome email sent to ${userEmail}`);
    } catch (error) {
        console.error('Error sending welcome email:', error);
    }
};

export const sendLoginAlertEmail = async (userEmail, username) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: userEmail,
            subject: 'New Login Alert - Soroly',
            html: `
                <div style="font-family: Arial, sans-serif; background-color: #fff; padding: 20px; border-radius: 10px; border: 1px solid #ddd; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #e74c3c; text-align: center;">Security Alert</h2>
                    <p style="color: #333; font-size: 16px;">Hi ${username},</p>
                    <p style="color: #333; font-size: 16px;">We detected a new login to your account.</p>
                    <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
                        <p style="margin: 0; color: #555;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    <p style="color: #333; font-size: 16px;">Was this you? If not, please <a href="#" style="color: #d37e91;">change your password immediately</a>.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Login alert email sent to ${userEmail}`);
    } catch (error) {
        console.error('Error sending login alert email:', error);
    }
};
