const axios = require("axios");

/**
 * Sends an OTP SMS via Capcom6 Android SMS Gateway (https://api.sms-gate.app) if configured.
 * Otherwise, falls back to logging the message to the console.
 * 
 * @param {string} phone - Target mobile number
 * @param {string} otp - 4-digit code
 * @param {string} type - "Login" or "Registration"
 */
exports.sendOtpSms = async (phone, otp, type = "Login") => {
  const gatewayUrl = process.env.SMSGATE_URL || "https://api.sms-gate.app/3rdparty/v1/messages";
  const username = process.env.SMSGATE_USERNAME;
  const password = process.env.SMSGATE_PASSWORD;
  const deviceId = process.env.SMSGATE_DEVICE_ID;

  const message = `Your MedTrack OTP for ${type} is ${otp}. Valid for 10 minutes.`;

  console.log(`\n========================================`);
  console.log(`📱 LOGGED SMS TO ${phone}: ${message}`);
  console.log(`========================================\n`);

  if (!username || !password || !deviceId) {
    console.log("ℹ️ SMS Gateway credentials not configured in .env. Real SMS skipped, using terminal log.");
    return;
  }

  try {
    // Format phone number to E.164 (ensure it starts with + country code, e.g. +91)
    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith("+")) {
      if (formattedPhone.length === 10) {
        formattedPhone = "+91" + formattedPhone; // default to India country code
      } else {
        formattedPhone = "+" + formattedPhone;
      }
    }

    await axios.post(gatewayUrl, {
      textMessage: {
        text: message
      },
      phoneNumbers: [formattedPhone],
      deviceId: deviceId
    }, {
      auth: {
        username: username,
        password: password
      },
      headers: {
        "Content-Type": "application/json"
      },
      timeout: 8000 // 8 seconds timeout
    });
    console.log(`✅ Real SMS OTP sent successfully to ${formattedPhone} via Android SMS Gateway!`);
  } catch (err) {
    console.error("❌ Failed to send SMS via SMS Gateway:", err.response?.data || err.message);
  }
};
