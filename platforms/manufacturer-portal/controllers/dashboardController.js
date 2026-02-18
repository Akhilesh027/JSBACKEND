const Manufacturer = require("../models/Manufacturer");
const Product = require("../models/Product");
const Factory = require("../models/Factory");
const Order = require("../models/Order"); // ✅ add your Order model path
const mongoose = require("mongoose");

// helper
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * ✅ IMPORTANT (choose the correct one for your project):
 * ------------------------------------------------------
 * In your Order documents, how do you store manufacturer reference?
 *
 * OPTION A (recommended):
 *   order.manufacturer = ObjectId(Manufacturer)
 *
 * OPTION B (common):
 *   order.items[].manufacturer = ObjectId(Manufacturer)
 *   OR order.items[].product -> product has manufacturer
 *
 * Below code supports BOTH with a small fallback.
 */

// ==========================
//  SIMPLE DASHBOARD (UPDATED + RECENT ORDERS)
// ==========================
exports.getDashboardStats = async (req, res) => {
  try {
    const { userId } = req.params; // Manufacturer _id

    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid manufacturer ID" });
    }

    const manufacturer = await Manufacturer.findById(userId).select(
      "companyName email contact location profileCompletion totalCatalogues newOrders factoriesLinked"
    );

    if (!manufacturer) {
      return res.status(404).json({ success: false, message: "Manufacturer not found" });
    }

    // Profile completion (dynamic fallback)
    const profileFields = {
      companyName: manufacturer.companyName,
      email: manufacturer.email,
      contact: manufacturer.contact,
      location: manufacturer.location,
    };

    const completedFields = Object.values(profileFields).filter(
      (v) => v && v.toString().trim().length > 0
    ).length;

    const computedProfileCompletion = Math.round(
      (completedFields / Object.keys(profileFields).length) * 100
    );

    // ✅ DB counts + recentProducts + recentOrders
    const [
      totalCatalogues,
      activeProducts,
      factoriesLinked,
      activeFactories,
      recentProducts,
      recentOrdersPayload,
    ] = await Promise.all([
      Product.countDocuments({ manufacturer: userId }),
      Product.countDocuments({
        manufacturer: userId,
        availability: "In Stock",
        status: "approved",
      }),
      Factory.countDocuments({ manufacturer: userId }),
      Factory.countDocuments({ manufacturer: userId, status: "active" }),
      Product.find({ manufacturer: userId })
        .select("name price availability status image createdAt updatedAt")
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean(),

      // ✅ RECENT ORDERS (tries manufacturer direct field first)
      // If your Order schema doesn't have manufacturer field, fallback is handled below.
      Order.find({ manufacturer: userId })
        .select("orderNumber status totalAmount createdAt updatedAt items")
        .sort({ createdAt: -1 })
        .limit(5)
        .populate({ path: "items.product", select: "name image price" })
        .lean()
        .catch(() => []), // if no "manufacturer" field exists, don't crash
    ]);

    // ✅ If recentOrdersPayload came back empty because Order has no manufacturer field,
    // fallback: fetch recent orders via products->manufacturer (works when order stores product ids)
    let recentOrders = recentOrdersPayload;

    if (!recentOrders || recentOrders.length === 0) {
      // Find latest orders that contain products belonging to this manufacturer
      // NOTE: This assumes order.items.product exists and is an ObjectId ref to Product
      recentOrders = await Order.find({ "items.product": { $exists: true } })
        .select("orderNumber status totalAmount createdAt updatedAt items")
        .sort({ createdAt: -1 })
        .limit(15) // take more and filter down
        .populate({ path: "items.product", select: "name image price manufacturer" })
        .lean();

      // filter orders that contain at least one item whose product.manufacturer == userId
      const mId = String(userId);
      recentOrders = recentOrders
        .filter((o) =>
          (o.items || []).some((it) => String(it?.product?.manufacturer) === mId)
        )
        .slice(0, 5);
    }

    // ✅ newOrders: if you have real Order data, compute it (example: pending count)
    // If you want "new orders today", change filter by date range
    const newOrders =
      typeof manufacturer.newOrders === "number"
        ? Number(manufacturer.newOrders)
        : Array.isArray(recentOrders)
        ? recentOrders.filter((o) => String(o.status).toLowerCase() === "pending").length
        : 0;

    const profileCompletion = Number(
      manufacturer.profileCompletion ?? computedProfileCompletion ?? 0
    );

    // ✅ Map orders into a clean frontend-friendly shape
    const recentOrdersClean = (recentOrders || []).map((o) => {
      const firstItem = (o.items || [])[0];
      const productName = firstItem?.product?.name || firstItem?.name || "Product";
      const productImage = firstItem?.product?.image || firstItem?.image;

      return {
        _id: o._id,
        orderNumber: o.orderNumber || o._id,
        status: o.status || "pending",
        totalAmount: Number(o.totalAmount || 0),
        product: {
          name: productName,
          image: productImage,
        },
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    });

    const dashboardStats = {
      totalCatalogues: Number(manufacturer.totalCatalogues || totalCatalogues || 0),
      newOrders,
      factoriesLinked: Number(manufacturer.factoriesLinked || factoriesLinked || 0),

      activeProducts,
      activeFactories,

      profileCompletion,
      profileStatus: profileCompletion >= 80 ? "Completed" : "Incomplete",

      recentProducts,
      recentOrders: recentOrdersClean, // ✅ added
    };

    return res.status(200).json({ success: true, data: dashboardStats });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ==========================
//  DETAILED DASHBOARD (UPDATED + RECENT ORDERS)
// ==========================
exports.getDetailedDashboard = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid manufacturer ID" });
    }

    const manufacturer = await Manufacturer.findById(userId).select(
      "companyName email contact location isVerified status createdAt profileCompletion"
    );

    if (!manufacturer) {
      return res.status(404).json({ success: false, message: "Manufacturer not found" });
    }

    const [
      totalProducts,
      activeProducts,
      approvedProducts,
      totalFactories,
      activeFactories,
      recentProducts,
      recentOrdersPayload,
    ] = await Promise.all([
      Product.countDocuments({ manufacturer: userId }),
      Product.countDocuments({
        manufacturer: userId,
        availability: "In Stock",
        status: "approved",
      }),
      Product.countDocuments({ manufacturer: userId, status: "approved" }),
      Factory.countDocuments({ manufacturer: userId }),
      Factory.countDocuments({ manufacturer: userId, status: "active" }),
      Product.find({ manufacturer: userId })
        .select("name price availability status image createdAt updatedAt")
        .sort({ updatedAt: -1 })
        .limit(8)
        .lean(),

      // recent orders (direct manufacturer field attempt)
      Order.find({ manufacturer: userId })
        .select("orderNumber status totalAmount createdAt updatedAt items")
        .sort({ createdAt: -1 })
        .limit(10)
        .populate({ path: "items.product", select: "name image price" })
        .lean()
        .catch(() => []),
    ]);

    let recentOrders = recentOrdersPayload;

    if (!recentOrders || recentOrders.length === 0) {
      // fallback via populated products
      recentOrders = await Order.find({ "items.product": { $exists: true } })
        .select("orderNumber status totalAmount createdAt updatedAt items")
        .sort({ createdAt: -1 })
        .limit(25)
        .populate({ path: "items.product", select: "name image price manufacturer" })
        .lean();

      const mId = String(userId);
      recentOrders = recentOrders
        .filter((o) =>
          (o.items || []).some((it) => String(it?.product?.manufacturer) === mId)
        )
        .slice(0, 10);
    }

    // Profile completion
    const profileFields = {
      companyName: manufacturer.companyName,
      email: manufacturer.email,
      contact: manufacturer.contact,
      location: manufacturer.location,
    };

    const completedFields = Object.values(profileFields).filter(
      (v) => v && v.toString().trim().length > 0
    ).length;

    const computedProfileCompletion = Math.round(
      (completedFields / Object.keys(profileFields).length) * 100
    );

    const profileCompletion = Number(
      manufacturer.profileCompletion ?? computedProfileCompletion ?? 0
    );

    const missingFields = Object.entries(profileFields)
      .filter(([_, v]) => !v || v.toString().trim().length === 0)
      .map(([k]) => k);

    const recentOrdersClean = (recentOrders || []).map((o) => {
      const firstItem = (o.items || [])[0];
      const productName = firstItem?.product?.name || firstItem?.name || "Product";
      const productImage = firstItem?.product?.image || firstItem?.image;

      return {
        _id: o._id,
        orderNumber: o.orderNumber || o._id,
        status: o.status || "pending",
        totalAmount: Number(o.totalAmount || 0),
        product: {
          name: productName,
          image: productImage,
        },
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Dashboard loaded successfully",
      data: {
        manufacturerInfo: {
          id: manufacturer._id,
          companyName: manufacturer.companyName,
          email: manufacturer.email,
          contact: manufacturer.contact,
          location: manufacturer.location,
          isVerified: manufacturer.isVerified,
          status: manufacturer.status,
          joinedDate: manufacturer.createdAt,
        },
        statistics: {
          products: {
            total: totalProducts,
            approved: approvedProducts,
            active: activeProducts,
            inactive: Math.max(0, totalProducts - activeProducts),
          },
          factories: {
            total: totalFactories,
            active: activeFactories,
            inactive: Math.max(0, totalFactories - activeFactories),
          },
        },
        profileStatus: {
          percentage: profileCompletion,
          status: profileCompletion === 100 ? "Completed" : "Incomplete",
          missingFields,
        },
        recentProducts,
        recentOrders: recentOrdersClean, // ✅ added
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
