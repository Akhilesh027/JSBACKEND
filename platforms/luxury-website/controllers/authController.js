const Customer = require('../models/luxury_customers.js');
const jwt = require('jsonwebtoken');

// Generate JWT Token for luxury
const generateToken = (id, email, vipTier) => {
  return jwt.sign(
    { 
      id, 
      email, 
      platform: 'luxury',
      vipTier,
      type: 'customer'
    },
    process.env.LUXURY_JWT_SECRET || 'LUXURY_SECRET_789',
    { expiresIn: '30d' } // Longer expiry for luxury clients
  );
};

// Luxury Customer Signup
exports.signup = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      password,
      company,
      designation,
      preferences
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: firstName, lastName, email, phone, password'
      });
    }

    // Password strength validation for luxury clients
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }

    // Check for special characters and numbers
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain uppercase, lowercase, numbers, and special characters'
      });
    }

    // Check if email already exists
    const existingCustomer = await Customer.findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered. Please sign in or use a different email.'
      });
    }

    // Create luxury customer
    const customer = await Customer.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password,
      company: company?.trim(),
      designation: designation?.trim(),
      platform: 'luxury',
      vipTier: 'standard',
      isVip: false,
      isActive: true,
      isVerified: false,
      preferences: preferences || {
        newsletter: true,
        exclusiveInvites: true,
        conciergeAlerts: true
      },
      dataConsent: {
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        marketingConsent: true,
        privacyConsent: true
      },
      lastLogin: new Date()
    });

    // Generate VIP token
    const token = generateToken(customer._id, customer.email, customer.vipTier);

    // Remove sensitive data from response
    const customerData = customer.toObject();
    delete customerData.password;
    delete customerData.loginAttempts;
    delete customerData.lockUntil;

    // Generate welcome message based on company
    const welcomeMessage = company 
      ? `Welcome ${customer.fullName} from ${company}! Your luxury account has been created.`
      : `Welcome ${customer.fullName}! Your luxury account has been created.`;

    res.status(201).json({
      success: true,
      message: welcomeMessage,
      token,
      customer: {
        id: customer._id,
        vipId: customer.vipId,
        fullName: customer.fullName,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        company: customer.company,
        designation: customer.designation,
        platform: customer.platform,
        vipTier: customer.vipTier,
        vipBadge: customer.vipBadge,
        isVip: customer.isVip,
        isVerified: customer.isVerified,
        preferences: customer.preferences,
        loyaltyPoints: customer.loyaltyPoints,
        rewardTier: customer.rewardTier,
        totalSpent: customer.totalSpent,
        purchaseCount: customer.purchaseCount,
        createdAt: customer.createdAt,
        assignedConcierge: customer.assignedConcierge
      }
    });

  } catch (error) {
    console.error('Luxury signup error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Email or VIP ID already registered'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please contact our concierge for assistance.'
    });
  }
};

// Luxury Customer Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find customer with password selected
    const customer = await Customer.findOne({ 
      email: email.toLowerCase().trim(),
      platform: 'luxury'
    }).select('+password');

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your email and password.'
      });
    }

    // Check if account is active
    if (!customer.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact our concierge for assistance.'
      });
    }

    // Check if account is locked
    if (customer.isLocked()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked for security reasons. Please try again in 30 minutes or contact support.'
      });
    }

    // Compare password
    const isMatch = await customer.comparePassword(password);
    
    if (!isMatch) {
      // Increment login attempts
      customer.loginAttempts += 1;
      
      // Lock account after 5 failed attempts
      if (customer.loginAttempts >= 5) {
        customer.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }
      
      await customer.save();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please check your email and password.',
        attemptsLeft: 5 - customer.loginAttempts
      });
    }

    // Reset login attempts on successful login
    customer.loginAttempts = 0;
    customer.lockUntil = undefined;
    customer.lastLogin = new Date();
    
    // Add welcome loyalty points for first login
    if (customer.loyaltyPoints === 0) {
      customer.loyaltyPoints = 500; // Welcome bonus for luxury clients
    }
    
    await customer.save();

    // Generate VIP token
    const token = generateToken(customer._id, customer.email, customer.vipTier);

    // Remove sensitive data
    const customerData = customer.toObject();
    delete customerData.password;
    delete customerData.loginAttempts;
    delete customerData.lockUntil;

    // Welcome back message based on VIP tier
    let welcomeMessage = `Welcome back, ${customer.fullName}!`;
    if (customer.isVip) {
      welcomeMessage = `Welcome back, ${customer.vipBadge}! We're delighted to have you.`;
    }

    res.status(200).json({
      success: true,
      message: welcomeMessage,
      token,
      customer: {
        id: customer._id,
        vipId: customer.vipId,
        fullName: customer.fullName,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        company: customer.company,
        designation: customer.designation,
        platform: customer.platform,
        vipTier: customer.vipTier,
        vipBadge: customer.vipBadge,
        isVip: customer.isVip,
        isVerified: customer.isVerified,
        preferences: customer.preferences,
        loyaltyPoints: customer.loyaltyPoints,
        rewardTier: customer.rewardTier,
        totalSpent: customer.totalSpent,
        purchaseCount: customer.purchaseCount,
        vipBenefits: customer.vipBenefits,
        assignedConcierge: customer.assignedConcierge,
        lastLogin: customer.lastLogin,
        createdAt: customer.createdAt
      }
    });

  } catch (error) {
    console.error('Luxury login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please contact our concierge for assistance.'
    });
  }
};

// Luxury Customer Logout
exports.logout = async (req, res) => {
  try {
    // For luxury clients, we might want to log the logout for security
    res.status(200).json({
      success: true,
      message: 'Logged out successfully. We look forward to serving you again.'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get Luxury Customer Profile
exports.getProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.user.id)
      .select('-password -loginAttempts -lockUntil')
      .populate('assignedConcierge', 'name email phone')
      .populate('appointments', 'date time service status')
      .populate('purchaseHistory.productId', 'name category price images');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      customer,
      conciergeAvailable: !!customer.assignedConcierge
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update Luxury Profile
exports.updateProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      company,
      designation,
      address,
      preferences
    } = req.body;

    const updates = {};
    
    if (firstName) updates.firstName = firstName.trim();
    if (lastName) updates.lastName = lastName.trim();
    if (phone) updates.phone = phone.trim();
    if (company) updates.company = company.trim();
    if (designation) updates.designation = designation.trim();
    
    if (address) {
      updates.address = {
        primary: {
          street: address.primary?.street?.trim() || '',
          city: address.primary?.city?.trim() || '',
          state: address.primary?.state?.trim() || '',
          country: address.primary?.country?.trim() || '',
          zipCode: address.primary?.zipCode?.trim() || ''
        },
        secondary: {
          street: address.secondary?.street?.trim() || '',
          city: address.secondary?.city?.trim() || '',
          state: address.secondary?.state?.trim() || '',
          country: address.secondary?.country?.trim() || '',
          zipCode: address.secondary?.zipCode?.trim() || ''
        }
      };
    }
    
    if (preferences) {
      updates.preferences = {
        ...preferences,
        style: preferences.style || [],
        materials: preferences.materials || [],
        colors: preferences.colors || [],
        budgetRange: preferences.budgetRange || { min: 0, max: 0 }
      };
    }

    updates.updatedBy = req.user.id;
    updates.updatedAt = new Date();

    const customer = await Customer.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password -loginAttempts -lockUntil');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      customer
    });
  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Upgrade VIP Tier (Admin/Concierge only)
exports.upgradeVipTier = async (req, res) => {
  try {
    const { vipTier, notes } = req.body;
    
    if (!['silver', 'gold', 'platinum', 'diamond'].includes(vipTier)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid VIP tier'
      });
    }

    const customer = await Customer.findById(req.user.id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if upgrade is valid
    const currentTier = customer.vipTier;
    const tiers = ['standard', 'silver', 'gold', 'platinum', 'diamond'];
    const currentIndex = tiers.indexOf(currentTier);
    const newIndex = tiers.indexOf(vipTier);
    
    if (newIndex <= currentIndex) {
      return res.status(400).json({
        success: false,
        message: `Cannot downgrade from ${currentTier} to ${vipTier}`
      });
    }

    // Perform upgrade
    customer.vipTier = vipTier;
    customer.isVip = true;
    customer.updatedBy = req.user.id;
    customer.updatedAt = new Date();
    
    // Add concierge notes if provided
    if (notes) {
      customer.conciergeNotes = notes;
    }

    // Update VIP benefits based on new tier
    customer.vipBenefits = {
      freeShipping: vipTier === 'silver' || vipTier === 'gold' || vipTier === 'platinum' || vipTier === 'diamond',
      extendedWarranty: vipTier === 'gold' || vipTier === 'platinum' || vipTier === 'diamond',
      prioritySupport: vipTier === 'gold' || vipTier === 'platinum' || vipTier === 'diamond',
      privateViewings: vipTier === 'platinum' || vipTier === 'diamond',
      exclusiveAccess: vipTier === 'platinum' || vipTier === 'diamond',
      customDesign: vipTier === 'diamond'
    };

    await customer.save();

    // Generate new token with updated VIP tier
    const token = generateToken(customer._id, customer.email, customer.vipTier);

    res.status(200).json({
      success: true,
      message: `VIP tier upgraded to ${vipTier}`,
      token,
      customer: {
        id: customer._id,
        vipId: customer.vipId,
        fullName: customer.fullName,
        vipTier: customer.vipTier,
        vipBadge: customer.vipBadge,
        isVip: customer.isVip,
        vipBenefits: customer.vipBenefits,
        loyaltyPoints: customer.loyaltyPoints
      }
    });
  } catch (error) {
    console.error('Upgrade VIP tier error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Request Concierge Service
exports.requestConcierge = async (req, res) => {
  try {
    const { serviceType, requirements, preferredDate, notes } = req.body;

    if (!serviceType || !requirements) {
      return res.status(400).json({
        success: false,
        message: 'Please provide service type and requirements'
      });
    }

    const customer = await Customer.findById(req.user.id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // For now, just acknowledge the request
    // In production, this would create a concierge request in the database
    
    res.status(200).json({
      success: true,
      message: 'Concierge service request received. Our team will contact you within 24 hours.',
      requestId: `CON-${Date.now()}`,
      estimatedResponse: '24 hours',
      contactPerson: customer.assignedConcierge ? 'Your assigned concierge' : 'Our luxury support team'
    });
  } catch (error) {
    console.error('Concierge request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};