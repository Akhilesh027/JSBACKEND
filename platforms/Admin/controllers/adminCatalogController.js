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
        gst: p.gst || 0,
        isCustomized: p.isCustomized || false,
        priceIncludesGst: p.priceIncludesGst || false,   // ✅ ADDED – return stored flag

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
};
exports.updateCatalogStatus = async (req, res) => {
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
      gst,
      isCustomized,
      priceIncludesGst,     // ✅ NEW: flag indicating if the provided price includes GST
    } = req.body;

    // 1. Required fields validation
    if (!productName || !category || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "productName, category, and price are required",
      });
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a positive number",
      });
    }

    // 2. Tier validation
    if (tier && !["affordable", "mid_range", "luxury"].includes(tier)) {
      return res.status(400).json({
        success: false,
        message: "Invalid tier (affordable | mid_range | luxury)",
      });
    }

    // 3. Discount validation
    let discountNum = discount !== undefined ? Number(discount) : undefined;
    if (discountNum !== undefined && (isNaN(discountNum) || discountNum < 0 || discountNum > 100)) {
      return res.status(400).json({
        success: false,
        message: "Discount must be a number between 0 and 100",
      });
    }

    // 4. GST validation
    let gstNum = gst !== undefined ? Number(gst) : undefined;
    if (gstNum !== undefined && (isNaN(gstNum) || gstNum < 0 || gstNum > 100)) {
      return res.status(400).json({
        success: false,
        message: "GST must be a number between 0 and 100",
      });
    }

    // 5. isCustomized validation
    if (isCustomized !== undefined && typeof isCustomized !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "isCustomized must be a boolean",
      });
    }

    // 6. priceIncludesGst validation (optional)
    if (priceIncludesGst !== undefined && typeof priceIncludesGst !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "priceIncludesGst must be a boolean",
      });
    }

    // 7. Build update object
    const updateData = {
      name: productName.trim(),
      category: category.trim(),
      price: priceNum,                 // Already exclusive if frontend converted it
      shortDescription: shortDescription ? shortDescription.trim() : "",
      description: description ? description.trim() : "",
      ...(tier && { tier }),
      ...(deliveryTime !== undefined && { deliveryTime: deliveryTime.trim() }),
      ...(discountNum !== undefined && { discount: discountNum }),
      ...(gstNum !== undefined && { gst: gstNum }),
      ...(isCustomized !== undefined && { isCustomized }),
      ...(priceIncludesGst !== undefined && { priceIncludesGst }),
    };

    // 8. Perform update
    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate("manufacturer", "fullName firstName lastName email company");

    if (!product) {
      return res.status(404).json({ success: false, message: "Catalog not found" });
    }

    // 9. Format manufacturer name for response
    const m = product.manufacturer;
    const manufacturerName =
      m?.fullName ||
      `${m?.firstName || ""} ${m?.lastName || ""}`.trim() ||
      m?.company ||
      m?.email ||
      "Unknown";

    // 10. Return updated catalog
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
        priceIncludesGst: product.priceIncludesGst || false,   // ✅ included in response
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