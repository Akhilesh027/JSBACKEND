// utils/mailer.js
const nodemailer = require("nodemailer");
require("dotenv").config();

const host = String(process.env.SMTP_HOST || "").trim();
const port = Number(process.env.SMTP_PORT || 465);
const secure = String(process.env.SMTP_SECURE || "true") === "true";

const user = String(process.env.SMTP_USER || "").trim();
const pass = String(process.env.SMTP_PASS || "").trim();

const from =
  String(process.env.SMTP_FROM || "").trim() ||
  (user ? `JS GALLOR <${user}>` : "");

if (!host) throw new Error("SMTP_HOST missing in .env");
if (!user) throw new Error("SMTP_USER missing in .env");
if (!pass) throw new Error("SMTP_PASS missing in .env");

console.log("📨 SMTP CONFIG:", {
  host,
  port,
  secure,
  user: user ? "(set)" : "(missing)",
  from,
});

const transporter = nodemailer.createTransport({
  host,
  port,
  secure, // true for 465
  auth: { user, pass },
});

// optional verify
transporter.verify((err, success) => {
  if (err) {
    console.error("❌ SMTP verify failed:", err.message);
  } else {
    console.log("✅ SMTP ready");
  }
});

module.exports = transporter;