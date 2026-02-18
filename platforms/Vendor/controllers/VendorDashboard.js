const VendorOrder = require("../models/VendorOrder.js"); // adjust path
const Product = require("../../manufacturer-portal/models/Product"); // adjust path

exports.getVendorReports = async (req, res) => {
  try {
    const vendorId = req.vendor?.id || req.user?.id; // depends on your protectVendor
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (to) to.setHours(23, 59, 59, 999);

    const match = { vendor: vendorId };
    if (from && to) match.createdAt = { $gte: from, $lte: to };
    else if (from) match.createdAt = { $gte: from };
    else if (to) match.createdAt = { $lte: to };

    const revenueStatuses = ["confirmed", "processing", "shipped", "delivered"];

    // Products count
    const [totalProducts, approvedProducts] = await Promise.all([
      Product.countDocuments({ vendor: vendorId }),
      Product.countDocuments({ vendor: vendorId, status: "approved" }),
    ]);

    // Summary
    const summaryAgg = await VendorOrder.aggregate([
      { $match: match },
      {
        $facet: {
          totalOrders: [{ $count: "count" }],
          pendingOrders: [{ $match: { status: "pending" } }, { $count: "count" }],
          revenue: [
            { $match: { status: { $in: revenueStatuses } } },
            { $group: { _id: null, sum: { $sum: "$pricing.total" } } },
          ],
        },
      },
    ]);

    const s = summaryAgg?.[0] || {};
    const summary = {
      revenue: s.revenue?.[0]?.sum || 0,
      totalOrders: s.totalOrders?.[0]?.count || 0,
      pendingOrders: s.pendingOrders?.[0]?.count || 0,
      totalProducts,
      approvedProducts,
    };

    // Daily rows
    const rows = await VendorOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          orders: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          revenue: {
            $sum: {
              $cond: [
                { $in: ["$status", revenueStatuses] },
                "$pricing.total",
                0,
              ],
            },
          },
        },
      },
      { $sort: { _id: -1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          orders: 1,
          pending: 1,
          revenue: 1,
        },
      },
    ]);

    return res.json({ success: true, summary, rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to load vendor reports" });
  }
};
