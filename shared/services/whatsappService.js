const axios = require("axios");

/**
 * Normalizes any phone number into countryCode (default 91) and localNumber
 * e.g., "+91 9876543210", "919876543210", "9876543210" -> { countryCode: "91", localNumber: "9876543210" }
 */
function parsePhoneNumber(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;

  let localNumber = digits;
  // If 12 digits starting with 91, strip 91
  if (digits.length === 12 && digits.startsWith("91")) {
    localNumber = digits.substring(2);
  }

  return { localNumber, fullFormatted: localNumber };
}

/**
 * Sends a WhatsApp message via MyOperator Chat API
 * @param {string} phone - Recipient phone number
 * @param {string} messageText - Text content of the message
 * @param {object} [options] - Additional options (e.g. preview_url)
 */
async function sendWhatsAppMessage(phone, messageText, options = {}) {
  const parsed = parsePhoneNumber(phone);
  if (!parsed) {
    console.warn("⚠️ [WhatsApp] Invalid phone number provided:", phone);
    return { success: false, error: "Invalid phone number" };
  }

  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  const companyId = process.env.WHATSAPP_COMPANY_ID;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!apiKey || !companyId || !phoneNumberId || !apiUrl) {
    console.error("❌ [WhatsApp] Missing credentials in .env. Required: WHATSAPP_API_URL, WHATSAPP_API_KEY, WHATSAPP_COMPANY_ID, WHATSAPP_PHONE_NUMBER_ID");
    return { success: false, error: "Missing WhatsApp credentials in .env" };
  }

  const myopRefId = `wa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const payload = {
    phone_number_id: phoneNumberId,
    customer_country_code: "91",
    customer_number: parsed.localNumber,
    data: {
      type: "text",
      context: {
        body: messageText,
        preview_url: options.previewUrl ?? true,
      },
    },
    reply_to: null,
    myop_ref_id: myopRefId,
  };

  try {
    console.log(`[WhatsApp] Dispatching to ${parsed.fullFormatted} via ${apiUrl} (Company: ${companyId})...`);
    const response = await axios.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "X-MYOP-COMPANY-ID": companyId,
      },
      timeout: 10000,
    });

    console.log("✅ [WhatsApp] Sent successfully:", response.data);
    return { success: true, data: response.data, refId: myopRefId };
  } catch (err) {
    const errorDetails = err.response?.data || err.message;
    console.error("❌ [WhatsApp] Dispatch error:", errorDetails);
    return { success: false, error: errorDetails };
  }
}

/**
 * Sends a WhatsApp Template message via MyOperator Chat API (Meta Cloud API)
 * @param {string} phone - Recipient phone number
 * @param {string} templateName - The pre-approved template name (e.g., "ecommerce_order_confirmation")
 * @param {string[]} bodyParameters - Array of string values for variables {{1}}, {{2}}, {{3}}, etc.
 * @param {string} [languageCode="en"] - Language code (e.g. "en" or "en_US")
 */
async function sendWhatsAppTemplate(phone, templateName, bodyParameters = [], languageCode = "en") {
  const parsed = parsePhoneNumber(phone);
  if (!parsed) {
    console.warn("⚠️ [WhatsApp] Invalid phone number provided:", phone);
    return { success: false, error: "Invalid phone number" };
  }

  const apiUrl = process.env.WHATSAPP_API_URL || "https://publicapi.myoperator.co/chat/messages";
  const apiKey = process.env.WHATSAPP_API_KEY;
  const companyId = process.env.WHATSAPP_COMPANY_ID;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!apiKey || !companyId || !phoneNumberId) {
    console.error("❌ [WhatsApp] Missing credentials in .env");
    return { success: false, error: "Missing WhatsApp credentials in .env" };
  }

  const myopRefId = `wa_tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Formatted parameters for MyOperator (supports array and var_1..var_n object)
  let bodyPayload = {};
  if (Array.isArray(bodyParameters)) {
    bodyParameters.forEach((val, idx) => {
      bodyPayload[`var_${idx + 1}`] = String(val ?? "");
      bodyPayload[`${idx + 1}`] = String(val ?? "");
    });
  } else if (typeof bodyParameters === "object" && bodyParameters !== null) {
    bodyPayload = bodyParameters;
  }

  const payload = {
    phone_number_id: phoneNumberId,
    customer_country_code: "91",
    customer_number: parsed.localNumber,
    data: {
      type: "template",
      context: {
        template_name: templateName,
        template_language: languageCode || "en",
        body: bodyPayload,
      },
    },
    reply_to: null,
    myop_ref_id: myopRefId,
  };

  try {
    console.log(`[WhatsApp Template] Dispatching '${templateName}' to ${parsed.fullFormatted} with body:`, bodyPayload);
    const response = await axios.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
        "X-MYOP-COMPANY-ID": companyId,
      },
      timeout: 10000,
    });

    console.log("✅ [WhatsApp Template] Sent successfully:", response.data);
    return { success: true, data: response.data, refId: myopRefId };
  } catch (err) {
    const errorDetails = err.response?.data || err.message;
    console.error(`❌ [WhatsApp Template] Dispatch error for template '${templateName}':`, errorDetails);
    return { success: false, error: errorDetails };
  }
}

/**
 * Verifies WhatsApp (MyOperator) credentials & connectivity on server boot
 */
async function verifyWhatsAppConnection() {
  const apiKey = process.env.WHATSAPP_API_KEY;
  const companyId = process.env.WHATSAPP_COMPANY_ID;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiUrl = process.env.WHATSAPP_API_URL || "https://publicapi.myoperator.co/chat/messages";

  if (!apiKey || !companyId || !phoneNumberId) {
    console.warn("⚠️ [WhatsApp] Incomplete credentials in .env");
    return false;
  }

  console.log("📲 WHATSAPP CONFIG:", {
    companyId,
    phoneNumberId,
    apiKey: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : "(missing)",
    apiUrl,
  });

  try {
    const res = await axios.get("https://publicapi.myoperator.co/chat/phonenumbers?limit=10&offset=0", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-MYOP-COMPANY-ID": companyId,
      },
      timeout: 5000,
      validateStatus: () => true,
    });

    console.log(`[WhatsApp Ping /chat/phonenumbers] HTTP ${res.status}:`, res.data);
    if (res.status === 200) {
      console.log("✅ WhatsApp (MyOperator) authenticated successfully!");
      return { success: true, phoneData: res.data };
    } else {
      console.warn("⚠️ WhatsApp Auth response:", res.data);
      return { success: false, error: res.data };
    }
  } catch (err) {
    console.warn("⚠️ WhatsApp Auth check failed:", err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}

/**
 * Fetches all registered & approved WhatsApp templates from MyOperator
 */
async function getWhatsAppTemplates() {
  const apiKey = process.env.WHATSAPP_API_KEY;
  const companyId = process.env.WHATSAPP_COMPANY_ID;

  if (!apiKey || !companyId) {
    return { success: false, error: "Missing API credentials" };
  }

  try {
    const res = await axios.get("https://publicapi.myoperator.co/chat/templates?limit=50&offset=0", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-MYOP-COMPANY-ID": companyId,
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    return {
      success: res.status === 200,
      status: res.status,
      data: res.data,
    };
  } catch (err) {
    return {
      success: false,
      error: err.response?.data || err.message,
    };
  }
}

module.exports = {
  parsePhoneNumber,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  getWhatsAppTemplates,
  verifyWhatsAppConnection,
};


