// controllers/adminManufacturerDashboard.controller.js
const Product = require("../../manufacturer-portal/models/Product");
const PurchaseOrder = require("../../Admin/models/PurchaseOrder");

// ✅ import these ONLY if you really have these models
// const Ticket = require("../../Admin/models/Ticket");
// const Payment = require("../../Admin/models/Payment");

const safeCount = async (Model, filter = {}) => {
  if (!Model) return 0; // if model not used in your project, return 0 instead of crashing
  return await Model.countDocuments(filter);
};

// ✅ counts for top stats (your cards)
exports.getManufacturersSummary = async (req, res) => {
  try {
    // ✅ NO admin check now

    // pending catalogs across all manufacturers
    const pendingCatalogs = await Product.countDocuments({ status: "pending" });

    // active orders across all manufacturers
    const activeOrders = await PurchaseOrder.countDocuments({
      status: { $nin: ["delivered", "rejected", "completed"] },
    });

    // if you don't have Ticket/Payment models, keep them as 0
    const openTickets = await safeCount(global.Ticket, {
      status: "open",
      createdByType: "manufacturer",
    });

    const pendingPayments = await safeCount(global.Payment, {
      status: "pending",
      partyType: "manufacturer",
    });

    return res.json({
      success: true,
      summary: {
        pendingCatalogs,
        activeOrders,
        openTickets,
        pendingPayments,
      },
    });
  } catch (err) {
    console.error("getManufacturersSummary error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ✅ recent lists for dashboard sections (recent catalogs + manufacturer tickets)
exports.getManufacturersRecentActivity = async (req, res) => {
  try {
    // ✅ NO admin check now

    // Recent catalog submissions (limit 4)
    const recentCatalogsRaw = await Product.find()
      .select("name status manufacturer createdAt price image")
      .populate("manufacturer", "companyName")
      .sort({ createdAt: -1 })
      .limit(4);

    // Recent manufacturer tickets (limit 3) - if Ticket model doesn't exist, return []
    let recentTickets = [];
    if (global.Ticket) {
      recentTickets = await global.Ticket.find({ createdByType: "manufacturer" })
        .select("ticketNumber subject status createdAt createdByType")
        .sort({ createdAt: -1 })
        .limit(3);
    }

    // map to frontend expected keys
    const recentCatalogs = recentCatalogsRaw.map((c) => ({
      _id: c._id,
      productName: c.name,
      status: c.status,
      manufacturerName:
        typeof c.manufacturer === "object" && c.manufacturer
          ? c.manufacturer.companyName
          : "—",
      createdAt: c.createdAt,
      price: c.price,
      image: c.image,
    }));

    return res.json({
      success: true,
      recent: {
        catalogs: recentCatalogs,
        tickets: recentTickets,
      },
    });
  } catch (err) {
    console.error("getManufacturersRecentActivity error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
