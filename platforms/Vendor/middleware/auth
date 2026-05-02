const jwt = require("jsonwebtoken");
const Vendor = require("../models/Vendor");

exports.protectVendor = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: "Not authorized" });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const vendor = await Vendor.findById(decoded.id).select("-password");
    if (!vendor) return res.status(401).json({ success: false, message: "Vendor not found" });
    req.vendor = vendor;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};