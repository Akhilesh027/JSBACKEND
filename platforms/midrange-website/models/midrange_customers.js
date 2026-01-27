const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const CustomerSchema = new mongoose.Schema({
  // Basic Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8
  },
  
  // Platform Information
  platform: {
    type: String,
    enum: ['affordable', 'midrange', 'luxury'],
    default: 'midrange'
  },
  
  // Account Status
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    enum: ['customer', 'vip', 'admin'],
    default: 'customer'
  },
  membershipLevel: {
    type: String,
    enum: ['standard', 'premium', 'elite'],
    default: 'standard'
  },
  
  // Profile Information
  avatar: {
    type: String,
    default: 'https://via.placeholder.com/150'
  },
  address: {
    shipping: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    },
    billing: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    }
  },
  
  // Preferences
  preferences: {
    newsletter: {
      type: Boolean,
      default: true
    },
    marketingEmails: {
      type: Boolean,
      default: true
    },
    productUpdates: {
      type: Boolean,
      default: true
    }
  },
  
  // Order History
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MidrangeOrder'
  }],
  totalOrders: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  lastOrderDate: Date,
  
  // Loyalty Points
  loyaltyPoints: {
    type: Number,
    default: 0
  },
  rewards: [{
    name: String,
    points: Number,
    redeemed: Boolean,
    redeemedAt: Date
  }],
  
  // Account Security
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Hash password before saving
CustomerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Update updatedAt timestamp
CustomerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Compare password method
CustomerSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual for membership badge
CustomerSchema.virtual('membershipBadge').get(function() {
  const badges = {
    standard: 'Standard',
    premium: 'Premium',
    elite: 'Elite'
  };
  return badges[this.membershipLevel] || 'Standard';
});

// Check if account is locked
CustomerSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
CustomerSchema.methods.incLoginAttempts = function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.update({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + (2 * 60 * 60 * 1000) }; // 2 hours
  }
  
  return this.update(updates);
};

// Reset login attempts on successful login
CustomerSchema.methods.resetLoginAttempts = function() {
  return this.update({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

// Add loyalty points
CustomerSchema.methods.addLoyaltyPoints = function(points, reason) {
  this.loyaltyPoints += points;
  this.rewards.push({
    name: reason,
    points: points,
    redeemed: false
  });
  return this.save();
};

// Check password strength
CustomerSchema.statics.checkPasswordStrength = function(password) {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  return strength;
};

module.exports = mongoose.model('midrange_customers', CustomerSchema, 'midrange_customers');