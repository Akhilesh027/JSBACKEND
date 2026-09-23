const puppeteer = require("puppeteer");
const path = require("path");

const AffordableOrder = require("../../platforms/affordable-website/models/AffordableOrder");
const MidrangeOrder = require("../../platforms/midrange-website/models/MidrangeOrder");
const LuxuryOrder = require("../../platforms/luxury-website/models/luxury_orders");

const AffordableCustomer = require("../../platforms/affordable-website/models/affordable_customers");
const MidrangeCustomer = require("../../platforms/midrange-website/models/midrange_customers");
const LuxuryCustomer = require("../../platforms/luxury-website/models/luxury_customers");

const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n || 0));

const safe = (v) => (v == null ? "" : String(v));

function normalizeWebsite(w) {
  const s = String(w || "").toLowerCase().trim();
  if (s.includes("afford")) return "affordable";
  if (s.includes("mid")) return "midrange";
  return "luxury";
}

function getOrderModel(website) {
  const w = normalizeWebsite(website);
  if (w === "affordable") return AffordableOrder;
  if (w === "midrange") return MidrangeOrder;
  return LuxuryOrder;
}

async function findOrderAndDetails({ website, orderId }) {
  const OrderModel = getOrderModel(website);
  const order = await OrderModel.findById(orderId).lean();
  if (!order) return { order: null };

  let userDetails = null;
  const ownerId = order.userId || order.customerId || order.customer;
  const w = normalizeWebsite(website);

  try {
    if (w === "affordable" && ownerId) {
      const u = await AffordableCustomer.findById(ownerId)
        .select("name firstName lastName email phone")
        .lean();
      if (u) {
        userDetails = {
          _id: u._id,
          name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
          email: u.email,
          phone: u.phone,
        };
      }
    } else if (w === "midrange" && ownerId) {
      const u = await MidrangeCustomer.findById(ownerId)
        .select("name firstName lastName email phone")
        .lean();
      if (u) {
        userDetails = {
          _id: u._id,
          name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
          email: u.email,
          phone: u.phone,
        };
      }
    } else if (w === "luxury" && ownerId) {
      const u = await LuxuryCustomer.findById(ownerId)
        .select("firstName lastName email phone")
        .lean();
      if (u) {
        userDetails = {
          _id: u._id,
          name: `${u.firstName || ""} ${u.lastName || ""}`.trim(),
          email: u.email,
          phone: u.phone,
        };
      }
    }
  } catch (err) {
    console.warn("Could not populate customer details for invoice:", err.message);
  }

  const addressLine =
    order.addressSnapshot ||
    order.shippingAddress ||
    order.addressDetails ||
    order.deliveryAddress ||
    null;

  const payment = order.payment || {};
  const meta = payment.meta || {};
  const normalizedPayment = {
    method: safe(payment.method).toUpperCase() || "—",
    status: safe(payment.status).toUpperCase() || "—",
    transactionId: safe(payment.transactionId),
    meta: {
      upiId: payment.upiId || meta.upiId || "",
      bank: meta.bank || "",
      cardLast4: payment.cardLast4 || meta.cardLast4 || meta.last4 || "",
      last4: meta.last4 || "",
    },
    razorpayOrderId: safe(payment.razorpayOrderId || order.razorpayOrderId),
    razorpayPaymentId: safe(payment.razorpayPaymentId || order.razorpayPaymentId),
  };

  const pricing = order.pricing || order.totals || {};
  const subtotal =
    pricing.subtotal ??
    (order.items || []).reduce((s, it) => {
      const qty = Number(it.quantity || 0);
      const price = Number(it.finalPrice ?? it.price ?? it.productSnapshot?.price ?? 0);
      return s + price * qty;
    }, 0);

  const discount = Number(pricing.discount || 0);
  const shipping = Number(pricing.shipping ?? pricing.shippingCost ?? pricing.shippingCharge ?? 0);
  const tax = Number(pricing.tax ?? 0);
  const total = Number(pricing.total ?? Math.max(0, subtotal - discount) + shipping + tax);

  return {
    order: {
      ...order,
      userDetails,
      payment: normalizedPayment,
      pricing: {
        ...order.pricing,
        subtotal,
        discount,
        shipping,
        tax,
        total,
        currency: pricing.currency || "INR",
        coupon: order.pricing?.coupon || order.totals?.coupon || order.coupon || null,
      },
      _invoiceAddress: addressLine,
      website: order.website || normalizeWebsite(website),
    },
  };
}

function buildInvoiceHTML({ order, business }) {
  const b = business || {
    name: "JAGHSORA LUXORE PRIVATE LIMITED (JS GALLOR)",
    address:
      "WorkFlo Bizness Square, 4th Floor, Jubilee Enclave, Madhapur, Telangana – 500081",
    email: "directorjsgallor@gmail.com",
    phone: "+91-XXXXXXXXXX",
    gst: "36AAHCJ1470F1ZP",
  };

  const items = Array.isArray(order.items) ? order.items : [];
  const invoiceNo = order.orderNumber || `INV-${String(order._id).slice(-8).toUpperCase()}`;
  const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN") : "—";

  const customerName =
    order.userDetails?.name ||
    order.addressSnapshot?.fullName ||
    order.addressDetails?.fullName ||
    order.shippingAddress?.fullName ||
    order.shippingAddress?.firstName ||
    "Valued Customer";

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

  const addr = order._invoiceAddress || {};
  const addressText = (() => {
    if (addr.line1 || addr.city) {
      return [
        addr.line1,
        addr.line2,
        addr.landmark ? `Landmark: ${addr.landmark}` : "",
        `${addr.city || ""}${addr.city ? "," : ""} ${addr.state || ""}`.trim(),
        addr.pincode ? `PIN: ${addr.pincode}` : "",
      ]
        .filter(Boolean)
        .join(", ");
    }
    return [
      addr.addressLine1 || "",
      addr.addressLine2 || "",
      addr.landmark ? `Landmark: ${addr.landmark}` : "",
      `${addr.city || ""}${addr.city ? "," : ""} ${addr.state || ""}`.trim(),
      addr.pincode ? `PIN: ${addr.pincode}` : "",
      addr.country ? `Country: ${addr.country}` : "",
    ]
      .filter(Boolean)
      .join(", ");
  })();

  const pricing = order.pricing || {};
  const pay = order.payment || {};
  const couponCode =
    order.pricing?.coupon?.code ||
    order.coupon?.code ||
    (typeof order.coupon === "string" ? order.coupon : "");

  const rowsHTML = items
    .map((it, idx) => {
      const name = it.productSnapshot?.name || it.name || it.title || `Item #${idx + 1}`;
      const sku = it.productSnapshot?.sku || it.sku || "—";
      const qty = Number(it.quantity || 1);
      const unit = Number(it.finalPrice ?? it.price ?? it.productSnapshot?.price ?? 0);
      const lineTotal = Number(it.itemTotal ?? unit * qty);

      return `
        <tr>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">${idx + 1}</td>
          <td style="padding:10px 8px;border-bottom:1px solid #eee;">
            <div style="font-weight:600;color:#111;">${safe(name)}</div>
            <div style="font-size:11px;color:#777;">SKU: ${safe(sku)}</div>
          </td>
          <td class="right" style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${qty}</td>
          <td class="right" style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;">${formatINR(unit)}</td>
          <td class="right" style="padding:10px 8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatINR(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Tax Invoice - ${safe(invoiceNo)}</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #222; margin: 0; padding: 24px; font-size: 13px; line-height: 1.5; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #8B5A2B; padding-bottom: 16px; margin-bottom: 20px; }
    .brand-title { font-size: 22px; font-weight: bold; color: #1a1a1a; letter-spacing: 0.5px; }
    .badge { display: inline-block; background: #8B5A2B; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; margin-top: 4px; }
    .meta-box { text-align: right; }
    .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #888; margin-bottom: 6px; letter-spacing: 0.5px; }
    .grid { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 20px; }
    .col { flex: 1; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f8f6f0; text-align: left; padding: 10px 8px; font-size: 11px; text-transform: uppercase; color: #444; border-bottom: 2px solid #ddd; }
    .totals-wrapper { display: flex; justify-content: flex-end; margin-bottom: 30px; }
    .totals-table { width: 320px; border-collapse: collapse; }
    .totals-table td { padding: 6px 8px; }
    .totals-table .total-row td { border-top: 2px solid #111; font-weight: bold; font-size: 15px; color: #111; padding-top: 10px; }
    .footer { border-top: 1px solid #eee; padding-top: 16px; text-align: center; color: #777; font-size: 11px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div class="brand-title">${safe(b.name)}</div>
        <div style="font-size:12px;color:#555;margin-top:4px;">${safe(b.address)}</div>
        <div style="font-size:12px;color:#555;">GSTIN: <b>${safe(b.gst)}</b> | Email: ${safe(b.email)}</div>
      </div>
      <div class="meta-box">
        <span class="badge">Tax Invoice</span>
        <div style="font-size:14px;font-weight:bold;margin-top:8px;">${safe(invoiceNo)}</div>
        <div style="font-size:12px;color:#666;">Date: ${safe(createdAt)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="col">
        <div class="section-title">Billed To</div>
        <div style="font-weight:bold;font-size:14px;">${safe(customerName)}</div>
        ${customerPhone ? `<div>Phone: ${safe(customerPhone)}</div>` : ""}
        ${customerEmail ? `<div>Email: ${safe(customerEmail)}</div>` : ""}
        <div style="margin-top:4px;color:#444;">${safe(addressText) || "Delivery Address as registered"}</div>
      </div>
      <div class="col" style="text-align:right;">
        <div class="section-title">Payment Overview</div>
        <div>Method: <b>${safe(pay.method)}</b></div>
        <div>Status: <b>${safe(pay.status)}</b></div>
        ${pay.razorpayPaymentId ? `<div>Payment Ref: <code style="font-size:11px;">${safe(pay.razorpayPaymentId)}</code></div>` : ""}
        ${pay.transactionId ? `<div>Txn ID: <code style="font-size:11px;">${safe(pay.transactionId)}</code></div>` : ""}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:30px;">#</th>
          <th>Product / Service</th>
          <th style="width:60px;text-align:right;">Qty</th>
          <th style="width:110px;text-align:right;">Unit Price</th>
          <th style="width:120px;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML || `<tr><td colspan="5" style="text-align:center;padding:20px;color:#888;">No items</td></tr>`}
      </tbody>
    </table>

    <div class="totals-wrapper">
      <table class="totals-table">
        <tr>
          <td style="color:#666;">Subtotal:</td>
          <td style="text-align:right;font-weight:600;">${formatINR(pricing.subtotal || 0)}</td>
        </tr>
        ${Number(pricing.discount || 0) > 0 ? `
        <tr>
          <td style="color:#0a7a3a;">Coupon Discount (${couponCode ? safe(couponCode) : "Applied"}):</td>
          <td style="text-align:right;color:#0a7a3a;font-weight:600;">- ${formatINR(pricing.discount || 0)}</td>
        </tr>` : ""}
        <tr>
          <td style="color:#666;">Shipping Charges:</td>
          <td style="text-align:right;font-weight:600;">${Number(pricing.shipping || 0) === 0 ? "FREE" : formatINR(pricing.shipping || 0)}</td>
        </tr>
        ${Number(pricing.tax || 0) > 0 ? `
        <tr>
          <td style="color:#666;">Tax (GST):</td>
          <td style="text-align:right;font-weight:600;">${formatINR(pricing.tax || 0)}</td>
        </tr>` : ""}
        <tr class="total-row">
          <td>Grand Total:</td>
          <td style="text-align:right;">${formatINR(pricing.total || 0)}</td>
        </tr>
      </table>
    </div>

    <div class="footer">
      <p style="margin:0 0 4px 0;">This is a computer-generated tax invoice. No signature required.</p>
      <p style="margin:0;">Thank you for shopping with <b>JS GALLOR</b>. For inquiries, reach out to <b>directorjsgallor@gmail.com</b></p>
    </div>
  </div>
</body>
</html>`;
}

async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

async function generateOrderInvoicePdfBuffer({ website, orderId }) {
  const { order } = await findOrderAndDetails({ website, orderId });
  if (!order) throw new Error(`Order not found: ${orderId} (${website})`);

  const html = buildInvoiceHTML({ order });
  const buffer = await htmlToPdfBuffer(html);
  return { buffer, order };
}

module.exports = {
  findOrderAndDetails,
  buildInvoiceHTML,
  htmlToPdfBuffer,
  generateOrderInvoicePdfBuffer,
};
