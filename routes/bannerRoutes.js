const express = require("express");
const router = express.Router();
const homeBannerController = require("../platforms/Admin/controllers/homeBannerController");
const upload = require("../shared/middleware/upload");

// Public routes for frontends (Affordable & Mid-range)
router.get("/api/public/banners/:website", homeBannerController.getBannersByWebsite);
router.get("/api/banners/:website", homeBannerController.getBannersByWebsite);
router.get("/public/banners/:website", homeBannerController.getBannersByWebsite);
router.get("/banners/:website", homeBannerController.getBannersByWebsite);

// Admin routes for managing banners
router.get("/api/admin/banners/:website", homeBannerController.getBannersByWebsite);
router.put("/api/admin/banners/:website", homeBannerController.updateBannersByWebsite);
router.get("/admin/banners/:website", homeBannerController.getBannersByWebsite);
router.put("/admin/banners/:website", homeBannerController.updateBannersByWebsite);

// Upload banner image
router.post(
  "/api/admin/banners/upload",
  upload.single("image"),
  homeBannerController.uploadBannerImage
);
router.post(
  "/admin/banners/upload",
  upload.single("image"),
  homeBannerController.uploadBannerImage
);

module.exports = router;
