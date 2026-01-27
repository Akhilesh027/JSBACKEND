const express = require("express");
const router = express.Router();

// Import manufacturer portal routes
const manufacturerRoutes = require("../platforms/manufacturer-portal/routes/manufacturerRoutes");
const affordableRoutes = require('../platforms/affordable-website/routes/affordable.routes');
const midrangeRoutes = require('../platforms/midrange-website/routes/midrange.routes');
const luxuryRoutes = require('../platforms/luxury-website/routes/luxury.routes');
const adminRoutes = require('../platforms/Admin/routes/adminCustomers.routes');
const VendorRoutes = require('../platforms/Vendor/routes/vendorRoutes');
// ip rate limit need to add middleware for all routes after completion  
const { vendorLimiter, ecommerceLimiter, adminLimiter  } = require("../shared/middleware/rateLimiter");



router.use("/", manufacturerRoutes);
router.use('/', affordableRoutes);
router.use('/', midrangeRoutes);
router.use('/', luxuryRoutes);
router.use('/', adminRoutes);
router.use('/', VendorRoutes);

module.exports = router;