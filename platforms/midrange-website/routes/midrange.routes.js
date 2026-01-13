const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const midrangeAuthMiddleware = require('../middleware/authMiddleware');

// Public Routes
router.post('/api/midrange/signup', authController.signup);
router.post('/api/midrange/login', authController.login);
router.post('/api/midrange/logout', authController.logout);

// Protected Routes (require authentication)
router.get('/api/midrange/profile', midrangeAuthMiddleware, authController.getProfile);
router.put('/api/midrange/profile', midrangeAuthMiddleware, authController.updateProfile);
router.put('/api/midrange/change-password', midrangeAuthMiddleware, authController.changePassword);
router.put('/api/midrange/upgrade-membership', midrangeAuthMiddleware, authController.upgradeMembership);

module.exports = router;