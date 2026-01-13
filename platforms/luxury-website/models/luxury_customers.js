const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const CustomerSchema = new mongoose.Schema({
  // Personal Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false
  },
  
  // Platform & VIP Information
  platform: {
    type: String,
    enum: ['affordable', 'midrange', 'luxury'],
    default: 'luxury'
  },
  vipTier: {
    type: String,
    enum: ['standard', 'silver', 'gold', 'platinum', 'diamond'],
    default: 'standard'
  },
  vipId: {
    type: String,
    unique: true,
    sparse: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isVip: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Contact Information
  address: {
    primary: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    },
    secondary: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String
    }
  },
  
  // Professional Details (for luxury clients)
  company: String,
  designation: String,
  industry: String,
  
  // Luxury Preferences
  preferences: {
    style: [{
      type: String,
      enum: ['modern', 'classic', 'contemporary', 'minimalist', 'art-deco', 'traditional']
    }],
    materials: [String],
    colors: [String],
    budgetRange: {
      min: Number,
      max: Number
    },
    newsletter: {
      type: Boolean,
      default: true
    },
    exclusiveInvites: {
      type: Boolean,
      default: true
    },
    conciergeAlerts: {
      type: Boolean,
      default: true
    }
  },
  
  // Personal Concierge
  assignedConcierge: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Concierge'
  },
  conciergeNotes: String,
  
  // Purchase History
  purchaseHistory: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'LuxuryProduct' },
    productName: String,
    amount: Number,
    date: Date,
    status: String
  }],
  
  // VIP Benefits
  vipBenefits: {
    freeShipping: { type: Boolean, default: false },
    extendedWarranty: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    privateViewings: { type: Boolean, default: false },
    exclusiveAccess: { type: Boolean, default: false },
    customDesign: { type: Boolean, default: false }
  },
  
  // Financial Information (for high-value clients)
  creditLimit: Number,
  paymentTerms: String,
  
  // Lifestyle & Interests
  interests: [String],
  lifestyleNotes: String,
  
  // Events & Appointments
  appointments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment'
  }],
  
  // Loyalty & Rewards
  loyaltyPoints: {
    type: Number,
    default: 0
  },
  rewardTier: {
    type: String,
    enum: ['member', 'bronze', 'silver', 'gold', 'platinum'],
    default: 'member'
  },
  
  // Account Security
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
  // Privacy & Compliance
  dataConsent: {
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: Date,
    marketingConsent: { type: Boolean, default: false },
    privacyConsent: { type: Boolean, default: false }
  },
  
  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
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

// Virtual for full name
CustomerSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for VIP status badge
CustomerSchema.virtual('vipBadge').get(function() {
  const badges = {
    'standard': 'Standard',
    'silver': 'Silver VIP',
    'gold': 'Gold VIP',
    'platinum': 'Platinum VIP',
    'diamond': 'Diamond VIP'
  };
  return badges[this.vipTier] || 'Standard';
});

// Virtual for total spent
CustomerSchema.virtual('totalSpent').get(function() {
  return this.purchaseHistory.reduce((total, purchase) => total + (purchase.amount || 0), 0);
});

// Virtual for purchase count
CustomerSchema.virtual('purchaseCount').get(function() {
  return this.purchaseHistory.length;
});

// Hash password before saving
CustomerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Generate VIP ID
CustomerSchema.pre('save', async function(next) {
  if (this.isNew && !this.vipId) {
    const prefix = 'LUX';
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    this.vipId = `${prefix}${randomNum}`;
  }
  next();
});

// Compare password method
CustomerSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
CustomerSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to upgrade VIP tier
CustomerSchema.methods.upgradeVipTier = function(newTier) {
  const tiers = ['standard', 'silver', 'gold', 'platinum', 'diamond'];
  const currentIndex = tiers.indexOf(this.vipTier);
  const newIndex = tiers.indexOf(newTier);
  
  if (newIndex > currentIndex) {
    this.vipTier = newTier;
    this.isVip = newTier !== 'standard';
    return true;
  }
  return false;
};

// Method to add loyalty points
CustomerSchema.methods.addLoyaltyPoints = function(points, reason) {
  this.loyaltyPoints += points;
  
  // Auto-upgrade reward tier based on points
  if (this.loyaltyPoints >= 10000) {
    this.rewardTier = 'platinum';
  } else if (this.loyaltyPoints >= 5000) {
    this.rewardTier = 'gold';
  } else if (this.loyaltyPoints >= 2000) {
    this.rewardTier = 'silver';
  } else if (this.loyaltyPoints >= 500) {
    this.rewardTier = 'bronze';
  }
  
  return this.save();
};

// Method to add purchase
CustomerSchema.methods.addPurchase = function(purchaseData) {
  this.purchaseHistory.push({
    ...purchaseData,
    date: new Date()
  });
  
  // Add loyalty points (1 point per 100 spent)
  const points = Math.floor(purchaseData.amount / 100);
  if (points > 0) {
    this.loyaltyPoints += points;
  }
  
  return this.save();
};

// Static method to check email availability
CustomerSchema.statics.isEmailAvailable = async function(email) {
  const customer = await this.findOne({ email: email.toLowerCase() });
  return !customer;
};

module.exports = mongoose.model('luxury_customers', CustomerSchema, 'luxury_customers');