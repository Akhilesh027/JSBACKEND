const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const CustomerSchema = new mongoose.Schema(
  {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      // ✅ better than old 2-3 TLD restriction
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },

    phone: { type: String, trim: true },

    password: { type: String, required: true, minlength: 8, select: false },

    platform: {
      type: String,
      enum: ["affordable", "midrange", "luxury"],
      default: "luxury",
    },

    vipTier: {
      type: String,
      enum: ["standard", "silver", "gold", "platinum", "diamond"],
      default: "standard",
    },

    vipId: { type: String, unique: true, sparse: true },

    isVerified: { type: Boolean, default: false },
    isVip: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },

    addresses: [
      {
        label: { type: String, default: "Home" },
        firstName: String,
        lastName: String,
        email: String,
        phone: String,

        addressLine1: { type: String, required: true },
        addressLine2: { type: String, default: "" },
        city: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: String, required: true },
        country: { type: String, default: "India" },

        isDefault: { type: Boolean, default: false },
      },
    ],

    company: String,
    designation: String,
    industry: String,

    preferences: {
      style: [
        {
          type: String,
          enum: ["modern", "classic", "contemporary", "minimalist", "art-deco", "traditional"],
        },
      ],
      materials: [String],
      colors: [String],
      budgetRange: { min: Number, max: Number },
      newsletter: { type: Boolean, default: true },
      exclusiveInvites: { type: Boolean, default: true },
      conciergeAlerts: { type: Boolean, default: true },
    },

    wishlist: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "LuxuryProduct", required: true },
        name: { type: String, required: true },
        price: { type: Number, default: 0 },
        image: { type: String, default: "" },
        type: { type: String, default: "" },
        addedAt: { type: Date, default: Date.now },
      },
    ],

    assignedConcierge: { type: mongoose.Schema.Types.ObjectId, ref: "Concierge" },
    conciergeNotes: String,

    purchaseHistory: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "LuxuryProduct" },
        productName: String,
        amount: Number,
        date: Date,
        status: String,
      },
    ],

    vipBenefits: {
      freeShipping: { type: Boolean, default: false },
      extendedWarranty: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      privateViewings: { type: Boolean, default: false },
      exclusiveAccess: { type: Boolean, default: false },
      customDesign: { type: Boolean, default: false },
    },

    creditLimit: Number,
    paymentTerms: String,

    interests: [String],
    lifestyleNotes: String,

    loyaltyPoints: { type: Number, default: 0 },
    rewardTier: { type: String, enum: ["member", "bronze", "silver", "gold", "platinum"], default: "member" },

    twoFactorEnabled: { type: Boolean, default: false },
    lastLogin: Date,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,

    dataConsent: {
      termsAccepted: { type: Boolean, default: false },
      termsAcceptedAt: Date,
      marketingConsent: { type: Boolean, default: false },
      privacyConsent: { type: Boolean, default: false },
    },

    // ⚠️ make sure this ref is your ORDER MODEL NAME
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "LuxuryOrder" }],

    totalOrders: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 }, // ✅ keep DB field

    // ✅ self reference should match model name
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "luxury_customers" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "luxury_customers" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ✅ rename to avoid clash with field totalSpent
CustomerSchema.virtual("totalSpentFromHistory").get(function () {
  return (this.purchaseHistory || []).reduce((t, p) => t + (Number(p.amount) || 0), 0);
});

CustomerSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

CustomerSchema.virtual("vipBadge").get(function () {
  const badges = {
    standard: "Standard",
    silver: "Silver VIP",
    gold: "Gold VIP",
    platinum: "Platinum VIP",
    diamond: "Diamond VIP",
  };
  return badges[this.vipTier] || "Standard";
});

CustomerSchema.virtual("purchaseCount").get(function () {
  return (this.purchaseHistory || []).length;
});

CustomerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ✅ unique-safe vipId
CustomerSchema.pre("save", async function (next) {
  if (!this.isNew || this.vipId) return next();

  try {
    const prefix = "LUX";
    let vipId;
    let exists = true;

    while (exists) {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      vipId = `${prefix}${randomNum}`;
      exists = await mongoose.models.luxury_customers.exists({ vipId });
    }

    this.vipId = vipId;
    next();
  } catch (err) {
    next(err);
  }
});

CustomerSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

CustomerSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

CustomerSchema.statics.isEmailAvailable = async function (email) {
  const customer = await this.findOne({ email: email.toLowerCase() });
  return !customer;
};

module.exports = mongoose.model("luxury_customers", CustomerSchema, "luxury_customers");
