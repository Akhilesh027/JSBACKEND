const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { luxuryAuthMiddleware, vipMiddleware, platinumMiddleware } = require('../middleware/authMiddleware');

// Public Routes
router.post('/api/luxury/signup', authController.signup);
router.post('/api/luxury/login', authController.login);
router.post('/api/luxury/logout', authController.logout);

// Protected Routes (require authentication)
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

module.exports = router;