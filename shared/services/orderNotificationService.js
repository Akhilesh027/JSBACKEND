const transporter = require("../../platforms/Admin/utils/mailer");
const { generateOrderInvoicePdfBuffer, findOrderAndDetails } = require("./pdfService");
const { sendWhatsAppMessage, sendWhatsAppTemplate } = require("./whatsappService");

const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

/**
 * Asynchronously sends order confirmation via Email (with PDF attached) and WhatsApp (with invoice link).
 * Runs safely in the background without holding or failing the checkout response.
 */
function sendOrderNotifications(orderId, website) {
  setImmediate(async () => {
    try {
      console.log(`🚀 [OrderNotifications] Starting notification job for order: ${orderId} (${website})...`);
      await processOrderNotifications(orderId, website);
    } catch (err) {
      console.error(`❌ [OrderNotifications] Background error for order ${orderId}:`, err.message);
    }
  });
}

async function processOrderNotifications(orderId, website) {
  // 1. Load Order details immediately
  let order = null;
  try {
    const res = await findOrderAndDetails({ website, orderId });
    order = res.order;
  } catch (err) {
    console.error(`❌ [OrderNotifications] Failed to load order ${orderId}:`, err.message);
  }

  if (!order) {
    console.warn(`⚠️ [OrderNotifications] Order not found: ${orderId}`);
    return;
  }

  const invoiceNo = order.orderNumber || `INV-${String(order._id).slice(-8).toUpperCase()}`;
  const fileName = `invoice-${order.orderNumber || order._id}.pdf`;

  const customerName =
    order.userDetails?.name ||
    order.addressSnapshot?.fullName ||
    order.addressDetails?.fullName ||
    order.shippingAddress?.fullName ||
    order.shippingAddress?.firstName ||
    "Customer";

  const customerEmail =
    order.userDetails?.email ||
    order.addressDetails?.email ||
    order.shippingAddress?.email ||
    "";

  const customerPhone =
    order.userDetails?.phone ||
    order.addressSnapshot?.phone ||
    order.addressDetails?.phone ||
    order.shippingAddress?.phone ||
    "";

  const publicApiBase = process.env.PUBLIC_API_URL || "https://api.jsgallor.com";
  const invoiceDownloadUrl = `${publicApiBase}/api/public/orders/${website}/${order._id}/invoice.pdf`;

  const items = Array.isArray(order.items) ? order.items : [];
  const productSummary = items.length > 0
    ? items.map((it) => it.productSnapshot?.name || it.name || it.title || "Item").join(", ")
    : "Furniture";

  const rawTotal = order.pricing?.total || order.totals?.total || 0;
  const formattedAmount = `${Number(rawTotal).toLocaleString("en-IN")}/-`;
  const totalAmount = formatINR(rawTotal);

  // -------------------------------------------------------------
  // 2. Dispatch Customer WhatsApp TEMPLATE ONLY
  // -------------------------------------------------------------
  if (customerPhone) {
    try {
      console.log(`📱 [OrderNotifications] Sending WhatsApp template to: ${customerPhone}...`);

      // Template: ecommerce_order_confirmation
      // Variables: 1: Name, 2: Order Number, 3: Product Summary, 4: Order Amount
      const templateParams = [
        customerName || "Customer",
        invoiceNo || "JS01-26",
        productSummary || "Furniture",
        formattedAmount || "0/-",
      ];

      const waResult = await sendWhatsAppTemplate(customerPhone, "ecommerce_order_confirmation", templateParams);
      if (waResult.success) {
        console.log(`✅ [OrderNotifications] WhatsApp template message delivered to ${customerPhone}`);
      } else {
        console.error(`❌ [OrderNotifications] WhatsApp template dispatch failed:`, waResult.error);
      }
    } catch (waErr) {
      console.error(`❌ [OrderNotifications] WhatsApp dispatch exception for ${customerPhone}:`, waErr.message);
    }
  } else {
    console.warn(`⚠️ [OrderNotifications] No phone number found for order ${orderId}, skipping WhatsApp.`);
  }

  // -------------------------------------------------------------
  // 3. Dispatch Admin Alert
  // -------------------------------------------------------------
  const adminPhone = process.env.ADMIN_NOTIFICATION_PHONE;
  if (adminPhone) {
    try {
      const adminOrderMsg = `💰 *NEW ORDER RECEIVED - JS GALLOR*\n\n🛒 *Order:* #${invoiceNo} (${website.toUpperCase()})\n👤 *Customer:* ${customerName}\n📞 *Phone:* ${customerPhone}\n📧 *Email:* ${customerEmail || "N/A"}\n💵 *Total Amount:* ${totalAmount}\n💳 *Payment:* ${order.payment?.method || "Online"} (${order.payment?.status || "Pending"})\n📄 *Invoice:* ${invoiceDownloadUrl}\n\n👉 *Open Admin Portal:* https://admin.jsgallor.com`;

      await sendWhatsAppMessage(adminPhone, adminOrderMsg);
      console.log(`✅ [OrderNotifications] Admin order alert sent to ${adminPhone}`);
    } catch (err) {
      console.error(`❌ [OrderNotifications] Admin WhatsApp alert failed:`, err.message);
    }
  }

  // -------------------------------------------------------------
  // 4. Generate PDF Invoice & Send Email (Asynchronous)
  // -------------------------------------------------------------
  if (customerEmail && transporter) {
    try {
      let pdfBuffer = null;
      try {
        const res = await generateOrderInvoicePdfBuffer({ website, orderId });
        pdfBuffer = res?.buffer;
      } catch (pdfErr) {
        console.warn(`⚠️ [OrderNotifications] PDF buffer generation error for email (continuing without attachment):`, pdfErr.message);
      }

      console.log(`✉️ [OrderNotifications] Sending invoice email to: ${customerEmail}...`);
      const attachments = [];
      if (pdfBuffer && pdfBuffer.length) {
        attachments.push({
          filename: fileName,
          content: pdfBuffer,
          contentType: "application/pdf",
        });
      }

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: customerEmail,
        subject: `Order Confirmed #${invoiceNo} - JS GALLOR`,
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #222; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #1a1a1a; padding: 24px; text-align: center; color: #fff;">
              <h1 style="margin: 0; font-size: 22px; letter-spacing: 1px; color: #f4d06f;">JS GALLOR</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #ccc;">Thank you for your order!</p>
            </div>
            
            <div style="padding: 24px;">
              <p style="font-size: 15px; margin-top: 0;">Dear <b>${customerName}</b>,</p>
              <p>We are delighted to confirm that your order <b>#${invoiceNo}</b> has been received and is being processed.</p>
              
              <div style="background-color: #f9f9f9; border-radius: 6px; padding: 16px; margin: 20px 0;">
                <h3 style="margin: 0 0 12px 0; font-size: 14px; text-transform: uppercase; color: #555;">Order Summary</h3>
                <div style="font-size: 13px; line-height: 1.6;">
                  ${items
            .map(
              (it) => `
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 8px 0;">
                      <span><b>${it.productSnapshot?.name || it.name || "Item"}</b> x ${it.quantity || 1}</span>
                      <span>${formatINR((it.finalPrice ?? it.price ?? 0) * (it.quantity || 1))}</span>
                    </div>
                  `
            )
            .join("")}
                  <div style="display: flex; justify-content: space-between; padding-top: 12px; font-weight: bold; font-size: 15px;">
                    <span>Total Amount Paid / Payable:</span>
                    <span style="color: #8B5A2B;">${totalAmount}</span>
                  </div>
                </div>
              </div>

              <p style="font-size: 13px; color: #555;">
                📎 <b>Invoice Attached:</b> Your tax invoice has been attached as a PDF to this email for your records.
              </p>
              <p style="font-size: 13px; color: #555;">
                You can also view or download your invoice anytime using this secure link:<br/>
                <a href="${invoiceDownloadUrl}" style="color: #8B5A2B; word-break: break-all;">${invoiceDownloadUrl}</a>
              </p>

              <div style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #777;">
                <p style="margin: 0;">Need assistance? Contact our support concierge at <a href="mailto:directorjsgallor@gmail.com" style="color: #444;">directorjsgallor@gmail.com</a>.</p>
              </div>
            </div>
          </div>
        `,
        attachments,
      });

      console.log(`✅ [OrderNotifications] Email delivered successfully to ${customerEmail}`);
    } catch (mailErr) {
      console.error(`❌ [OrderNotifications] Failed sending email to ${customerEmail}:`, mailErr.message);
    }
  }
}

/**
 * Sends order status change notification (WhatsApp + Email) when Admin updates order status
 * @param {string} orderId
 * @param {string} website
 * @param {string} newStatus
 * @param {string} [note]
 */
function sendOrderStatusNotification(orderId, website, newStatus, note = "") {
  setImmediate(async () => {
    try {
      const { order } = await findOrderAndDetails({ website, orderId });
      if (!order) return;

      const customerPhone =
        order.userDetails?.phone ||
        order.addressSnapshot?.phone ||
        order.addressDetails?.phone ||
        order.shippingAddress?.phone ||
        "";

      const customerName =
        order.userDetails?.name ||
        order.addressSnapshot?.fullName ||
        order.addressDetails?.fullName ||
        order.shippingAddress?.fullName ||
        "Valued Customer";

      const invoiceNo = order.orderNumber || `INV-${String(order._id).slice(-8).toUpperCase()}`;
      const statusUpper = String(newStatus || "").toUpperCase();

      let statusMsg = "";
      switch (newStatus) {
        case "approved":
          statusMsg = `🎉 *Order Approved! - JS GALLOR*\n\nHello *${customerName}*,\nYour order *#${invoiceNo}* has been approved and moved into preparation!\n\nWe will notify you as soon as it is dispatched.`;
          break;
        case "shipped":
        case "intransit":
          statusMsg = `🚚 *Order Shipped! - JS GALLOR*\n\nHello *${customerName}*,\nGreat news! Your order *#${invoiceNo}* has been dispatched and is on its way to your delivery address!\n${note ? `\nTracking Note: ${note}` : ""}\n\nOur delivery team will coordinate with you prior to arrival.`;
          break;
        case "delivered":
          statusMsg = `🏡 *Order Delivered! - JS GALLOR*\n\nHello *${customerName}*,\nYour order *#${invoiceNo}* has been successfully delivered!\n\nWe hope you love your new furniture pieces. Thank you for choosing JS GALLOR.`;
          break;
        case "rejected":
        case "cancelled":
          statusMsg = `⚠️ *Order Update - JS GALLOR*\n\nHello *${customerName}*,\nYour order *#${invoiceNo}* status has been updated to: *${statusUpper}*.\n${note ? `Reason: ${note}\n` : ""}\nIf you have any questions or require assistance, please contact us at directorjsgallor@gmail.com.`;
          break;
        default:
          statusMsg = `📦 *Order Update - JS GALLOR*\n\nHello *${customerName}*,\nYour order *#${invoiceNo}* status is now: *${statusUpper}*.\n${note ? `Note: ${note}\n` : ""}\n_Thank you for choosing JS GALLOR._`;
      }

      const items = Array.isArray(order.items) ? order.items : [];
      const productSummary = items.length > 0
        ? items.map((it) => it.productSnapshot?.name || it.name || it.title || "Item").join(", ")
        : "Furniture";
      const rawTotal = order.pricing?.total || order.totals?.total || 0;
      const formattedAmount = `${Number(rawTotal).toLocaleString("en-IN")}/-`;

      // Approved Template: ecommerce_order_confirmation
      // Variables: 1: Name, 2: Order ID + Status, 3: Product, 4: Amount
      const templateParams = [
        customerName || "Customer",
        `${invoiceNo} [Status: ${statusUpper}]`,
        productSummary || "Furniture",
        formattedAmount || "0/-",
      ];

      if (customerPhone) {
        const waResult = await sendWhatsAppTemplate(customerPhone, "ecommerce_order_confirmation", templateParams);
        if (waResult.success) {
          console.log(`✅ [OrderStatus] Status update (${newStatus}) sent via WhatsApp template to ${customerPhone}`);
        } else {
          console.error(`❌ [OrderStatus] WhatsApp template dispatch failed for ${customerPhone}:`, waResult.error);
        }
      }
    } catch (err) {
      console.error(`❌ [OrderStatus] Error sending status notification for ${orderId}:`, err.message);
    }
  });
}

module.exports = {
  sendOrderNotifications,
  processOrderNotifications,
  sendOrderStatusNotification,
};
