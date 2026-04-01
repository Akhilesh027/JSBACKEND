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
    // Conditional required: only if authProvider is 'local'
    required: function() {
      return this.authProvider === 'local';
    },
    minlength: 6
  },
  
  // Authentication provider
  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },
  googleId: {
    type: String,
    sparse: true,    // allows multiple null values but still unique if present
    index: true
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
  phone: {
    type: String,
    trim: true,
    // Optional: add index for fast lookup
    index: true,
    // Optional: custom validation if needed (e.g., 10 digits)
    validate: {
      validator: function(v) {
        // allow empty or null, but if present, must be a valid 10-digit number
        if (!v) return true;
        return /^\d{10}$/.test(v.replace(/\D/g, ''));
      },
      message: 'Phone number must be a valid 10-digit number'
    }
  },
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

// Hash password before saving (only if password is modified and authProvider is local)
CustomerSchema.pre('save', async function(next) {
  if (this.authProvider !== 'local') return next();
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

// Compare password method (only works for local accounts)
CustomerSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.authProvider !== 'local') return false;
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