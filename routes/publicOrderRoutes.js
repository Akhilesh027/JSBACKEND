const express = require("express");
const router = express.Router();
const { generateOrderInvoicePdfBuffer } = require("../shared/services/pdfService");

/**
 * Public invoice download endpoint for customers (e.g. from WhatsApp or Email link)
 * GET /api/public/orders/:website/:orderId/invoice.pdf
 */
router.get("/:website/:orderId/invoice.pdf", async (req, res) => {
  try {
    const { website, orderId } = req.params;

    if (!orderId || !website) {
      return res.status(400).json({ success: false, message: "Website and orderId are required" });
    }

    const { buffer, order } = await generateOrderInvoicePdfBuffer({ website, orderId });

    if (!buffer || !buffer.length) {
      return res.status(500).json({ success: false, message: "Failed to generate invoice PDF" });
    }

    const fileName = `invoice-${order.orderNumber || order._id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Length", buffer.length);

    return res.end(buffer);
  } catch (err) {
    console.error("Public invoice download error:", err.message);
    return res.status(404).json({
      success: false,
      message: "Invoice not found or could not be generated",
      error: err.message,
    });
  }
});

module.exports = router;
