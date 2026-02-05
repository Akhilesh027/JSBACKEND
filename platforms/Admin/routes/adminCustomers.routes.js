const express = require("express");
const router = express.Router();

const {
  getAllCustomers,
  getAffordableCustomers,
  getMidrangeCustomers,
  getLuxuryCustomers,
  getAllCustomersFullDetails,
} = require("../controllers/adminCustomer.controller");

const {
  getAllManufacturers,
  deleteManufacturer,
  setUnderReviewManufacturer,
  rejectManufacturer,
  approveManufacturer,
  getManufacturerById,
  updateManufacturer,
} = require("../controllers/adminManufacturer.controller");
const AllOrdersController = require("../controllers/AllOrdersController");
const adminCatalogController = require("../controllers/adminCatalogController");
const authMiddleware = require("../../../shared/middleware/authMiddleware");
const adminOrderController = require("../controllers/adminOrderController");
const ctrl = require("../controllers/adminManufacturerDashboard.controller");

const AffordableorderController = require("../controllers/AffordableorderController");

// ✅ NEW: Midrange Orders Controller (create this file)
const MidrangeorderController = require("../controllers/midrangeOrdersController");

// --------------------
// Customers
// --------------------
router.get("/api/admin/customers/all", getAllCustomers);
router.get("/api/admin/customers/all-details", getAllCustomersFullDetails);

// (optional endpoints you imported but not used yet)
// router.get("/api/admin/customers/affordable", getAffordableCustomers);
// router.get("/api/admin/customers/midrange", getMidrangeCustomers);
// router.get("/api/admin/customers/luxury", getLuxuryCustomers);

// --------------------
// Manufacturers
// --------------------
router.get("/api/admin/manufacturers/all", getAllManufacturers);
router.patch("/api/admin/manufacturers/:id/approve", approveManufacturer);
router.patch("/api/admin/manufacturers/:id/reject", rejectManufacturer);
router.patch("/api/admin/manufacturers/:id/under-review", setUnderReviewManufacturer);
router.get("/api/admin/manufacturers/:id", getManufacturerById);
router.patch("/api/admin/manufacturers/:id", updateManufacturer);
router.delete("/api/admin/manufacturers/:id", deleteManufacturer);

// --------------------
// Catalogs / Products
// --------------------
router.get("/api/admin/catalogs", adminCatalogController.getAllCatalogs);
router.put("/api/admin/catalogs/:id", adminCatalogController.updateCatalog);
router.patch("/api/admin/catalogs/:id/status", adminCatalogController.updateCatalogStatus);
router.delete("/api/admin/catalogs/:id", adminCatalogController.deleteCatalog);
router.put(
  "/api/admin/products/:productId/forward-website",
  adminCatalogController.forwardProductToWebsite
);

// --------------------
// Admin Orders (manufacturer orders)
// NOTE: you had duplicates. Keep ONE.
router.get("/api/admin/manufacturers", adminOrderController.getManufacturersForOrder);
router.get("/api/admin/manufacturers/:id", adminOrderController.getManufacturerById);
router.post("/api/admin/orders", adminOrderController.createOrder);
router.get("/api/admin/orders", adminOrderController.listOrders);
// router.get("/api/admin/orders", adminOrderController.getAllOrders); // ❌ duplicate route, remove or change path

// --------------------
// Dashboard
// --------------------
router.get("/api/admin/dashboard/manufacturers/summary", ctrl.getManufacturersSummary);
router.get("/api/admin/dashboard/manufacturers/recent", ctrl.getManufacturersRecentActivity);

// --------------------
// ✅ Website Orders - Affordable
// --------------------
router.get("/api/admin/affordable/orders", AffordableorderController.getOrders);
router.patch("/api/admin/affordable/orders/:id/approve", AffordableorderController.approveOrder);
router.patch("/api/admin/affordable/orders/:id/reject", AffordableorderController.rejectOrder);
router.patch("/api/admin/affordable/orders/:id/status", AffordableorderController.updateOrderStatus);

// --------------------
// ✅ Website Orders - Midrange (NEW)
// --------------------
router.get("/api/admin/midrange/orders", MidrangeorderController.getMidrangeOrders);
router.patch("/api/admin/midrange/orders/:id/approve", MidrangeorderController.approveMidrangeOrder);
router.patch("/api/admin/midrange/orders/:id/reject", MidrangeorderController.rejectMidrangeOrder);
router.patch("/api/admin/midrange/orders/:id/status", MidrangeorderController.updateOrderStatus);

// --------------------
// ✅ Website Orders - Luxury (optional later)
// --------------------
 const LuxuryorderController = require("../controllers/adminLuxury.controller");
 router.get("/api/admin/luxury/orders", LuxuryorderController.getLuxuryOrdersAdmin);
 router.patch("/api/admin/luxury/orders/:id/approve", LuxuryorderController.confirmLuxuryOrder);
 router.patch("/api/admin/luxury/orders/:id/reject", LuxuryorderController.cancelLuxuryOrderAdmin);
 router.patch("/api/admin/luxury/orders/:id/status", LuxuryorderController.updateLuxuryOrderStatus);

router.get("/api/admin/orders/all", AllOrdersController.getAllOrders);

// --------------------
// CAP Admin Management
// --------------------
const {
  createAdmin,
  listAdmins,
  deleteAdmin,
  updateAdminRole,
  updateAdminActive,
  loginAdmin,
} = require("../controllers/capAdminController");

router.post("/api/admin/cap/admins", /*protect, isCapAdmin,*/ createAdmin);
router.get("/api/admin/cap/admins", /*protect, isCapAdmin,*/ listAdmins);
router.patch("/api/admin/cap/admins/:id/role", /*protect, isCapAdmin,*/ updateAdminRole);
router.patch("/api/admin/cap/admins/:id/toggle", updateAdminActive);
router.delete("/api/admin/cap/admins/:id", /*protect, isCapAdmin,*/ deleteAdmin);

router.use("/api/admin/auth", loginAdmin);

module.exports = router;
