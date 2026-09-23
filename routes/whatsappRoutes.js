const express = require("express");
const router = express.Router();
const { sendWhatsAppMessage, parsePhoneNumber, verifyWhatsAppConnection } = require("../shared/services/whatsappService");

/**
 * GET /api/whatsapp/status
 * Check if WhatsApp (MyOperator) is connected and configured
 */
router.get("/status", async (req, res) => {
  const result = await verifyWhatsAppConnection();
  return res.json({
    success: !!result.success,
    service: "WhatsApp (MyOperator)",
    connected: !!result.success,
    data: result.phoneData || result.error,
    companyId: process.env.WHATSAPP_COMPANY_ID ? "Configured" : "Missing",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ? "Configured" : "Missing",
    apiKey: process.env.WHATSAPP_API_KEY ? "Configured" : "Missing",
  });
});

/**
 * POST /api/whatsapp/send-test
 * Body: { phone: string }
 */
router.post("/send-test", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: "phone is required" });
    }

    const testMsg = `✨ *JS GALLOR - WhatsApp Service Active*\n\nThis is a verification message from your JS GALLOR backend system.\n\nTimestamp: ${new Date().toLocaleString("en-IN")}\nStatus: Active ✅`;

    const result = await sendWhatsAppMessage(phone, testMsg);
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to send WhatsApp test message",
        error: result.error,
      });
    }

    return res.json({
      success: true,
      message: `WhatsApp test message dispatched successfully to ${phone}`,
      refId: result.refId,
    });
  } catch (err) {
    console.error("WhatsApp test error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/whatsapp/send
 * Body: { phone: string, message: string }
 */
router.post("/send", async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, message: "phone and message are required" });
    }

    const result = await sendWhatsAppMessage(phone, message);
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to send WhatsApp message",
        error: result.error,
      });
    }

    return res.json({
      success: true,
      message: `Message sent successfully to ${phone}`,
      refId: result.refId,
    });
  } catch (err) {
    console.error("WhatsApp send error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
