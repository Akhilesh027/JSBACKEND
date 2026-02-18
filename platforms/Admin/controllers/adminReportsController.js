const mongoose = require("mongoose");
const Manufacturer = require("../../manufacturer-portal/models/Manufacturer");
const Product = require("../../manufacturer-portal/models/Product"); // ✅ update path
const Factory = require("../../manufacturer-portal/models/Factory"); // ✅ update path
const Order = require("../../manufacturer-portal/models/Order"); // ✅ update path

// helpers
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

/**
 * GET /api/admin/reports/manufacturers?days=30
 * Returns report for ALL manufacturers in one call.
 */
exports.getAllManufacturerReports = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, toInt(req.query.days, 30)));
    const from = startOfDaysAgo(days);

    // ✅ fetch all manufacturers basic info (for display)
    const manufacturers = await Manufacturer.find({})
      .select("companyName email contact location createdAt status isVerified")
      .lean();

    const manufacturerIds = manufacturers.map((m) => m._id);

    // ==========================
    // Products aggregates
    // ==========================
    const productAgg = await Product.aggregate([
      { $match: { manufacturer: { $in: manufacturerIds }, createdAt: { $gte: from } } },
      {
        $group: {
          _id: "$manufacturer",
          totalCatalogs: { $sum: 1 },
          approvedCatalogs: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          pendingCatalogs: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          rejectedCatalogs: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          forwardedCatalogs: { $sum: { $cond: [{ $eq: ["$forwardedToWebsite", true] }, 1, 0] } },
        },
      },
    ]);

    const productMap = new Map(productAgg.map((x) => [String(x._id), x]));

    // ==========================
    // Factories aggregates
    // ==========================
    const factoryAgg = await Factory.aggregate([
      { $match: { manufacturer: { $in: manufacturerIds } } },
      {
        $group: {
          _id: "$manufacturer",
          totalFactories: { $sum: 1 },
          activeFactories: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        },
      },
    ]);
    const factoryMap = new Map(factoryAgg.map((x) => [String(x._id), x]));

    // ==========================
    // Orders aggregates
    // ==========================
    // OPTION A: if Order has "manufacturer" field directly
    // (fastest + recommended)
    let orderAgg = [];
    let statusAgg = [];
    let itemsAgg = [];

    try {
      orderAgg = await Order.aggregate([
        { $match: { manufacturer: { $in: manufacturerIds }, createdAt: { $gte: from } } },
        {
          $group: {
            _id: "$manufacturer",
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            totalItems: { $sum: { $ifNull: ["$totalItems", 0] } }, // if you store totalItems
          },
        },
      ]);

      statusAgg = await Order.aggregate([
        { $match: { manufacturer: { $in: manufacturerIds }, createdAt: { $gte: from } } },
        {
          $group: {
            _id: { manufacturer: "$manufacturer", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]);

      // recent activity (orders)
      itemsAgg = await Order.aggregate([
        { $match: { manufacturer: { $in: manufacturerIds }, createdAt: { $gte: from } } },
        { $sort: { createdAt: -1 } },
        { $limit: 100 },
        {
          $project: {
            manufacturer: 1,
            orderNumber: 1,
            status: 1,
            createdAt: 1,
          },
        },
      ]);
    } catch (e) {
      // OPTION B fallback:
      // Order does NOT have manufacturer field.
      // We compute manufacturer using order.items.product -> Product.manufacturer
      // This is heavier but works with your structure.
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
        { $match: { "p.manufacturer": { $in: manufacturerIds } } },
        {
          $group: {
            _id: { manufacturer: "$p.manufacturer", orderId: "$_id" },
            totalAmount: { $first: { $ifNull: ["$totalAmount", 0] } },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },
            orderNumber: { $first: "$orderNumber" },
            itemsCount: { $sum: { $ifNull: ["$items.quantity", 1] } },
          },
        },
        {
          $group: {
            _id: "$_id.manufacturer",
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
            totalItems: { $sum: "$itemsCount" },
          },
        },
      ]);

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
        { $match: { "p.manufacturer": { $in: manufacturerIds } } },
        {
          $group: {
            _id: { manufacturer: "$p.manufacturer", orderId: "$_id" },
            status: { $first: "$status" },
          },
        },
        {
          $group: {
            _id: { manufacturer: "$_id.manufacturer", status: "$status" },
            count: { $sum: 1 },
          },
        },
      ]);

      itemsAgg = await Order.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $sort: { createdAt: -1 } },
        { $limit: 150 },
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
        { $match: { "p.manufacturer": { $in: manufacturerIds } } },
        {
          $group: {
            _id: { manufacturer: "$p.manufacturer", orderId: "$_id" },
            orderNumber: { $first: "$orderNumber" },
            status: { $first: "$status" },
            createdAt: { $first: "$createdAt" },
          },
        },
        { $sort: { createdAt: -1 } },
      ]);
    }

    const orderMap = new Map(orderAgg.map((x) => [String(x._id), x]));

    // statusMap: manufacturer -> {status:count}
    const statusMap = new Map();
    for (const row of statusAgg) {
      const mId = String(row._id.manufacturer);
      const st = String(row._id.status || "pending");
      const prev = statusMap.get(mId) || {};
      prev[st] = row.count;
      statusMap.set(mId, prev);
    }

    // recent activity (simple)
    const activityMap = new Map(); // manufacturer -> [{label, at, type}]
    for (const x of itemsAgg) {
      const mId = String(x.manufacturer || x._id?.manufacturer);
      if (!mId) continue;
      const list = activityMap.get(mId) || [];
      if (list.length >= 6) continue;

      const st = String(x.status || "").toLowerCase();
      const type =
        st.includes("cancel") ? "warn" : st.includes("deliver") ? "good" : "info";

      list.push({
        label: `Order ${x.orderNumber ? `#${x.orderNumber}` : ""} ${x.status || ""}`.trim(),
        at: x.createdAt,
        type,
      });

      activityMap.set(mId, list);
    }

    // ==========================
    // Final response per manufacturer
    // ==========================
    const reports = manufacturers.map((m) => {
      const id = String(m._id);

      const p = productMap.get(id) || {};
      const f = factoryMap.get(id) || {};
      const o = orderMap.get(id) || {};
      const st = statusMap.get(id) || {};

      // normalize statuses required by frontend
      const byStatus = {
        pending: st.pending || 0,
        packed: st.packed || 0,
        shipped: st.shipped || 0,
        in_transit: st.in_transit || st["in-transit"] || 0,
        delivered: st.delivered || 0,
        cancelled: st.cancelled || st.canceled || 0,
      };

      return {
        manufacturer: {
          _id: m._id,
          companyName: m.companyName || "—",
          email: m.email || "—",
          status: m.status || "—",
          isVerified: !!m.isVerified,
          createdAt: m.createdAt,
        },

        rangeLabel: `Last ${days} days`,

        // Sales/Orders
        totalOrders: o.totalOrders || 0,
        totalRevenue: o.totalRevenue || 0,
        totalItems: o.totalItems || 0,

        // Catalog
        totalCatalogs: p.totalCatalogs || 0,
        approvedCatalogs: p.approvedCatalogs || 0,
        pendingCatalogs: p.pendingCatalogs || 0,
        rejectedCatalogs: p.rejectedCatalogs || 0,

        // Fulfillment
        byStatus,

        // Operations
        forwardedCatalogs: p.forwardedCatalogs || 0,

        // Tickets/returns/damages - if you have models, plug them here
        activeTickets: 0,
        resolvedTickets: 0,
        returnRequests: 0,
        damageReports: 0,

        // optional
        topProducts: [],

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
    console.error("getAllManufacturerReports error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
