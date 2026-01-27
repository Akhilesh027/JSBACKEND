const mongoose = require("mongoose");

const ManufacturerSchema = new mongoose.Schema(
  {
    // Step 1: Company Information
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    legalName: {
      type: String,
      required: true,
      trim: true,
    },
    companyType: {
      type: String,
      required: true,
      enum: ["Proprietorship", "Partnership", "Private Limited", "Public Limited", "LLP", "Other"],
    },
    telephone: {
      type: String,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    
    // Step 2: Business Details
    businessNature: {
      type: String,
      required: true,
      enum: ["Manufacturer", "Trading", "Service Provider", "Distributor", "Wholesaler", "Retailer", "Exporter", "Importer", "Other"],
    },
    yearEstablished: {
      type: Number,
      required: true,
      min: 1900,
      max: new Date().getFullYear(),
    },
    companyRelation: {
      type: String,
      enum: ["Direct Vendor", "Sub-contractor", "Service Provider", "Consultant", "Other", ""],
      default: "",
    },
    fullTimeEmployees: {
      type: Number,
      min: 0,
      default: 0,
    },
    panNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Please enter a valid PAN number"],
    },
    gstNumber: {
      type: String,
      uppercase: true,
      trim: true,
      sparse: true,
    },
    
    // Step 3: Business Operations
    itemsInterested: {
      type: String,
      required: true,
      trim: true,
    },
    legalDisputes: {
      type: String,
      trim: true,
      default: "",
    },
    countriesExported: {
      type: String,
      trim: true,
      default: "",
    },
    moreDescription: {
      type: String,
      trim: true,
      default: "",
    },
    
    // Step 4: Account Security
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    confirmPassword: {
      type: String,
     
    },
    role:{
      type: String,

      default:"manufacturer"
    },
    // Additional Fields
    verificationStatus: {
      type: String,
      enum: ["Pending", "Under Review", "Verified", "Rejected"],
      default: "Pending",
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    lastLogin: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    
    // Statistics (will be updated by the system)
    totalOrders: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    activeProducts: {
      type: Number,
      default: 0,
      min: 0,
    },
    factoriesLinked: {
      type: Number,
      default: 0,
      min: 0,
    },
    
    // File Uploads
    documents: [{
      fileName: String,
      filePath: String,
      fileType: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
      verified: {
        type: Boolean,
        default: false,
      },
    }],
    
    // Profile Completion
    profileCompletion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
   
    // Terms Acceptance
    termsAccepted: {
      type: Boolean,
      default: false,
      required: true,
    },
    termsAcceptedAt: {
      type: Date,
    },
    
    // Audit Trail
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updateHistory: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed,
      updatedAt: {
        type: Date,
        default: Date.now,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
ManufacturerSchema.index({ email: 1 }, { unique: true });
ManufacturerSchema.index({ panNumber: 1 });
ManufacturerSchema.index({ gstNumber: 1 });
ManufacturerSchema.index({ verificationStatus: 1 });
ManufacturerSchema.index({ companyType: 1 });
ManufacturerSchema.index({ businessNature: 1 });
ManufacturerSchema.index({ city: 1, country: 1 });

// Virtual for full address
ManufacturerSchema.virtual("fullAddress").get(function() {
  return `${this.city}, ${this.country}`;
});

// Virtual for years in business
ManufacturerSchema.virtual("yearsInBusiness").get(function() {
  if (!this.yearEstablished) return 0;
  const currentYear = new Date().getFullYear();
  return currentYear - this.yearEstablished;
});

// Virtual for verification badge
ManufacturerSchema.virtual("verificationBadge").get(function() {
  switch (this.verificationStatus) {
    case "Verified":
      return { label: "Verified", color: "green" };
    case "Under Review":
      return { label: "Under Review", color: "yellow" };
    case "Rejected":
      return { label: "Rejected", color: "red" };
    default:
      return { label: "Pending", color: "gray" };
  }
});

// Pre-save middleware to calculate profile completion
ManufacturerSchema.pre("save", function(next) {
  const requiredFields = [
    "companyName",
    "legalName",
    "companyType",
    "mobile",
    "email",
    "country",
    "city",
    "businessNature",
    "yearEstablished",
    "panNumber",
    "itemsInterested",
    "password",
  ];

  const optionalFields = [
    "telephone",
    "companyRelation",
    "fullTimeEmployees",
    "gstNumber",
    "legalDisputes",
    "countriesExported",
    "moreDescription",
  ];

  let completedCount = 0;
  let totalCount = requiredFields.length + optionalFields.length;

  // Check required fields
  requiredFields.forEach(field => {
    if (this[field] && this[field].toString().trim() !== "") {
      completedCount += 1;
    }
  });

  // Check optional fields
  optionalFields.forEach(field => {
    if (this[field] && this[field].toString().trim() !== "") {
      completedCount += 1;
    }
  });

  // Calculate percentage
  this.profileCompletion = Math.round((completedCount / totalCount) * 100);

  // Set termsAcceptedAt if termsAccepted is true
  if (this.isModified("termsAccepted") && this.termsAccepted) {
    this.termsAcceptedAt = new Date();
  }

  // Remove confirmPassword before saving (only store in memory, not in DB)
  if (this.isModified("confirmPassword")) {
    this.confirmPassword = undefined;
  }

  next();
});

// Method to compare password
ManufacturerSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to get public profile (without sensitive data)
ManufacturerSchema.methods.toPublicJSON = function() {
  const obj = this.toObject();
  
  // Remove sensitive fields
  delete obj.password;
  delete obj.confirmPassword;
  delete obj.updateHistory;
  delete obj.lastUpdatedBy;
  
  // Remove internal fields
  delete obj.__v;
  
  return obj;
};

// Static method to find by email
ManufacturerSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find by PAN
ManufacturerSchema.statics.findByPAN = function(panNumber) {
  return this.findOne({ panNumber: panNumber.toUpperCase() });
};

// Static method to find by GST
ManufacturerSchema.statics.findByGST = function(gstNumber) {
  return this.findOne({ gstNumber: gstNumber.toUpperCase() });
};

// Static method to get statistics
ManufacturerSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalManufacturers: { $sum: 1 },
        verifiedManufacturers: {
          $sum: { $cond: [{ $eq: ["$verificationStatus", "Verified"] }, 1, 0] },
        },
        pendingManufacturers: {
          $sum: { $cond: [{ $eq: ["$verificationStatus", "Pending"] }, 1, 0] },
        },
        activeManufacturers: {
          $sum: { $cond: [{ $eq: ["$isActive", true] }, 1, 0] },
        },
        avgProfileCompletion: { $avg: "$profileCompletion" },
        totalRevenue: { $sum: "$totalRevenue" },
        totalOrders: { $sum: "$totalOrders" },
        totalProducts: { $sum: "$activeProducts" },
        totalFactories: { $sum: "$factoriesLinked" },
      },
    },
  ]);

  return stats[0] || {
    totalManufacturers: 0,
    verifiedManufacturers: 0,
    pendingManufacturers: 0,
    activeManufacturers: 0,
    avgProfileCompletion: 0,
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalFactories: 0,
  };
};

module.exports = mongoose.model("Manufacturer", ManufacturerSchema);