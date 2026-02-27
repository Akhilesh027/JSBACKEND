const express = require("express");
const router = express.Router();
const authMiddleware = require("../../../shared/middleware/authMiddleware");

// Import Controllers
const authController = require("../controllers/authController");
const profileController = require("../controllers/profileController");
const dashboardController = require("../controllers/dashboardController");
const productController = require("../controllers/productController");
const factoryController = require("../controllers/factoryController.js");
const upload = require("../../../shared/middleware/upload");
const purchaseOrderController = require("../controllers/purchaseOrderController");

// Auth Routes
router.post("/api/manufacturer/signup", authController.signup);
router.post("/api/manufacturer/login", authController.login);

// Profile Routes
router.get("/api/manufacturer/profile/:userId", authMiddleware, profileController.getProfile);
router.put("/api/manufacturer/profile/:userId", authMiddleware, profileController.updateProfile);
router.put("/api/manufacturer/change-password/:userId", authMiddleware, profileController.changePassword);
router.get("/api/manufacturer/all", authMiddleware, profileController.getAllManufacturers);

// Dashboard Routes
router.get("/api/manufacturer/dashboard/:userId", dashboardController.getDashboardStats);
router.get("/api/manufacturer/dashboard/:userId", dashboardController.getDetailedDashboard);

// Product Routes
router.post("/api/products", authMiddleware, productController.createProduct);
router.get("/api/products", authMiddleware, productController.getAllProducts);
router.get("/api/products/:id", authMiddleware, productController.getProduct);
router.patch("/api/products/:id/inventory", authMiddleware, productController.updateInventory);
router.put("/api/products/:id", authMiddleware, productController.updateProduct);
router.delete("/api/products/:id", authMiddleware, productController.deleteProduct);
router.post(
  "/api/upload",
  authMiddleware,
  upload.single("image"),
  productController.uploadImage
);
router.post(
  "/api/upload/multiple",
  authMiddleware,
  upload.array("images", 5),
  productController.uploadMultipleImages
);
// Factory Routes
router.get("/api/factories", authMiddleware, factoryController.getAllFactories);
router.post("/api/factories", authMiddleware, factoryController.createFactory);
router.put("/api/factories/:id", authMiddleware, factoryController.updateFactory);
router.delete("/api/factories/:id", authMiddleware, factoryController.deleteFactory);
router.get(
  "/api/manufacturer/orders/:manufacturerId",
  authMiddleware,
  purchaseOrderController.getOrdersByManufacturer
);

// ✅ OPTIONAL: manufacturer updates order status (accept/reject/completed)
router.put(
  "/api/manufacturer/orders/:orderId/status",
  authMiddleware,
  purchaseOrderController.updateOrderStatusByManufacturer
);
module.exports = router;