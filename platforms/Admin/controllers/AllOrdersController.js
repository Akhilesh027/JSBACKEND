// controllers/AllOrdersController.js
const AffordableOrder = require("../../affordable-website/models/AffordableOrder");
const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder");
const LuxuryOrder = require("../../luxury-website/models/luxury_orders"); // ✅ ADD

exports.getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;

    const affQuery = { website: "affordable" };
    const midQuery = { website: "mid_range" };
    const luxQuery = { website: "luxury" }; // ✅ ADD

    if (status) {
      affQuery.status = status;
      midQuery.status = status;
      luxQuery.status = status; // ✅ ADD
    }

    const [aff, mid, lux] = await Promise.all([
      AffordableOrder.find(affQuery).sort({ createdAt: -1 }).lean(),
      MidrangeOrder.find(midQuery).sort({ createdAt: -1 }).lean(),
      LuxuryOrder.find(luxQuery).sort({ createdAt: -1 }).lean(), // ✅ ADD
    ]);

    const withLabel = [
      ...aff.map((o) => ({ ...o, websiteLabel: "Affordable" })),
      ...mid.map((o) => ({ ...o, websiteLabel: "Mid Range" })),
      ...lux.map((o) => ({ ...o, websiteLabel: "Luxury" })), // ✅ ADD
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );

    return res.json(withLabel);
  } catch (err) {
    console.error("AllOrders getAllOrders error:", err);
    return res.status(500).json({ message: "Failed to fetch all orders" });
  }
};
