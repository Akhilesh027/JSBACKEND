const Category = require("../../Admin/models/category.js");
const mongoose = require("mongoose");
const Product = require("../models/Product.js");

const MAX_TOTAL_IMAGES = 5;

const normalizeGallery = (galleryImages) => {
  if (!galleryImages) return [];
  if (Array.isArray(galleryImages)) return galleryImages.filter(Boolean);
  // if someone sends a single string accidentally:
  if (typeof galleryImages === "string") return [galleryImages].filter(Boolean);
  return [];
};

const countTotalImages = (image, galleryImagesArr) => {
  const mainCount = image && String(image).trim() ? 1 : 0;
  const galleryCount = Array.isArray(galleryImagesArr) ? galleryImagesArr.length : 0;
  return mainCount + galleryCount;
};
exports.createProduct = async (req, res) => {
  try {
    if (req.user.role !== "manufacturer") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const {
      name,

      // ✅ either provide IDs
      categoryId,
      subCategoryId,

      // ✅ or provide slugs
      category,     // parent slug preferred
      subcategory,  // child slug optional

      sku,
      description,
      shortDescription,
      price,
      quantity,
      availability,
      color,
      material,
      size,
      weight,
      location,
      image,
      galleryImages,
      deliveryTime,
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Name and price are required",
      });
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

    const finalQuantity = quantity !== undefined ? parseInt(quantity, 10) : 0;
    const finalAvailability = availability || (finalQuantity > 0 ? "In Stock" : "Out of Stock");

    // =========================================================
    // ✅ Resolve Category (parent) + SubCategory (child)
    // Priority: IDs -> slugs -> fallback auto-fix if category is actually a child
    // =========================================================

    let parentCat = null;
    let subCat = null;

    // ✅ 1) If IDs are provided (BEST)
    if (categoryId) {
      parentCat = await Category.findById(categoryId).select("_id id slug name parentId").lean();
      if (!parentCat) {
        return res.status(400).json({ success: false, message: "Invalid categoryId" });
      }
      if (parentCat.parentId) {
        return res.status(400).json({ success: false, message: "categoryId must be a parent category" });
      }

      if (subCategoryId) {
        subCat = await Category.findOne({
          _id: subCategoryId,
          parentId: parentCat._id,
        }).select("_id id slug name parentId").lean();

        if (!subCat) {
          return res.status(400).json({
            success: false,
            message: "Invalid subCategoryId for this parent category",
          });
        }
      }
    } else {
      // ✅ 2) Else resolve by slugs
      const catSlug = String(category || "").trim();
      const subSlug = String(subcategory || "").trim();

      if (!catSlug) {
        return res.status(400).json({ success: false, message: "Category is required (slug or id)" });
      }

      // Try find category by slug
      const catNode = await Category.findOne({ slug: catSlug })
        .select("_id slug name parentId")
        .lean();

      if (!catNode) {
        return res.status(400).json({ success: false, message: "Invalid category slug" });
      }

      // ✅ Auto-fix: if category slug is actually a CHILD, treat it as subCategory
      if (catNode.parentId) {
        parentCat = await Category.findById(catNode.parentId)
          .select("_id slug name parentId")
          .lean();
        subCat = catNode;
      } else {
        parentCat = catNode;
        if (subSlug) {
          subCat = await Category.findOne({
            slug: subSlug,
            parentId: parentCat._id,
          }).select("_id slug name parentId").lean();

          if (!subCat) {
            return res.status(400).json({
              success: false,
              message: "Invalid subcategory for this category",
            });
          }
        }
      }
    }

    // ✅ Final slugs that will be stored on Product
    const finalCategorySlug = parentCat.slug;
    const finalSubSlug = subCat?.slug || "";

    const product = await Product.create({
      manufacturer: req.user.id,

      name: name.trim(),

      // ✅ Always store parent slug in category
      category: finalCategorySlug,
      subcategory: finalSubSlug || undefined,

      // ✅ Always store correct ids
      categoryId: parentCat._id,
      subCategoryId: subCat?._id || null,

      sku: skuClean || undefined,

      shortDescription: shortDescription?.trim(),
      description: description?.trim(),

      price: parseFloat(price),
      quantity: finalQuantity,
      availability: finalAvailability,

      color: color?.trim(),
      material: material?.trim(),
      size: size?.trim(),
      weight: weight?.trim(),
      location: location?.trim(),
      deliveryTime: deliveryTime?.trim(),

      image: mainImage || "https://via.placeholder.com/300x300?text=No+Image",
      galleryImages: galleryArr,
    });

    // ✅ increment productCount
    try {
      if (subCat?._id) await Category.findByIdAndUpdate(subCat._id, { $inc: { productCount: 1 } });
      else await Category.findByIdAndUpdate(parentCat._id, { $inc: { productCount: 1 } });
    } catch (e) {
      console.error("productCount increment failed:", e);
    }

    return res.status(201).json({ success: true, message: "Product created successfully", product });
  } catch (err) {
    console.error("Create product error:", err);
    if (err?.code === 11000) return res.status(409).json({ success: false, message: "Duplicate key error" });
    return res.status(500).json({ success: false, message: "Server error" });
  }
};




// Get All Products
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find({ manufacturer: req.user.id }).sort({
      createdAt: -1,
    });

    res.json({ success: true, products });
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};

// Get Single Product
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      manufacturer: req.user.id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({ success: true, product });
  } catch (err) {
    console.error("Get product error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Update Product
exports.updateProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      sku,
      description,
      price,
      quantity,
      availability,
      color,
      material,
      size,
      weight,
      location,
      image,
      galleryImages,
    } = req.body;

    if (price !== undefined && Number(price) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be greater than 0",
      });
    }

    if (quantity !== undefined && Number(quantity) < 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity cannot be negative",
      });
    }

    if (sku) {
      const existingProduct = await Product.findOne({
        sku: sku.trim(),
        manufacturer: req.user.id,
        _id: { $ne: req.params.id },
      });
      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: "SKU already exists in your catalogue",
        });
      }
    }

    // Get existing product first (so we can validate total images properly)
    const existing = await Product.findOne({
      _id: req.params.id,
      manufacturer: req.user.id,
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Product not found or access denied",
      });
    }

    // Determine what images will be after update
    const nextMainImage =
      image !== undefined ? String(image).trim() : existing.image;

    const nextGallery =
      galleryImages !== undefined ? normalizeGallery(galleryImages) : (existing.galleryImages || []);

    const totalImages = countTotalImages(nextMainImage, nextGallery);

    if (totalImages > MAX_TOTAL_IMAGES) {
      return res.status(400).json({
        success: false,
        message: `You can upload up to ${MAX_TOTAL_IMAGES} images total (main + gallery). Remove some images first.`,
      });
    }

    const updateData = {
      ...(name !== undefined && { name: name.trim() }),
      ...(category !== undefined && { category: category.trim() }),
      ...(sku !== undefined && { sku: sku.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(price !== undefined && { price: parseFloat(price) }),
      ...(quantity !== undefined && { quantity: parseInt(quantity) }),
      ...(availability !== undefined && { availability }),
      ...(color !== undefined && { color: color.trim() }),
      ...(material !== undefined && { material: material.trim() }),
      ...(size !== undefined && { size: size.trim() }),
      ...(weight !== undefined && { weight: weight.trim() }),
      ...(location !== undefined && { location: location.trim() }),
      ...(image !== undefined && { image: nextMainImage }),
      ...(galleryImages !== undefined && { galleryImages: nextGallery }),
    };

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, manufacturer: req.user.id },
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (err) {
    console.error("Update product error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "SKU already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update product",
    });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findOneAndDelete({
      _id: req.params.id,
      manufacturer: req.user.id,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found or access denied",
      });
    }

    res.json({
      success: true,
      message: "Product deleted successfully",
    });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete product",
    });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    return res.status(201).json({
      success: true,
      url: req.file.path,        // Cloudinary secure_url
      public_id: req.file.filename, // Cloudinary public_id
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
