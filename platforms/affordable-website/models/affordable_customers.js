const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const CustomerSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  
  // Platform Information
  platform: {
    type: String,
    enum: ['affordable', 'midrange', 'luxury'],
    default: 'affordable'
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
    enum: ['customer', 'admin'],
    default: 'customer'
  },
  
  // Profile Information (optional)
  phone: String,
 addresses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "AffordableAddress", // ✅ your address model name
  }],
  defaultAddress: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AffordableAddress",
    default: null,
  },

  avatar: {
    type: String,
    default: 'https://via.placeholder.com/150'
  },
  
  // Order History
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AffordableOrder'
  }],
  totalOrders: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  
  // Account Activity
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
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

// Virtual for full name
CustomerSchema.virtual('fullName').get(function() {
  return this.name;
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

module.exports = mongoose.model('affordable_customers', CustomerSchema);