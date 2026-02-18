const Vendor = require("../../Vendor/models/Vendor");      // ✅ update path/name if different
const Product = require("../../manufacturer-portal/models/Product");    // ✅ your product model
const Order = require("../../Vendor/models/VendorOrder");        // ✅ your order model

const toInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const startOfDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
};

// normalize any DB status -> the frontend statuses
const normalizeStatus = (s) => {
  const v = String(s || "").toLowerCase().trim();
  if (v.includes("approve")) return "approved";
  if (v.includes("pack")) return "packed";
  if (v.includes("ship")) return "shipped";
  if (v.includes("transit") || v.includes("in_transit") || v.includes("in-transit")) return "in_transit";
  if (v.includes("deliver")) return "delivered";
  if (v.includes("cancel")) return "cancelled";
  return "pending";
};

/**
 * GET /api/admin/reports/vendors?days=30
 * Admin: returns vendor reports for ALL vendors.
 */
exports.getAllVendorReports = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, toInt(req.query.days, 30)));
    const from = startOfDaysAgo(days);

    // ✅ Fetch all vendors basic info
    const vendors = await Vendor.find({})
      .select("name email status isVerified createdAt")
      .lean();

    const vendorIds = vendors.map((v) => v._id);

    // --------------------------
    // TRY OPTION A: Order has vendor field
    // --------------------------
    let orderAgg = [];
    let statusAgg = [];
    let topProductsAgg = [];
    let recentOrdersAgg = [];

    let usedVendorField = true;

    try {
      // totals
      orderAgg = await Order.aggregate([
        { $match: { vendor: { $in: vendorIds }, createdAt: { $gte: from } } },
        {
          $group: {
            _id: "$vendor",
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            totalItems: { $sum: { $ifNull: ["$totalItems", 0] } }, // if you store totalItems
            estEarnings: { $sum: { $ifNull: ["$vendorEarnings", 0] } }, // if you store vendorEarnings
          },
        },
      ]);

      // statuses
      statusAgg = await Order.aggregate([
        { $match: { vendor: { $in: vendorIds }, createdAt: { $gte: from } } },
        {
          $group: {
            _id: { vendor: "$vendor", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]);

      // top products (if order items have product)
      topProductsAgg = await Order.aggregate([
        { $match: { vendor: { $in: vendorIds }, createdAt: { $gte: from } } },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "p",
          },
        },
        { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { vendor: "$vendor", name: { $ifNull: ["$p.name", "$items.name"] } },
            orders: { $addToSet: "$_id" },
            revenue: { $sum: { $ifNull: ["$items.total", "$items.subtotal"] } },
          },
        },
        {
          $project: {
            _id: 0,
            vendor: "$_id.vendor",
            name: "$_id.name",
            orders: { $size: "$orders" },
            revenue: 1,
          },
        },
        { $sort: { revenue: -1 } },
      ]);

      // recent activity from orders
      recentOrdersAgg = await Order.aggregate([
        { $match: { vendor: { $in: vendorIds }, createdAt: { $gte: from } } },
        { $sort: { createdAt: -1 } },
        { $limit: 150 },
        {
          $project: {
            vendor: 1,
            orderNumber: 1,
            status: 1,
            createdAt: 1,
          },
        },
      ]);
    } catch (e) {
      usedVendorField = false;
    }

    // --------------------------
    // OPTION B FALLBACK:
    // Order doesn't have vendor field → derive vendor via items.product -> Product.vendor
    // --------------------------
    if (!usedVendorField) {
      // totals (per order, per vendor)
      orderAgg = await Order.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "p",
          },
        },
        { $unwind: "$p" },

        // ✅ IMPORTANT: your product must have vendor field like p.vendor or p.vendorId
        { $match: { "p.vendor": { $in: vendorIds } } },

        // unique order for vendor
        {
          $group: {
            _id: { vendor: "$p.vendor", orderId: "$_id" },
            totalAmount: { $first: { $ifNull: ["$totalAmount", 0] } },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },
            orderNumber: { $first: "$orderNumber" },
            itemsCount: { $sum: { $ifNull: ["$items.quantity", 1] } },

            // est earnings best-effort:
            // if you store item.vendorEarning or item.payout, use that; else use subtotal
            vendorEarn: { $sum: { $ifNull: ["$items.vendorEarning", { $ifNull: ["$items.subtotal", 0] }] } },
          },
        },
        {
          $group: {
            _id: "$_id.vendor",
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
            totalItems: { $sum: "$itemsCount" },
            estEarnings: { $sum: "$vendorEarn" },
          },
        },
      ]);

      // statuses
      statusAgg = await Order.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "p",
          },
        },
        { $unwind: "$p" },
        { $match: { "p.vendor": { $in: vendorIds } } },
        {
          $group: {
            _id: { vendor: "$p.vendor", orderId: "$_id" },
            status: { $first: "$status" },
          },
        },
        {
          $group: {
            _id: { vendor: "$_id.vendor", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]);

      // top products
      topProductsAgg = await Order.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "p",
          },
        },
        { $unwind: "$p" },
        { $match: { "p.vendor": { $in: vendorIds } } },
        {
          $group: {
            _id: { vendor: "$p.vendor", name: "$p.name" },
            orders: { $addToSet: "$_id" },
            revenue: { $sum: { $ifNull: ["$items.total", "$items.subtotal"] } },
          },
        },
        {
          $project: {
            _id: 0,
            vendor: "$_id.vendor",
            name: "$_id.name",
            orders: { $size: "$orders" },
            revenue: 1,
          },
        },
        { $sort: { revenue: -1 } },
      ]);

      // recent activity
      recentOrdersAgg = await Order.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $sort: { createdAt: -1 } },
        { $limit: 200 },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "p",
          },
        },
        { $unwind: "$p" },
        { $match: { "p.vendor": { $in: vendorIds } } },
        {
          $group: {
            _id: { vendor: "$p.vendor", orderId: "$_id" },
            orderNumber: { $first: "$orderNumber" },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },
          },
        },
        { $sort: { createdAt: -1 } },
      ]);
    }

    // --------------------------
    // Build maps
    // --------------------------
    const totalsMap = new Map(orderAgg.map((x) => [String(x._id), x]));

    // status map: vendorId -> {normalizedStatus: count}
    const statusMap = new Map();
    for (const row of statusAgg) {
      const vId = String(row._id.vendor);
      const stNorm = normalizeStatus(row._id.status);
      const prev = statusMap.get(vId) || {};
      prev[stNorm] = (prev[stNorm] || 0) + row.count;
      statusMap.set(vId, prev);
    }

    // topProducts map: vendorId -> top5 products
    const topMap = new Map();
    for (const row of topProductsAgg) {
      const vId = String(row.vendor);
      const list = topMap.get(vId) || [];
      if (list.length < 6) list.push({ name: row.name || "Product", orders: row.orders || 0, revenue: row.revenue || 0 });
      topMap.set(vId, list);
    }

    // activity map: vendorId -> latest activity
    const activityMap = new Map();
    for (const x of recentOrdersAgg) {
      const vId = String(x.vendor || x._id?.vendor);
      if (!vId) continue;
      const list = activityMap.get(vId) || [];
      if (list.length >= 6) continue;

      const st = normalizeStatus(x.status);
      const type = st === "delivered" ? "good" : st === "cancelled" ? "warn" : "info";

      list.push({
        label: `Order ${x.orderNumber ? `#${x.orderNumber}` : ""} ${String(x.status || "").trim()}`.trim(),
        at: x.createdAt,
        type,
      });

      activityMap.set(vId, list);
    }

    // --------------------------
    // Final response for each vendor
    // --------------------------
    const reports = vendors.map((v) => {
      const id = String(v._id);
      const totals = totalsMap.get(id) || {};
      const st = statusMap.get(id) || {};

      const byStatus = {
        pending: st.pending || 0,
        approved: st.approved || 0,
        packed: st.packed || 0,
        shipped: st.shipped || 0,
        in_transit: st.in_transit || 0,
        delivered: st.delivered || 0,
        cancelled: st.cancelled || 0,
      };

      return {
        vendor: {
          _id: v._id,
          name: v.name || "—",
          email: v.email,
          status: v.status,
          isVerified: !!v.isVerified,
          createdAt: v.createdAt,
        },

        rangeLabel: `Last ${days} days`,

        totalOrders: totals.totalOrders || 0,
        totalRevenue: totals.totalRevenue || 0,
        totalItems: totals.totalItems || 0,

        // ✅ Best-effort: if you store vendorEarnings, it will be accurate
        // otherwise fallback used subtotal sum in option B
        estEarnings: totals.estEarnings || 0,

        byStatus,

        // tickets/returns/damages: plug your models later
        activeTickets: 0,
        resolvedTickets: 0,
        returnRequests: 0,
        damageReports: 0,

        topProducts: topMap.get(id) || [],
        recentActivity: activityMap.get(id) || [],
      };
    });

    return res.status(200).json({
      success: true,
      days,
      from,
      count: reports.length,
      data: reports,
    });
  } catch (err) {
    console.error("getAllVendorReports error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
