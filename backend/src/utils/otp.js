import axios from 'axios';
import crypto from 'crypto';
import logger from './logger.js';

// Generate a 6-digit numeric OTP
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP based on provider
export async function sendOTP(phone, otp) {
  const provider = process.env.OTP_PROVIDER || 'console';

  if (provider === 'console') {
    logger.info(`[DEV OTP] Phone: ${phone} | OTP: ${otp}`);
    return { success: true };
  }

  if (provider === 'fast2sms') {
    return sendViaFast2SMS(phone, otp);
  }

  if (provider === 'twilio') {
    return sendViaTwilio(phone, otp);
  }

  throw new Error(`Unknown OTP provider: ${provider}`);
}

async function sendViaFast2SMS(phone, otp) {
  try {
    const res = await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        authorization: process.env.FAST2SMS_API_KEY,
        variables_values: otp,
        route: 'otp',
        numbers: phone,
      },
      timeout: 8000,
    });
    if (res.data.return !== true) {
      throw new Error(res.data.message || 'Fast2SMS failed');
    }
    return { success: true };
  } catch (err) {
    logger.error('Fast2SMS error', { error: err.message });
    throw new Error('Failed to send OTP. Please try again.');
  }
}

async function sendViaTwilio(phone, otp) {
  // Lazy import to avoid crash if twilio not installed
  const { default: twilio } = await import('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  try {
    await client.messages.create({
      body: `Your Sweet Crumbs OTP is: ${otp}. Valid for 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   `+91${phone}`,
    });
    return { success: true };
  } catch (err) {
    logger.error('Twilio error', { error: err.message });
    throw new Error('Failed to send OTP. Please try again.');
  }
}
