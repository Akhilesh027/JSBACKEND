// controllers/AllOrdersController.js
const AffordableOrder = require("../../affordable-website/models/AffordableOrder");
const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder");

exports.getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;

    const affQuery = { website: "affordable" };
    const midQuery = { website: "mid_range" };
 

    if (status) {
      affQuery.status = status;
      midQuery.status = status;
  
    }

    const [aff, mid, lux] = await Promise.all([
      AffordableOrder.find(affQuery).sort({ createdAt: -1 }).lean(),
      MidrangeOrder.find(midQuery).sort({ createdAt: -1 }).lean(),
    ]);

    const withLabel = [
      ...aff.map((o) => ({ ...o, websiteLabel: "Affordable" })),
      ...mid.map((o) => ({ ...o, websiteLabel: "Mid Range" })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json(withLabel);
  } catch (err) {
    console.error("AllOrders getAllOrders error:", err);
    return res.status(500).json({ message: "Failed to fetch all orders" });
  }
};
