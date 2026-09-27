const nodemailer = require('nodemailer');
require('dotenv').config();

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 465);
const secure = process.env.SMTP_SECURE === 'true' || port === 465;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

console.log('Testing SMTP connection with:');
console.log('Host:', host);
console.log('Port:', port);
console.log('User:', user);
console.log('Pass length:', pass ? pass.length : 0);

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  tls: { rejectUnauthorized: false }
});

transporter.verify((err, success) => {
  if (err) {
    console.error('❌ SMTP verify failed:', err.message);
    process.exit(1);
  } else {
    console.log('🎉 ✅ SMTP SUCCESS: Connected and authenticated successfully!');
    process.exit(0);
  }
});
