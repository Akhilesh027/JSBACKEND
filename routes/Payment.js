const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");

const router = express.Router();

function getRazorpayInstance() {
  const key_id = (process.env.RAZORPAY_KEY_ID || "").trim();
  const key_secret = (process.env.RAZORPAY_KEY_SECRET || "").trim();

  if (!key_id || !key_secret) {
    throw new Error("Razorpay credentials missing on server. Check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env");
  }

  return new Razorpay({ key_id, key_secret });
}

// 1) Create Razorpay order (called BEFORE checkout opens)
router.post("/create-order", async (req, res) => {
  try {
    const { amount, currency = "INR", receipt, notes } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const key_id = (process.env.RAZORPAY_KEY_ID || "").trim();
    const rzp = getRazorpayInstance();

    // Razorpay expects amount in paise (e.g., ₹100 = 10000 paise)
    const order = await rzp.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency: currency || "INR",
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {},
    });

    return res.json({
      success: true,
      order,
      keyId: key_id, // safe to send Key ID to frontend
    });
  } catch (err) {
    console.error("❌ Razorpay Create Order Error:", {
      message: err.message,
      error: err.error,
      statusCode: err.statusCode,
    });

    const errorMsg =
      err?.error?.description ||
      err?.error?.message ||
      err?.message ||
      "Failed to create Razorpay order";

    return res.status(err.statusCode || 500).json({
      success: false,
      message: errorMsg,
      details: err?.error || null,
    });
  }
});

// 2) Verify payment (called AFTER successful payment)
router.post("/verify", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing fields for payment verification" });
    }

    const secret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
    if (!secret) {
      return res.status(500).json({ success: false, message: "RAZORPAY_KEY_SECRET missing on server" });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    const isValid = expectedSignature === razorpay_signature;

    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    return res.json({ success: true, message: "Payment verified successfully" });
  } catch (err) {
    console.error("❌ Razorpay Verify Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;