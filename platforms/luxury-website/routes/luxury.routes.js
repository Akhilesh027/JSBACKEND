const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { luxuryAuthMiddleware, vipMiddleware, platinumMiddleware } = require('../middleware/authMiddleware.js');
const { getApprovedLuxuryProducts, getApprovedLuxuryProductById } = require("../controllers/luxuryProducts.controller");
const { getCart, updateCart, mergeCart } = require("../controllers/luxuryCart.controller.js");
const {
  getAddresses,
  addAddress,
  updateAddress,
  setDefaultAddress,
} = require("../controllers/luxuryAddress.controller");
const wishlist = require("../controllers/luxury_wishlist.controller.js");

const { placeOrder, getMyOrders, getOrderById } = require("../controllers/luxuryOrders.controller");

router.post('/api/luxury/signup', authController.signup);
router.post('/api/luxury/login', authController.login);
router.post('/api/luxury/logout', authController.logout);
router.post("/api/luxury/forgot", authController.forgotPassword);
router.post("/api/luxury/reset", authController.resetPassword);
router.get('/api/luxury/profile', luxuryAuthMiddleware, authController.getProfile);
router.put('/api/luxury/profile', luxuryAuthMiddleware, authController.updateProfile);

// VIP Routes (require VIP status)
router.put('/api/luxury/upgrade-vip', luxuryAuthMiddleware, authController.upgradeVipTier);
router.post('/api/luxury/concierge-request', luxuryAuthMiddleware, vipMiddleware, authController.requestConcierge);

// Exclusive Routes (require Platinum/Diamond)
router.get('/api/luxury/exclusive-collections', luxuryAuthMiddleware, platinumMiddleware, (req, res) => {
  res.json({
    success: true,
    message: 'Access granted to exclusive collections',
    collections: [
      { id: 1, name: 'Diamond Collection', description: 'Ultra-luxury limited pieces' },
      { id: 2, name: 'Heritage Collection', description: 'Antique and vintage masterpieces' },
      { id: 3, name: 'Custom Design Studio', description: 'Bespoke furniture design service' }
    ]
  });
});

// ✅ Public (or keep protected if you want)
router.get("/api/luxury/products", getApprovedLuxuryProducts);
router.get("/api/luxury/products/:id", getApprovedLuxuryProductById);

router.get("/api/luxury/cart", luxuryAuthMiddleware, getCart);
router.put("/api/luxury/cart", luxuryAuthMiddleware, updateCart);
router.post("/api/luxury/cart/merge", luxuryAuthMiddleware, mergeCart);
router.get("/api/luxury/addresses", luxuryAuthMiddleware, getAddresses);
router.post("/api/luxury/addresses", luxuryAuthMiddleware, addAddress);
router.put("/api/luxury/addresses/:addressId", luxuryAuthMiddleware, updateAddress);
router.put("/api/luxury/addresses/:addressId/default", luxuryAuthMiddleware, setDefaultAddress);
router.post("/api/luxury/orders", luxuryAuthMiddleware, placeOrder);
router.get("/api/luxury/orders", luxuryAuthMiddleware, getMyOrders);
router.get("/api/luxury/orders/my", luxuryAuthMiddleware, getMyOrders);
router.get("/api/luxury/orders/:orderId", luxuryAuthMiddleware, getOrderById);

router.get("/api/luxury/wishlist", luxuryAuthMiddleware, wishlist.getWishlist);
router.post("/api/luxury/wishlist", luxuryAuthMiddleware, wishlist.addToWishlist);
router.delete("/api/luxury/wishlist/:productId", luxuryAuthMiddleware, wishlist.removeFromWishlist);


module.exports = router;