const mongoose = require("mongoose");

// ✅ Update these model imports to your real file names
const AffordableOrder = require("../../affordable-website/models/AffordableOrder");
const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder");
const LuxuryOrder = require("../../luxury-website/models/luxury_orders");

const toInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const getFromDate = (days) => {
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
};

const normalizeOrder = (o, website) => {
  // keep it flexible for your frontend:
  // { _id, status, totals/grandTotal/totalAmount, createdAt }
  return {
    ...o,
    website, // so frontend can show "affordable/midrange/luxury"
  };
};

async function fetchSegmentOrders(Model, website, days) {
  const from = getFromDate(days);

  const q = from ? { createdAt: { $gte: from } } : {};

  // ✅ sort newest first
  const orders = await Model.find(q)
    .sort({ createdAt: -1 })
    .lean();

  return orders.map((o) => normalizeOrder(o, website));
}

/**
 * GET /api/admin/:segment/orders?days=30
 * segment: affordable | midrange | luxury
 */
exports.getSegmentOrders = async (req, res) => {
  try {
    const segment = String(req.params.segment || "").toLowerCase().trim();
    const days = req.query.days ? Math.min(365, Math.max(1, toInt(req.query.days, 30))) : null;

    let Model = null;
    let website = null;

    if (segment === "affordable") {
      Model = AffordableOrder;
      website = "affordable";
    } else if (segment === "midrange") {
      Model = MidrangeOrder;
      website = "midrange";
    } else if (segment === "luxury") {
      Model = LuxuryOrder;
      website = "luxury";
    } else {
      return res.status(400).json({ success: false, message: "Invalid segment" });
    }

    const data = await fetchSegmentOrders(Model, website, days);

    return res.status(200).json({
      success: true,
      segment: website,
      days: days || "all",
      count: data.length,
      data, // ✅ frontend supports payload.data
    });
  } catch (err) {
    console.error("getSegmentOrders error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * ✅ OPTIONAL (Recommended)
 * GET /api/admin/orders/all?days=30
 * Returns combined orders from all 3 models in 1 call.
 */
exports.getAllOrders = async (req, res) => {
  try {
    const days = req.query.days ? Math.min(365, Math.max(1, toInt(req.query.days, 30))) : null;

    const [a, m, l] = await Promise.all([
      fetchSegmentOrders(AffordableOrder, "affordable", days),
      fetchSegmentOrders(MidrangeOrder, "midrange", days),
      fetchSegmentOrders(LuxuryOrder, "luxury", days),
    ]);

    const merged = [...a, ...m, ...l].sort((x, y) => {
      const dx = new Date(x.createdAt || x.updatedAt || 0).getTime();
      const dy = new Date(y.createdAt || y.updatedAt || 0).getTime();
      return dy - dx;
    });

    return res.status(200).json({
      success: true,
      segment: "all",
      days: days || "all",
      count: merged.length,
      data: merged,
    });
  } catch (err) {
    console.error("getAllOrders error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
