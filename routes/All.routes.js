const express = require("express");
const router = express.Router();

// Import manufacturer portal routes
const manufacturerRoutes = require("../platforms/manufacturer-portal/routes/manufacturerRoutes");
const affordableRoutes = require('../platforms/affordable-website/routes/affordable.routes');
const midrangeRoutes = require('../platforms/midrange-website/routes/midrange.routes');
const luxuryRoutes = require('../platforms/luxury-website/routes/luxury.routes');

router.use("/", manufacturerRoutes);
router.use('/', affordableRoutes);
router.use('/', midrangeRoutes);
router.use('/', luxuryRoutes);

module.exports = router;