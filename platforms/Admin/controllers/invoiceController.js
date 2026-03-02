// controllers/admin/invoiceController.js
const puppeteer = require("puppeteer");
const path = require("path");

// ✅ FIXED PATH (very important)
const transporter = require("../utils/mailer.js");

const AffordableOrder = require("../../affordable-website/models/AffordableOrder");
const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder");
const LuxuryOrder = require("../../luxury-website/models/luxury_orders");

const AffordableCustomer = require("../../affordable-website/models/affordable_customers");
const LuxuryCustomer = require("../../luxury-website/models/luxury_customers");

// -------------------------
// Helpers
// -------------------------
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
  const ownerId = order.userId || order.customerId || order.customer || order.customerId;

  try {
    const w = normalizeWebsite(website);
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
    }

    if (w === "luxury" && ownerId) {
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
  } catch {
    // ignore user fetch errors
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
    method: safe(payment.method).toLowerCase() || "—",
    status: safe(payment.status).toLowerCase() || "—",
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
        coupon: order.pricing?.coupon || order.totals?.coupon || null,
      },
      _invoiceAddress: addressLine,
      website: order.website || normalizeWebsite(website),
    },
  };
}

function buildInvoiceHTML({ order, business }) {
  const b = business || {
    name: "JS GALLOR",
    address: "India",
    email: "directorjsgallor@gmail.com",
    phone: "+91-XXXXXXXXXX",
    gst: "",
    logoUrl: "",
    // ✅ NEW: used to make product image URLs absolute (recommended)
    // example: "https://jsgallor.com" OR "https://cdn.jsgallor.com"
    publicBaseUrl: "",
  };

  const items = Array.isArray(order.items) ? order.items : [];
  const invoiceNo = order.orderNumber || `INV-${String(order._id).slice(-8).toUpperCase()}`;
  const createdAt = order.createdAt ? new Date(order.createdAt).toLocaleString("en-IN") : "—";

  const customerName =
    order.userDetails?.name ||
    order.addressSnapshot?.fullName ||
    order.addressDetails?.fullName ||
    order.shippingAddress?.firstName ||
    "Customer";

  const customerEmail = order.userDetails?.email || order.addressDetails?.email || order.shippingAddress?.email || "";
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
  const payMeta = pay.meta || {};

  // ✅ NEW: helper to build absolute image URLs for puppeteer PDF rendering
  const isAbsoluteUrl = (url = "") => /^https?:\/\//i.test(String(url || ""));
  const joinUrl = (base, rel) => {
    const b = String(base || "").replace(/\/+$/, "");
    const r = String(rel || "").replace(/^\/+/, "");
    return b && r ? `${b}/${r}` : rel;
  };

  const resolveImageUrl = (it) => {
    const candidate =
      it?.image ||
      it?.productSnapshot?.image ||
      it?.productSnapshot?.images?.[0] ||
      it?.productSnapshot?.gallery?.[0] ||
      it?.productSnapshot?.media?.[0]?.url ||
      "";

    if (!candidate) return "";
    if (isAbsoluteUrl(candidate)) return candidate;

    // if you store "/uploads/..." or "uploads/..."
    return b.publicBaseUrl ? joinUrl(b.publicBaseUrl, candidate) : candidate;
  };

  const rowsHTML = items
    .map((it, idx) => {
      const name = it.name || it.productSnapshot?.name || "Item";
      const qty = Number(it.quantity || 0);
      const unit = Number(it.finalPrice ?? it.price ?? it.productSnapshot?.price ?? 0);
      const line = unit * qty;

      const imgUrl = resolveImageUrl(it);

      return `
        <tr>
          <td>${idx + 1}</td>

          <!-- ✅ NEW: Image column -->
          <td style="width:74px">
            ${
              imgUrl
                ? `<img
                     src="${safe(imgUrl)}"
                     alt="product"
                     style="width:56px;height:56px;border-radius:10px;object-fit:cover;border:1px solid #eee;background:#fafafa"
                     onerror="this.style.display='none'"
                   />`
                : `<div style="width:56px;height:56px;border-radius:10px;border:1px dashed #ddd;background:#fafafa"></div>`
            }
          </td>

          <td>
            <div style="font-weight:600">${safe(name)}</div>
            <div style="font-size:12px;color:#666;margin-top:4px">Product: ${safe(it.productId || "")}</div>
          </td>

          <td style="text-align:right">${qty}</td>
          <td style="text-align:right">${formatINR(unit)}</td>
          <td style="text-align:right;font-weight:600">${formatINR(line)}</td>
        </tr>
      `;
    })
    .join("");

  const couponCode = pricing?.coupon?.code || "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${invoiceNo}</title>
  <style>
    *{box-sizing:border-box;font-family:Inter,Arial,sans-serif}
    body{margin:0;padding:24px;background:#f6f7fb;color:#111}
    .wrap{max-width:900px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:16px;overflow:hidden}
    .header{padding:22px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
    .brand{display:flex;gap:12px;align-items:center}
    .logo{width:44px;height:44px;border-radius:12px;background:#111;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;overflow:hidden}
    .muted{color:#666}
    .badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#f2f2f2;font-size:12px}
    .content{padding:18px 24px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .card{border:1px solid #eee;border-radius:12px;padding:14px}
    table{width:100%;border-collapse:collapse;margin-top:14px}
    th,td{border-bottom:1px solid #eee;padding:10px 8px;font-size:13px;vertical-align:top}
    th{background:#fafafa;text-align:left;color:#333}
    .right{text-align:right}
    .totals{margin-top:16px;display:grid;grid-template-columns:1fr 280px;gap:14px}
    .totals .box{border:1px solid #eee;border-radius:12px;padding:14px}
    .row{display:flex;justify-content:space-between;margin:8px 0;font-size:13px}
    .row strong{font-size:14px}
    .footer{padding:16px 24px;border-top:1px solid #eee;background:#fafafa}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="brand">
        <div class="logo">
          ${
            b.logoUrl
              ? `<img src="${b.logoUrl}" style="width:44px;height:44px;object-fit:cover"/>`
              : "JG"
          }
        </div>
        <div>
          <div style="font-size:16px;font-weight:800">${safe(b.name)}</div>
          <div class="muted" style="font-size:12px;margin-top:3px">${safe(b.address)}</div>
          <div class="muted" style="font-size:12px;margin-top:3px">${safe(b.email)} ${b.phone ? `• ${safe(b.phone)}` : ""}</div>
          ${b.gst ? `<div class="muted" style="font-size:12px;margin-top:3px">GST: ${safe(b.gst)}</div>` : ""}
        </div>
      </div>

      <div style="text-align:right">
        <div style="font-size:18px;font-weight:800">INVOICE</div>
        <div class="muted" style="font-size:12px;margin-top:6px">Invoice No: <b>${invoiceNo}</b></div>
        <div class="muted" style="font-size:12px;margin-top:4px">Date: ${createdAt}</div>
        <div style="margin-top:8px">
          <span class="badge">${safe(order.website || "").toUpperCase()}</span>
          <span class="badge">${safe(order.status || "").toUpperCase()}</span>
        </div>
      </div>
    </div>

    <div class="content">
      <div class="grid">
        <div class="card">
          <div style="font-weight:700;margin-bottom:8px">Billed To</div>
          <div style="font-weight:600">${safe(customerName)}</div>
          <div class="muted" style="font-size:12px;margin-top:4px">${safe(customerEmail)}</div>
          <div class="muted" style="font-size:12px;margin-top:2px">${safe(customerPhone)}</div>
          <div class="muted" style="font-size:12px;margin-top:8px">User ID: <span style="font-family:monospace">${safe(order.userId || order.customerId || "")}</span></div>
        </div>

        <div class="card">
          <div style="font-weight:700;margin-bottom:8px">Shipping Address</div>
          <div style="font-size:13px;line-height:1.45">${safe(addressText) || "—"}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:44px">#</th>
            <th style="width:74px">Image</th>
            <th>Item</th>
            <th class="right" style="width:70px">Qty</th>
            <th class="right" style="width:110px">Unit</th>
            <th class="right" style="width:130px">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHTML || `<tr><td colspan="6" class="muted">No items</td></tr>`}
        </tbody>
      </table>

      <div class="totals">
        <div class="box">
          <div style="font-weight:700;margin-bottom:8px">Payment</div>
          <div class="row"><span class="muted">Method</span><span><b>${safe(pay.method || "").toUpperCase() || "—"}</b></span></div>
          <div class="row"><span class="muted">Status</span><span><b>${safe(pay.status || "").toUpperCase() || "—"}</b></span></div>
          ${pay.transactionId ? `<div class="row"><span class="muted">Txn</span><span style="font-family:monospace">${safe(pay.transactionId)}</span></div>` : ""}
          ${payMeta.upiId ? `<div class="row"><span class="muted">UPI</span><span style="font-family:monospace">${safe(payMeta.upiId)}</span></div>` : ""}
          ${payMeta.bank ? `<div class="row"><span class="muted">Bank</span><span>${safe(payMeta.bank)}</span></div>` : ""}
          ${payMeta.cardLast4 ? `<div class="row"><span class="muted">Card</span><span>**** ${safe(payMeta.cardLast4)}</span></div>` : ""}
          ${pay.razorpayOrderId ? `<div class="row"><span class="muted">Razorpay Order</span><span style="font-family:monospace">${safe(pay.razorpayOrderId)}</span></div>` : ""}
          ${pay.razorpayPaymentId ? `<div class="row"><span class="muted">Razorpay Payment</span><span style="font-family:monospace">${safe(pay.razorpayPaymentId)}</span></div>` : ""}
        </div>

        <div class="box">
          <div style="font-weight:700;margin-bottom:8px">Summary</div>
          <div class="row"><span class="muted">Subtotal</span><span>${formatINR(pricing.subtotal || 0)}</span></div>
          ${
            Number(pricing.discount || 0) > 0
              ? `<div class="row"><span class="muted">Discount</span><span style="color:#0a7a3a">- ${formatINR(pricing.discount || 0)}</span></div>`
              : ""
          }
          <div class="row"><span class="muted">Shipping</span><span>${formatINR(pricing.shipping || 0)}</span></div>
          ${Number(pricing.tax || 0) > 0 ? `<div class="row"><span class="muted">Tax</span><span>${formatINR(pricing.tax || 0)}</span></div>` : ""}
          ${couponCode ? `<div class="row"><span class="muted">Coupon</span><span style="font-family:monospace">${safe(couponCode)}</span></div>` : ""}
          <div class="row" style="border-top:1px solid #eee;padding-top:10px;margin-top:10px">
            <strong>Total</strong><strong>${formatINR(pricing.total || 0)}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div style="font-size:12px;color:#666">
        Thank you for your order. If you have any questions, contact ${safe(b.email)}.
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ✅ MUCH safer puppeteer (works on Windows + Linux)
async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "18px", right: "18px", bottom: "18px", left: "18px" },
    });

    // ✅ Ensure real buffer
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

// -------------------------
// Controllers
// -------------------------

exports.downloadInvoicePdf = async (req, res) => {
  try {
    const website = req.params.website;
    const orderId = req.params.id || req.params.orderId;

    const { order } = await findOrderAndDetails({ website, orderId });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const html = buildInvoiceHTML({
      order,
      business: {
        name: "JS GALLOR",
        address: "India",
        email: "support@jsgallor.com",
        phone: "+91-XXXXXXXXXX",
      },
    });

    const pdfBuffer = await htmlToPdfBuffer(html);

    // ✅ If PDF buffer is empty -> fail early (prevents corrupt pdf download)
    if (!pdfBuffer || !pdfBuffer.length) {
      return res.status(500).json({ success: false, message: "Invoice PDF generation failed" });
    }

    const fileName = `invoice-${order.orderNumber || order._id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.end(pdfBuffer);
  } catch (err) {
    console.error("downloadInvoicePdf error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate invoice PDF",
      error: err?.message,
    });
  }
};

exports.emailInvoice = async (req, res) => {
  try {
    const website = req.params.website;
    const orderId = req.params.id || req.params.orderId;
    const toEmail = String(req.body.email || "").trim();

    // ✅ transporter sanity check (helps catch import mistakes)
    if (!transporter || typeof transporter.sendMail !== "function") {
      return res.status(500).json({
        success: false,
        message: "Mailer misconfigured: transporter.sendMail missing",
      });
    }

    const { order } = await findOrderAndDetails({ website, orderId });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const customerEmail =
      toEmail ||
      order.userDetails?.email ||
      order.addressDetails?.email ||
      order.shippingAddress?.email ||
      "";

    if (!customerEmail) {
      return res.status(400).json({
        success: false,
        message: "Customer email not found. Pass email in body.",
      });
    }

    const html = buildInvoiceHTML({
      order,
      business: {
        name: "JS GALLOR",
        address: "India",
        email: "support@jsgallor.com",
        phone: "+91-XXXXXXXXXX",
      },
    });

    const pdfBuffer = await htmlToPdfBuffer(html);

    if (!pdfBuffer || !pdfBuffer.length) {
      return res.status(500).json({ success: false, message: "Invoice PDF generation failed" });
    }

    const fileName = `invoice-${order.orderNumber || order._id}.pdf`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: customerEmail,
      subject: `Invoice - ${order.orderNumber || order._id}`,
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2 style="margin:0 0 8px 0">Your Invoice</h2>
          <p style="margin:0 0 10px 0">Please find attached the invoice for your order.</p>
          <p style="margin:0;color:#666">Order: <b>${order.orderNumber || order._id}</b></p>
        </div>
      `,
      attachments: [
        {
          filename: fileName,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return res.json({ success: true, message: `Invoice emailed to ${customerEmail}` });
  } catch (err) {
    console.error("emailInvoice error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to email invoice",
      error: err?.message,
    });
  }
};