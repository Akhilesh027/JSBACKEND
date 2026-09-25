const express = require("express");
const router = express.Router();
const {
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  getWhatsAppTemplates,
  parsePhoneNumber,
  verifyWhatsAppConnection,
} = require("../shared/services/whatsappService");

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
 * GET /api/whatsapp/templates
 * Fetches all registered templates directly from MyOperator
 */
router.get("/templates", async (req, res) => {
  const result = await getWhatsAppTemplates();
  return res.json(result);
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
 * GET & POST /api/whatsapp/send-template-test
 * Query/Body: { phone: string, name?: string, orderId?: string, product?: string, amount?: string }
 */
const handleTemplateTest = async (req, res) => {
  try {
    const phone = req.body?.phone || req.query?.phone;
    const templateName = req.body?.templateName || req.query?.templateName || "ecommerce_order_confirmation";
    const name = req.body?.name || req.query?.name || "jyothshna";
    const orderId = req.body?.orderId || req.query?.orderId || "JS01-26";
    const product = req.body?.product || req.query?.product || "SOFA";
    const amount = req.body?.amount || req.query?.amount || "1,02,000/-";
    const language = req.body?.language || req.query?.language || "en";

    if (!phone) {
      return res.status(400).json({ success: false, message: "phone is required (via body or ?phone=...)" });
    }

    let params;
    if (Array.isArray(req.body?.params)) {
      params = req.body.params;
    } else if (templateName === "copy_new_interior_enquiry_alert") {
      params = [
        name,
        req.body?.mobile || req.query?.mobile || "7013604573",
        req.body?.city || req.query?.city || "Hyderabad",
        orderId || "12345",
        req.body?.floorPlan || req.query?.floorPlan || "2BHK",
        req.body?.purpose || req.query?.purpose || "Rent",
        req.body?.propertyType || req.query?.propertyType || "Villa",
        req.body?.budget || req.query?.budget || "5-7 lakshs",
        req.body?.requirements || req.query?.requirements || "Kitchen",
        req.body?.floorPlanSize || req.query?.floorPlanSize || "1050Sft",
      ];
    } else {
      params = [name, orderId, product, amount];
    }

    const result = await sendWhatsAppTemplate(phone, templateName, params, language);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: `Failed to send template '${templateName}'`,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      message: `WhatsApp template '${templateName}' dispatched successfully to ${phone}`,
      parameters: params,
      refId: result.refId,
      data: result.data,
    });
  } catch (err) {
    console.error("WhatsApp template test error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

router.post("/send-template-test", handleTemplateTest);
router.get("/send-template-test", handleTemplateTest);

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
