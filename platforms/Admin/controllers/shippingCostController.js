// controllers/shippingCostController.js
const ShippingCost = require("../models/ShippingCost.js");

const ALLOWED_WEBSITES = ["all", "affordable", "midrange", "luxury"];

function normalizeCity(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeWebsite(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePincode(value) {
  return String(value || "").trim();
}

function validateWebsite(website) {
  return ALLOWED_WEBSITES.includes(website);
}

/**
 * ADMIN: Get all shipping rules
 * GET /api/admin/shipping-costs
 */
exports.getShippingCosts = async (req, res) => {
  try {
    const { website, city, pincode, isActive } = req.query;

    const query = {};

    if (website && website !== "all-filter") {
      query.website = normalizeWebsite(website);
    }

    if (city) {
      query.city = normalizeCity(city);
    }

    if (typeof pincode === "string") {
      query.pincode = normalizePincode(pincode);
    }

    if (typeof isActive !== "undefined") {
      query.isActive = String(isActive) === "true";
    }

    const items = await ShippingCost.find(query).sort({
      city: 1,
      website: 1,
      pincode: 1,
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error("getShippingCosts error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipping costs",
    });
  }
};

/**
 * ADMIN: Create shipping rule
 * POST /api/admin/shipping-costs
 */
exports.createShippingCost = async (req, res) => {
  try {
    let { website, city, pincode, amount, isActive } = req.body;

    website = normalizeWebsite(website || "all");
    city = normalizeCity(city);
    pincode = normalizePincode(pincode);
    amount = Number(amount);

    if (!validateWebsite(website)) {
      return res.status(400).json({
        success: false,
        message: "Invalid website value",
      });
    }

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "City is required",
      });
    }

    if (pincode && !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: "Pincode must be 6 digits",
      });
    }

    if (Number.isNaN(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number greater than or equal to 0",
      });
    }

    // prevent duplicates for same website + city + pincode
    const existing = await ShippingCost.findOne({
      website,
      city,
      pincode: pincode || "",
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Shipping rule already exists for this website, city, and pincode",
      });
    }

    const item = await ShippingCost.create({
      website,
      city,
      pincode: pincode || "",
      amount,
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    return res.status(201).json({
      success: true,
      message: "Shipping rule created successfully",
      data: item,
    });
  } catch (error) {
    console.error("createShippingCost error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create shipping rule",
    });
  }
};

/**
 * ADMIN: Update shipping rule
 * PUT /api/admin/shipping-costs/:id
 */
exports.updateShippingCost = async (req, res) => {
  try {
    const { id } = req.params;
    let { website, city, pincode, amount, isActive } = req.body;

    website = normalizeWebsite(website || "all");
    city = normalizeCity(city);
    pincode = normalizePincode(pincode);
    amount = Number(amount);

    if (!validateWebsite(website)) {
      return res.status(400).json({
        success: false,
        message: "Invalid website value",
      });
    }

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "City is required",
      });
    }

    if (pincode && !/^\d{6}$/.test(pincode)) {
      return res.status(400).json({
        success: false,
        message: "Pincode must be 6 digits",
      });
    }

    if (Number.isNaN(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number greater than or equal to 0",
      });
    }

    const existing = await ShippingCost.findOne({
      _id: { $ne: id },
      website,
      city,
      pincode: pincode || "",
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Another shipping rule already exists for this website, city, and pincode",
      });
    }

    const updated = await ShippingCost.findByIdAndUpdate(
      id,
      {
        website,
        city,
        pincode: pincode || "",
        amount,
        isActive: !!isActive,
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Shipping rule not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Shipping rule updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("updateShippingCost error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update shipping rule",
    });
  }
};

/**
 * ADMIN: Delete shipping rule
 * DELETE /api/admin/shipping-costs/:id
 */
exports.deleteShippingCost = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await ShippingCost.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Shipping rule not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Shipping rule deleted successfully",
    });
  } catch (error) {
    console.error("deleteShippingCost error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete shipping rule",
    });
  }
};

/**
 * USER: Lookup shipping by location
 * GET /api/shipping-costs/by-location?website=affordable&city=hyderabad&pincode=500072
 */
exports.getShippingCostByLocation = async (req, res) => {
  try {
    let { website, city, pincode } = req.query;

    website = normalizeWebsite(website);
    city = normalizeCity(city);
    pincode = normalizePincode(pincode);

    if (!validateWebsite(website) || website === "all") {
      return res.status(400).json({
        success: false,
        message: "A specific website is required for lookup",
      });
    }

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "City is required",
      });
    }

    const tryQueries = [];

    if (pincode) {
      tryQueries.push({ website, city, pincode, isActive: true });
      tryQueries.push({ website: "all", city, pincode, isActive: true });
    }

    tryQueries.push({ website, city, pincode: "", isActive: true });
    tryQueries.push({ website: "all", city, pincode: "", isActive: true });

    let matched = null;

    for (const q of tryQueries) {
      matched = await ShippingCost.findOne(q).sort({ updatedAt: -1, createdAt: -1 });
      if (matched) break;
    }

    if (!matched) {
      return res.status(200).json({
        success: true,
        message: "No matching shipping rule found",
        data: null,
        appliedRule: null,
      });
    }

    let appliedRule = "city_default";

    if (matched.website === website && matched.pincode === pincode && pincode) {
      appliedRule = "website_city_pincode";
    } else if (matched.website === "all" && matched.pincode === pincode && pincode) {
      appliedRule = "all_city_pincode";
    } else if (matched.website === website && !matched.pincode) {
      appliedRule = "website_city";
    } else if (matched.website === "all" && !matched.pincode) {
      appliedRule = "all_city";
    }

    return res.status(200).json({
      success: true,
      message: "Shipping cost fetched successfully",
      data: matched,
      appliedRule,
    });
  } catch (error) {
    console.error("getShippingCostByLocation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipping cost",
    });
  }
};
