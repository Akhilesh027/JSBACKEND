const Product = require("../../manufacturer-portal/models/Product");

// GET /api/admin/catalogs
exports.getAllCatalogs = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("manufacturer", "fullName firstName lastName email company")
      .sort({ createdAt: -1 });

    const catalogs = products.map((p) => {
      const m = p.manufacturer;
      const manufacturerName =
        m?.fullName ||
        `${m?.firstName || ""} ${m?.lastName || ""}`.trim() ||
        m?.company ||
        m?.email ||
        "Unknown";

      return {
        _id: p._id,
        productName: p.name,
        manufacturerName,
        manufacturerId: m?._id,

        category: p.category,
        shortDescription: p.shortDescription || "",
        description: p.description || "",
        price: p.price,
        discount: p.discount || 0,
        gst: p.gst || 0,                     // ✅ ADDED
        isCustomized: p.isCustomized || false, // ✅ ADDED

        deliveryTime: p.deliveryTime || "",
        tier: p.tier || "mid_range",
        status: p.status || "pending",

        image: p.image || "",
        galleryImages: p.galleryImages || [],

        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    res.json({ success: true, catalogs });
  } catch (err) {
    console.error("Admin getAllCatalogs error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch catalogs" });
  }
};exports.updateCatalogStatus = async (req, res) => {
  try {
    const { status, discount, gst, isCustomized } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status (pending | approved | rejected)",
      });
    }

    if (discount !== undefined && (typeof discount !== 'number' || discount < 0 || discount > 100)) {
      return res.status(400).json({
        success: false,
        message: "Discount must be a number between 0 and 100",
      });
    }

    if (gst !== undefined && (typeof gst !== 'number' || gst < 0 || gst > 100)) {
      return res.status(400).json({
        success: false,
        message: "GST must be a number between 0 and 100",
      });
    }

    if (isCustomized !== undefined && typeof isCustomized !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "isCustomized must be a boolean",
      });
    }

    const updateData = { status };
    if (discount !== undefined && status === "approved") {
      updateData.discount = discount;
    }
    if (gst !== undefined) {
      updateData.gst = gst;
    }
    if (isCustomized !== undefined) {
      updateData.isCustomized = isCustomized;
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("manufacturer", "fullName firstName lastName email company");

    if (!product) {
      return res.status(404).json({ success: false, message: "Catalog not found" });
    }

    const m = product.manufacturer;
    const manufacturerName =
      m?.fullName ||
      `${m?.firstName || ""} ${m?.lastName || ""}`.trim() ||
      m?.company ||
      m?.email ||
      "Unknown";

    res.json({
      success: true,
      message: "Status updated",
      catalog: {
        _id: product._id,
        productName: product.name,
        manufacturerName,
        manufacturerId: m?._id,
        category: product.category,
        shortDescription: product.shortDescription || "",
        description: product.description || "",
        price: product.price,
        discount: product.discount || 0,
        gst: product.gst || 0,
        isCustomized: product.isCustomized || false,
        deliveryTime: product.deliveryTime || "",
        tier: product.tier || "mid_range",
        status: product.status,
        image: product.image || "",
        galleryImages: product.galleryImages || [],
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
    });
  } catch (err) {
    console.error("Admin updateCatalogStatus error:", err);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
};
// PUT /api/admin/catalogs/:id
exports.updateCatalog = async (req, res) => {
  try {
    const {
      productName,
      category,
      price,
      shortDescription,
      description,
      tier,
      deliveryTime,
      discount,
      gst,               // ✅ ADDED
      isCustomized,      // ✅ ADDED
    } = req.body;

    // Required fields
    if (!productName || !category || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "productName, category, and price are required",
      });
    }

    if (Number(price) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be greater than 0",
      });
    }

    if (tier && !["affordable", "mid_range", "luxury"].includes(tier)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tier (affordable | mid_range | luxury)",
      });
    }

    // Validate discount if provided
    if (discount !== undefined && (typeof discount !== 'number' || discount < 0 || discount > 100)) {
      return res.status(400).json({
        success: false,
        message: "Discount must be a number between 0 and 100",
      });
    }

    // ✅ Validate GST if provided
    if (gst !== undefined && (typeof gst !== 'number' || gst < 0 || gst > 100)) {
      return res.status(400).json({
        success: false,
        message: "GST must be a number between 0 and 100",
      });
    }

    // ✅ Validate isCustomized if provided
    if (isCustomized !== undefined && typeof isCustomized !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "isCustomized must be a boolean",
      });
    }

    const updateData = {
      name: String(productName).trim(),
      category: String(category).trim(),
      price: Number(price),
      shortDescription: shortDescription ? String(shortDescription).trim() : "",
      description: description ? String(description).trim() : "",
      ...(tier ? { tier } : {}),
      ...(deliveryTime !== undefined ? { deliveryTime: String(deliveryTime).trim() } : {}),
      ...(discount !== undefined ? { discount } : {}),
      // ✅ NEW FIELDS
      ...(gst !== undefined ? { gst: Number(gst) } : {}),
      ...(isCustomized !== undefined ? { isCustomized: Boolean(isCustomized) } : {}),
    };

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate("manufacturer", "fullName firstName lastName email company");

    if (!product) {
      return res.status(404).json({ success: false, message: "Catalog not found" });
    }

    const m = product.manufacturer;
    const manufacturerName =
      m?.fullName ||
      `${m?.firstName || ""} ${m?.lastName || ""}`.trim() ||
      m?.company ||
      m?.email ||
      "Unknown";

    res.json({
      success: true,
      message: "Catalog updated",
      catalog: {
        _id: product._id,
        productName: product.name,
        manufacturerName,
        manufacturerId: m?._id,
        category: product.category,
        shortDescription: product.shortDescription || "",
        description: product.description || "",
        price: product.price,
        discount: product.discount || 0,
        gst: product.gst || 0,
        isCustomized: product.isCustomized || false,
        deliveryTime: product.deliveryTime || "",
        tier: product.tier || "mid_range",
        status: product.status || "pending",
        image: product.image || "",
        galleryImages: product.galleryImages || [],
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
    });
  } catch (err) {
    console.error("Admin updateCatalog error:", err);
    res.status(500).json({ success: false, message: "Failed to update catalog" });
  }
};

// DELETE /api/admin/catalogs/:id
exports.deleteCatalog = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Catalog not found" });
    }

    res.json({ success: true, message: "Catalog deleted" });
  } catch (err) {
    console.error("Admin deleteCatalog error:", err);
    res.status(500).json({ success: false, message: "Failed to delete catalog" });
  }
};
exports.forwardProductToWebsite = async (req, res) => {
  try {
    const { productId } = req.params;
    const { tier } = req.body; // affordable | mid_range | luxury

    // 1️⃣ Validate productId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    // 2️⃣ Validate tier
    const allowedTiers = ["affordable", "mid_range", "luxury"];
    if (!allowedTiers.includes(tier)) {
      return res.status(400).json({
        success: false,
        message: `Invalid tier. Allowed: ${allowedTiers.join(", ")}`,
      });
    }

    // 3️⃣ Find product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // 4️⃣ Must be approved before forwarding
    if (product.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Only approved products can be forwarded to website",
      });
    }

    // 5️⃣ Update tier + forward flags
    product.tier = tier;
    product.forwardedToWebsite = true;
    product.forwardedAt = new Date();

    await product.save();

    return res.json({
      success: true,
      message: "Product forwarded to website successfully",
      product: {
        _id: product._id,
        name: product.name,
        tier: product.tier,
        forwardedToWebsite: product.forwardedToWebsite,
      },
    });
  } catch (error) {
    console.error("forwardProductToWebsite error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};