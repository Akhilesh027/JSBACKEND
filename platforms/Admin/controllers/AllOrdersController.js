// controllers/AllOrdersController.js
const mongoose = require("mongoose");

const AffordableOrder = require("../../affordable-website/models/AffordableOrder");
const AffordableAddress = require("../../affordable-website/models/AffordableAddress");
const AffordableCustomer = require("../../affordable-website/models/affordable_customers");

const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder");
// If you have midrange customers model, add it:
// const MidrangeCustomer = require("../../midrange-website/models/midrange_customers");

const LuxuryOrder = require("../../luxury-website/models/luxury_orders");
const LuxuryCustomer = require("../../luxury-website/models/luxury_customers");

const toId = (v) => (v ? String(v) : "");
const isValidId = (v) => mongoose.Types.ObjectId.isValid(String(v));

const safeName = (u) =>
  (u?.fullName ||
    u?.name ||
    `${u?.firstName || ""} ${u?.lastName || ""}`.trim() ||
    "").trim();

function normalizePayment(order) {
  const p = order.payment || {};

  // standardize last4
  const cardLast4 =
    p?.meta?.cardLast4 ||
    p?.meta?.last4 ||
    p?.cardLast4 ||
    p?.last4 ||
    "";

  const meta = {
    ...(p.meta || {}),
    cardLast4: cardLast4 || undefined,
  };

  return {
    ...p,
    meta,
  };
}

function addressFromLuxuryShipping(shippingAddress) {
  if (!shippingAddress) return null;
  return {
    fullName: `${shippingAddress.firstName || ""} ${shippingAddress.lastName || ""}`.trim(),
    phone: shippingAddress.phone || "",
    email: shippingAddress.email || "",
    addressLine1: shippingAddress.addressLine1 || "",
    addressLine2: shippingAddress.addressLine2 || "",
    city: shippingAddress.city || "",
    state: shippingAddress.state || "",
    pincode: shippingAddress.pincode || "",
    country: shippingAddress.country || "India",
    label: shippingAddress.label || "Home",
  };
}

function addressFromMidSnapshot(addressSnapshot) {
  if (!addressSnapshot) return null;
  return {
    fullName: addressSnapshot.fullName || "",
    phone: addressSnapshot.phone || "",
    addressLine1: addressSnapshot.line1 || "",
    addressLine2: addressSnapshot.line2 || "",
    landmark: addressSnapshot.landmark || "",
    city: addressSnapshot.city || "",
    state: addressSnapshot.state || "",
    pincode: addressSnapshot.pincode || "",
  };
}

exports.getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;

    // NOTE: You used "mid_range" in DB; frontend expects "midrange"
    const affQuery = { website: "affordable" };
    const midQuery = { website: "mid_range" };
    const luxQuery = { website: "luxury" };

    if (status && status !== "all") {
      affQuery.status = status;
      midQuery.status = status;
      luxQuery.status = status;
    }

    const [affRaw, midRaw, luxRaw] = await Promise.all([
      AffordableOrder.find(affQuery).sort({ createdAt: -1 }).lean(),
      MidrangeOrder.find(midQuery).sort({ createdAt: -1 }).lean(),
      LuxuryOrder.find(luxQuery).sort({ createdAt: -1 }).lean(),
    ]);

    // -----------------------------
    // ✅ Batch fetch Affordable users + addresses
    // -----------------------------
    const affUserIds = Array.from(
      new Set(
        (affRaw || [])
          .map((o) => o.userId)
          .filter(Boolean)
          .map(toId)
          .filter(isValidId)
      )
    );

    const affAddressIds = Array.from(
      new Set(
        (affRaw || [])
          .map((o) => o.addressId)
          .filter(Boolean)
          .map(toId)
          .filter(isValidId)
      )
    );

    const [affUsers, affAddresses] = await Promise.all([
      affUserIds.length
        ? AffordableCustomer.find({ _id: { $in: affUserIds } })
            .select("firstName lastName name fullName email phone")
            .lean()
        : [],
      affAddressIds.length
        ? AffordableAddress.find({ _id: { $in: affAddressIds } }).lean()
        : [],
    ]);

    const affUserMap = new Map(affUsers.map((u) => [toId(u._id), u]));
    const affAddrMap = new Map(affAddresses.map((a) => [toId(a._id), a]));

    // -----------------------------
    // ✅ Batch fetch Luxury customers
    // -----------------------------
    const luxCustomerIds = Array.from(
      new Set(
        (luxRaw || [])
          .map((o) => o.customerId)
          .filter(Boolean)
          .map(toId)
          .filter(isValidId)
      )
    );

    const luxCustomers = luxCustomerIds.length
      ? await LuxuryCustomer.find({ _id: { $in: luxCustomerIds } })
          .select("firstName lastName name fullName email phone")
          .lean()
      : [];

    const luxUserMap = new Map(luxCustomers.map((u) => [toId(u._id), u]));

    // -----------------------------
    // ✅ Enrich Affordable Orders
    // -----------------------------
    const aff = (affRaw || []).map((o) => {
      const user = affUserMap.get(toId(o.userId));
      const addr = affAddrMap.get(toId(o.addressId));

      return {
        ...o,

        website: "affordable",
        websiteLabel: "Affordable",

        userDetails: user
          ? {
              _id: user._id,
              name: safeName(user),
              email: user.email,
              phone: user.phone,
            }
          : null,

        addressDetails: addr || null,

        payment: normalizePayment(o),
      };
    });

    // -----------------------------
    // ✅ Enrich Midrange Orders (safe mode)
    // If you have a midrange customer model, you can enrich similarly
    // -----------------------------
    const mid = (midRaw || []).map((o) => {
      return {
        ...o,

        // normalize website
        website: "midrange",
        websiteLabel: "Mid Range",

        // if midrange has addressSnapshot, give it in addressDetails
        addressDetails: o.addressSnapshot ? addressFromMidSnapshot(o.addressSnapshot) : o.addressDetails || null,

        payment: normalizePayment(o),
      };
    });

    // -----------------------------
    // ✅ Enrich Luxury Orders
    // Luxury has shippingAddress embedded, so give addressDetails from it
    // -----------------------------
    const lux = (luxRaw || []).map((o) => {
      const user = luxUserMap.get(toId(o.customerId));
      const addr = addressFromLuxuryShipping(o.shippingAddress);

      return {
        ...o,

        website: "luxury",
        websiteLabel: "Luxury",

        userDetails: user
          ? {
              _id: user._id,
              name: safeName(user),
              email: user.email,
              phone: user.phone,
            }
          : null,

        addressDetails: addr,

        payment: normalizePayment(o),
      };
    });

    // -----------------------------
    // ✅ Merge + sort
    // -----------------------------
    const withLabel = [...aff, ...mid, ...lux].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    return res.json(withLabel);
  } catch (err) {
    console.error("AllOrders getAllOrders error:", err);
    return res.status(500).json({ message: "Failed to fetch all orders" });
  }
};