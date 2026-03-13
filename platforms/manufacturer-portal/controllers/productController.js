const Category = require("../../Admin/models/category.js");
const mongoose = require("mongoose");
const Product = require("../models/Product.js");

const MAX_TOTAL_IMAGES = 5;

/** -----------------------------
 * Helpers
 * ---------------------------- */
const normalizeGallery = (galleryImages) => {
  if (!galleryImages) return [];
  if (Array.isArray(galleryImages)) return galleryImages.filter(Boolean);
  if (typeof galleryImages === "string") return [galleryImages].filter(Boolean);
  return [];
};

const countTotalImages = (image, galleryImagesArr) => {
  const mainCount = image && String(image).trim() ? 1 : 0;
  const galleryCount = Array.isArray(galleryImagesArr) ? galleryImagesArr.length : 0;
  return mainCount + galleryCount;
};

// ✅ Availability should be derived from quantity (inventory-safe)
const computeAvailability = (qty, low = 5) => {
  const q = Number(qty || 0);
  const l = Number(low || 5);
  if (q <= 0) return "Out of Stock";
  if (q <= l) return "Low Stock";
  return "In Stock";
};

// ✅ Normalise size and color fields (handle string, array, comma-separated)
const normalizeArrayField = (value) => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    // If it's a comma-separated string (e.g., from legacy input)
    return value.split(",").map(s => s.trim()).filter(Boolean);
  }
  return [];
};

// ✅ Resolve categories same way in create + update
async function resolveCategories({ categoryId, subCategoryId, category, subcategory }) {
  let parentCat = null;
  let subCat = null;

  // 1) IDs preferred
  if (categoryId) {
    parentCat = await Category.findById(categoryId)
      .select("_id slug name parentId")
      .lean();

    if (!parentCat) throw new Error("Invalid categoryId");
    if (parentCat.parentId) throw new Error("categoryId must be a parent category");

    if (subCategoryId) {
      subCat = await Category.findOne({ _id: subCategoryId, parentId: parentCat._id })
        .select("_id slug name parentId")
        .lean();
      if (!subCat) throw new Error("Invalid subCategoryId for this parent category");
    }
  } else {
    // 2) Slugs
    const catSlug = String(category || "").trim();
    const subSlug = String(subcategory || "").trim();

    if (!catSlug) throw new Error("Category is required (slug or id)");

    const catNode = await Category.findOne({ slug: catSlug })
      .select("_id slug name parentId")
      .lean();

    if (!catNode) throw new Error("Invalid category slug");

    // Auto-fix: if passed child slug as category
    if (catNode.parentId) {
      parentCat = await Category.findById(catNode.parentId)
        .select("_id slug name parentId")
        .lean();
      if (!parentCat) throw new Error("Invalid parent for category slug");
      subCat = catNode;
    } else {
      parentCat = catNode;

      if (subSlug) {
        subCat = await Category.findOne({ slug: subSlug, parentId: parentCat._id })
          .select("_id slug name parentId")
          .lean();
        if (!subCat) throw new Error("Invalid subcategory for this category");
      }
    }
  }

  return {
    parentCat,
    subCat,
    finalCategorySlug: parentCat.slug,
    finalSubSlug: subCat?.slug || "",
  };
}

/** -----------------------------
 * CREATE PRODUCT
 * ---------------------------- */
exports.createProduct = async (req, res) => {
  try {
    if (req.user.role !== "manufacturer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      name,
      categoryId,
      subCategoryId,
      category,
      subcategory,
      sku,
      description,
      shortDescription,
      price,
      quantity,
      // availability (ignored intentionally)
      color,
      material,
      size,
      weight,
      location,
      image,
      galleryImages,
      deliveryTime,
      lowStockThreshold,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ success: false, message: "Name and price are required" });
    }

    if (Number(price) <= 0) {
      return res.status(400).json({ success: false, message: "Price must be greater than 0" });
    }

    if (quantity !== undefined && Number(quantity) < 0) {
      return res.status(400).json({ success: false, message: "Quantity cannot be negative" });
    }

    const skuClean = (sku || "").trim();
    if (skuClean) {
      const existingSku = await Product.findOne({ sku: skuClean }).lean();
      if (existingSku) {
        return res.status(409).json({ success: false, message: "SKU already exists" });
      }
    }

    const galleryArr = normalizeGallery(galleryImages);
    const mainImage = (image || "").trim();
    const totalImages = countTotalImages(mainImage, galleryArr);

    if (totalImages > MAX_TOTAL_IMAGES) {
      return res.status(400).json({
        success: false,
        message: `You can upload up to ${MAX_TOTAL_IMAGES} images total (main + gallery).`,
      });
    }

    // ✅ Inventory-safe fields
    const finalQuantity = quantity !== undefined ? parseInt(quantity, 10) : 0;
    const finalLowStock = lowStockThreshold !== undefined ? parseInt(lowStockThreshold, 10) : 5;
    const finalAvailability = computeAvailability(finalQuantity, finalLowStock);

    // ✅ Resolve category parent/sub properly
    let parentCat, subCat, finalCategorySlug, finalSubSlug;
    try {
      const resolved = await resolveCategories({ categoryId, subCategoryId, category, subcategory });
      parentCat = resolved.parentCat;
      subCat = resolved.subCat;
      finalCategorySlug = resolved.finalCategorySlug;
      finalSubSlug = resolved.finalSubSlug;
    } catch (e) {
      return res.status(400).json({ success: false, message: e.message || "Category invalid" });
    }

    // 👇 Normalise color and size to arrays
    const colorArray = normalizeArrayField(color);
    const sizeArray = normalizeArrayField(size);

    const product = await Product.create({
      // ✅ manufacturer-wise ownership
      manufacturer: req.user.id,

      name: name.trim(),

      // ✅ store parent slug always
      category: finalCategorySlug,
      subcategory: finalSubSlug || undefined,

      categoryId: parentCat._id,
      subCategoryId: subCat?._id || null,

      sku: skuClean || undefined,

      shortDescription: shortDescription?.trim(),
      description: description?.trim(),

      price: parseFloat(price),

      // ✅ inventory
      quantity: finalQuantity,
      lowStockThreshold: finalLowStock,
      availability: finalAvailability,

      color: colorArray,                // ✅ array
      material: material?.trim(),
      size: sizeArray,                   // ✅ array
      weight: weight?.trim(),
      location: location?.trim(),
      deliveryTime: deliveryTime?.trim(),

      image: mainImage || "https://via.placeholder.com/300x300?text=No+Image",
      galleryImages: galleryArr,
    });

    // productCount increment (safe)
    try {
      if (subCat?._id) await Category.findByIdAndUpdate(subCat._id, { $inc: { productCount: 1 } });
      else await Category.findByIdAndUpdate(parentCat._id, { $inc: { productCount: 1 } });
    } catch (e) {
      console.error("productCount increment failed:", e);
    }

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      product,
    });
  } catch (err) {
    console.error("Create product error:", err);
    if (err?.code === 11000) {
      return res.status(409).json({ success: false, message: "Duplicate key error" });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/** -----------------------------
 * GET ALL PRODUCTS (manufacturer-wise)
 * ---------------------------- */
exports.getAllProducts = async (req, res) => {
  try {
    if (req.user.role !== "manufacturer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const products = await Product.find({ manufacturer: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};

/** -----------------------------
 * GET SINGLE PRODUCT (manufacturer-wise)
 * ---------------------------- */
exports.getProduct = async (req, res) => {
  try {
    if (req.user.role !== "manufacturer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const product = await Product.findOne({
      _id: req.params.id,
      manufacturer: req.user.id,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.json({ success: true, product });
  } catch (err) {
    console.error("Get product error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/** -----------------------------
 * UPDATE PRODUCT (inventory-safe + category-safe)
 * ---------------------------- */
exports.updateProduct = async (req, res) => {
  try {
    if (req.user.role !== "manufacturer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      name,
      categoryId,
      subCategoryId,
      category,
      subcategory,
      sku,
      description,
      shortDescription,
      price,
      quantity,
      // availability (ignored intentionally)
      color,
      material,
      size,
      weight,
      location,
      image,
      galleryImages,
      deliveryTime,
      lowStockThreshold,
    } = req.body;

    if (price !== undefined && Number(price) <= 0) {
      return res.status(400).json({ success: false, message: "Price must be greater than 0" });
    }

    if (quantity !== undefined && Number(quantity) < 0) {
      return res.status(400).json({ success: false, message: "Quantity cannot be negative" });
    }

    if (sku) {
      const existingProduct = await Product.findOne({
        sku: sku.trim(),
        manufacturer: req.user.id,
        _id: { $ne: req.params.id },
      });
      if (existingProduct) {
        return res.status(409).json({ success: false, message: "SKU already exists in your catalogue" });
      }
    }

    // get existing first
    const existing = await Product.findOne({
      _id: req.params.id,
      manufacturer: req.user.id,
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Product not found or access denied" });
    }

    // Validate images after update
    const nextMainImage = image !== undefined ? String(image).trim() : existing.image;
    const nextGallery =
      galleryImages !== undefined ? normalizeGallery(galleryImages) : (existing.galleryImages || []);

    const totalImages = countTotalImages(nextMainImage, nextGallery);
    if (totalImages > MAX_TOTAL_IMAGES) {
      return res.status(400).json({
        success: false,
        message: `You can upload up to ${MAX_TOTAL_IMAGES} images total (main + gallery). Remove some images first.`,
      });
    }

    // ✅ Resolve categories if any category fields are provided, else keep existing
    let finalCategorySlug = existing.category;
    let finalSubSlug = existing.subcategory || "";
    let finalCategoryId = existing.categoryId;
    let finalSubId = existing.subCategoryId || null;

    const categoryChangeRequested =
      categoryId !== undefined ||
      subCategoryId !== undefined ||
      category !== undefined ||
      subcategory !== undefined;

    if (categoryChangeRequested) {
      try {
        const resolved = await resolveCategories({
          categoryId: categoryId ?? existing.categoryId,
          subCategoryId: subCategoryId ?? existing.subCategoryId,
          category: category ?? existing.category,
          subcategory: subcategory ?? existing.subcategory,
        });

        finalCategorySlug = resolved.finalCategorySlug;
        finalSubSlug = resolved.finalSubSlug || "";
        finalCategoryId = resolved.parentCat._id;
        finalSubId = resolved.subCat?._id || null;
      } catch (e) {
        return res.status(400).json({ success: false, message: e.message || "Category invalid" });
      }
    }

    // ✅ Inventory-safe recalculation
    const nextQty = quantity !== undefined ? parseInt(quantity, 10) : existing.quantity;
    const nextLowStock =
      lowStockThreshold !== undefined ? parseInt(lowStockThreshold, 10) : (existing.lowStockThreshold || 5);
    const nextAvailability = computeAvailability(nextQty, nextLowStock);

    // 👇 Normalise color and size (if provided, otherwise keep existing)
    const colorArray = color !== undefined ? normalizeArrayField(color) : existing.color;
    const sizeArray = size !== undefined ? normalizeArrayField(size) : existing.size;

    const updateData = {
      ...(name !== undefined && { name: name.trim() }),
      ...(sku !== undefined && { sku: sku.trim() || undefined }),
      ...(shortDescription !== undefined && { shortDescription: shortDescription?.trim() }),
      ...(description !== undefined && { description: description?.trim() }),
      ...(price !== undefined && { price: parseFloat(price) }),

      // ✅ categories (kept consistent)
      category: finalCategorySlug,
      subcategory: finalSubSlug || undefined,
      categoryId: finalCategoryId,
      subCategoryId: finalSubId,

      // ✅ inventory (always consistent)
      quantity: nextQty,
      lowStockThreshold: nextLowStock,
      availability: nextAvailability,

      color: colorArray,                // ✅ array
      ...(material !== undefined && { material: material?.trim() }),
      size: sizeArray,                   // ✅ array
      ...(weight !== undefined && { weight: weight?.trim() }),
      ...(location !== undefined && { location: location?.trim() }),
      ...(deliveryTime !== undefined && { deliveryTime: deliveryTime?.trim() }),

      ...(image !== undefined && { image: nextMainImage }),
      ...(galleryImages !== undefined && { galleryImages: nextGallery }),
    };

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, manufacturer: req.user.id },
      updateData,
      { new: true, runValidators: true }
    );

    res.json({ success: true, message: "Product updated successfully", product });
  } catch (err) {
    console.error("Update product error:", err);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "SKU already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to update product" });
  }
};

/** -----------------------------
 * DELETE PRODUCT (manufacturer-wise)
 * ---------------------------- */
exports.deleteProduct = async (req, res) => {
  try {
    if (req.user.role !== "manufacturer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      manufacturer: req.user.id,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or access denied" });
    }

    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ success: false, message: "Failed to delete product" });
  }
};

/** -----------------------------
 * ✅ INVENTORY ONLY UPDATE (clean endpoint)
 * PATCH /api/products/:id/inventory
 * Body: { quantity, lowStockThreshold? }
 * ---------------------------- */
exports.updateInventory = async (req, res) => {
  try {
    if (req.user.role !== "manufacturer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { quantity, lowStockThreshold } = req.body;

    if (quantity === undefined) {
      return res.status(400).json({ success: false, message: "quantity is required" });
    }

    if (Number(quantity) < 0) {
      return res.status(400).json({ success: false, message: "Quantity cannot be negative" });
    }

    const product = await Product.findOne({
      _id: req.params.id,
      manufacturer: req.user.id,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found or access denied" });
    }

    const nextQty = parseInt(quantity, 10);
    const nextLow =
      lowStockThreshold !== undefined ? parseInt(lowStockThreshold, 10) : (product.lowStockThreshold || 5);

    product.quantity = nextQty;
    product.lowStockThreshold = nextLow;
    product.availability = computeAvailability(nextQty, nextLow);

    await product.save();

    res.json({ success: true, message: "Inventory updated", product });
  } catch (err) {
    console.error("Inventory update error:", err);
    res.status(500).json({ success: false, message: "Failed to update inventory" });
  }
};

/** -----------------------------
 * Uploads (unchanged)
 * ---------------------------- */
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    return res.status(201).json({
      success: true,
      url: req.file.path,
      public_id: req.file.filename,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};

exports.uploadMultipleImages = async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    return res.status(201).json({
      success: true,
      files: files.map((f) => ({
        url: f.path,
        public_id: f.filename,
      })),
    });
  } catch (err) {
    console.error("Upload multiple error:", err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};