const express = require("express");
const { registerVendor, listVendors, loginVendor, getVendorMe } = require("../controllers/vendorController");
const { uploadVendorDoc } = require("../utils/vendorUpload");

const { protectVendor } = require("../middleware/vendorAuth");


const router = express.Router();

router.post("/api/vendor/register", uploadVendorDoc.single("document"), registerVendor);
router.get("/api/vendor", listVendors);
router.post("/api/vendor/login", loginVendor);

router.get("/api/vendor/me", protectVendor, getVendorMe);
module.exports = router;
