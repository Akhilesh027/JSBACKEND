const mongoose = require("mongoose");
const VendorOrder = require("../../Vendor/models/VendorOrder"); // adjust path
const Vendor = require("../../Vendor/models/Vendor"); // adjust path

const safeLower = (s) => String(s || "").trim().toLowerCase();
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

/** ✅ Single source of truth for allowed statuses (admin side) */
const ALLOWED_STATUSES = new Set([
  "placed",
  "approved",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "rejected",
]);

/**
 * ✅ Status transition rules (edit if your business logic differs)
 * placed -> approved / rejected / cancelled
 * approved -> confirmed / cancelled
 * confirmed -> processing / shipped / cancelled
 * processing -> shipped / cancelled
 * shipped -> delivered / returned
 * delivered -> (terminal)
 * rejected/cancelled/returned -> (terminal)
 */
const TRANSITIONS = {
  placed: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["processing", "shipped", "cancelled"]),
  processing: new Set(["shipped", "cancelled"]),
  shipped: new Set(["delivered", "returned"]),
  delivered: new Set([]),
  rejected: new Set([]),
  cancelled: new Set([]),
  returned: new Set([]),
};

const isTerminal = (s) => ["delivered", "rejected", "cancelled", "returned"].includes(s);

/** ✅ Normalize order response to UI shape */
function mapVendorOrder(o) {
  return {
    _id: String(o._id),
    website: o.website,
    websiteLabel: o.websiteLabel,
    vendor: {
      vendorId: String(o.vendor?._id || ""),
      vendorName: o.vendor?.businessName || o.vendor?.name || "—",
      vendorSegment: o.vendor?.vendorSegment || o.vendor?.segment || "affordable",
      payoutStatus: o.vendor?.payoutStatus || "pending",
    },
    items: (o.items || []).map((it) => ({
      productId: String(it.productId || it.product || ""),
      name: it.name || it.productSnapshot?.name,
      image: it.image || it.productSnapshot?.image,
      quantity: Number(it.quantity || 0),
      price: it.price,
      discountPercent: it.discountPercent,
      discountAmount: it.discountAmount,
      finalPrice: it.finalPrice,
      productSnapshot: it.productSnapshot,
    })),
    totals: o.totals,
    pricing: o.pricing,
    payment: o.payment,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    adminDecision: o.adminDecision,
  };
}

exports.getVendorOrdersAdmin = async (req, res) => {
  try {
    const segment = req.query.segment; // affordable | midrange | luxury | all
    const status = req.query.status; // placed | approved | rejected | all
    const search = String(req.query.search || "").trim();

    const query = {};

    // ✅ make status filter case-insensitive safe
    if (status && safeLower(status) !== "all") {
      // If you store status in DB with mixed case (e.g., "Placed"),
      // this regex keeps it compatible:
      query.status = { $regex: `^${status}$`, $options: "i" };
    }

    if (search) {
      const or = [{ orderNumber: { $regex: search, $options: "i" } }];
      if (isObjectId(search)) or.push({ _id: search });
      query.$or = or;
    }

    const orders = await VendorOrder.find(query)
      .sort({ createdAt: -1 })
      .populate("vendor", "businessName name vendorSegment segment payoutStatus")
      .lean();

    // ✅ segment filter after populate
    const filtered =
      segment && safeLower(segment) !== "all"
        ? orders.filter((o) => {
            const seg = o.vendor?.vendorSegment || o.vendor?.segment;
            return safeLower(seg) === safeLower(segment);
          })
        : orders;

    return res.json({
      success: true,
      orders: filtered.map(mapVendorOrder),
    });
  } catch (err) {
    console.error("getVendorOrdersAdmin error:", err);
    return res.status(500).json({ message: "Failed to load vendor orders" });
  }
};

exports.approveVendorOrderAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await VendorOrder.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (safeLower(order.status) !== "placed") {
      return res
        .status(400)
        .json({ message: `Cannot approve from status: ${order.status}` });
    }

    order.status = "approved";
    order.updatedAt = new Date();

    order.adminDecision = {
      action: "approved",
      by: req.user?.id || req.admin?.id,
      at: new Date(),
    };

    await order.save();

    const fresh = await VendorOrder.findById(order._id)
      .populate("vendor", "businessName name vendorSegment segment payoutStatus")
      .lean();

    return res.json({
      success: true,
      message: "Order approved",
      order: mapVendorOrder(fresh),
    });
  } catch (err) {
    console.error("approveVendorOrderAdmin error:", err);
    return res.status(500).json({ message: "Approve failed" });
  }
};

exports.rejectVendorOrderAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;
    const reason = String(req.body?.reason || "").trim();

    const order = await VendorOrder.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (safeLower(order.status) !== "placed") {
      return res
        .status(400)
        .json({ message: `Cannot reject from status: ${order.status}` });
    }

    order.status = "rejected";
    order.updatedAt = new Date();

    order.adminDecision = {
      action: "rejected",
      reason: reason || undefined,
      by: req.user?.id || req.admin?.id,
      at: new Date(),
    };

    await order.save();

    const fresh = await VendorOrder.findById(order._id)
      .populate("vendor", "businessName name vendorSegment segment payoutStatus")
      .lean();

    return res.json({
      success: true,
      message: "Order rejected",
      order: mapVendorOrder(fresh),
    });
  } catch (err) {
    console.error("rejectVendorOrderAdmin error:", err);
    return res.status(500).json({ message: "Reject failed" });
  }
};

/**
 * ✅ NEW: Generic status change
 * PATCH /api/admin/vendor-orders/:orderId/status
 * body: { status: "confirmed" | "shipped" | ... , reason?: string }
 */
exports.updateVendorOrderStatusAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;
    const nextStatusRaw = req.body?.status;
    const reason = String(req.body?.reason || "").trim();

    const next = safeLower(nextStatusRaw);
    if (!next) return res.status(400).json({ message: "status is required" });

    if (!ALLOWED_STATUSES.has(next)) {
      return res.status(400).json({
        message: `Invalid status: ${nextStatusRaw}. Allowed: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
      });
    }

    const order = await VendorOrder.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const current = safeLower(order.status);

    // terminal lock
    if (isTerminal(current)) {
      return res.status(400).json({
        message: `Cannot change status from terminal state: ${order.status}`,
      });
    }

    // validate transition
    const allowedNext = TRANSITIONS[current] || new Set();
    if (!allowedNext.has(next)) {
      return res.status(400).json({
        message: `Invalid transition: ${current} -> ${next}`,
        allowed: Array.from(allowedNext),
      });
    }

    // update
    order.status = next; // store normalized lowercase (recommended)
    order.updatedAt = new Date();

    // record admin decision trail (optional)
    order.adminDecision = {
      action: next === "rejected" ? "rejected" : next === "approved" ? "approved" : order.adminDecision?.action,
      reason: reason || order.adminDecision?.reason,
      by: req.user?.id || req.admin?.id,
      at: new Date(),
      from: current,
      to: next,
    };

    await order.save();

    const fresh = await VendorOrder.findById(order._id)
      .populate("vendor", "businessName name vendorSegment segment payoutStatus")
      .lean();

    return res.json({
      success: true,
      message: `Status updated: ${current} -> ${next}`,
      order: mapVendorOrder(fresh),
    });
  } catch (err) {
    console.error("updateVendorOrderStatusAdmin error:", err);
    return res.status(500).json({ message: "Status update failed" });
  }
};
