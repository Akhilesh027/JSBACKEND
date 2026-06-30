const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../../config/cloudinary");

/**
 * Shared Cloudinary upload middleware
 * ─────────────────────────────────────────────────────────────────────────────
 * Supports images (jpg, jpeg, png, webp, heic, heif) and PDFs.
 * Images are auto-compressed by Cloudinary (quality: auto, format: auto)
 * so even a 10 MB original is stored efficiently.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isImage =
      file.mimetype.startsWith("image/") ||
      file.mimetype === "image/heic" ||
      file.mimetype === "image/heif";
    const isPdf = file.mimetype === "application/pdf";

    if (isImage) {
      return {
        folder: "estimates/images",
        allowed_formats: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
        resource_type: "image",
        // ✅ Auto-compress: Cloudinary converts to optimal format & quality on the fly
        transformation: [
          { quality: "auto", fetch_format: "auto" },
        ],
      };
    } else if (isPdf) {
      return {
        folder: "estimates/pdfs",
        resource_type: "raw",
        format: "pdf",
      };
    } else {
      return {
        folder: "estimates/misc",
        resource_type: "raw",
      };
    }
  },
});

// File filter: only allow images and PDFs
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Only images (jpg, png, webp, heic) and PDFs are allowed.`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    // ✅ 10 MB per file — Cloudinary compresses images automatically
    // If you need to accept larger originals, raise this up to 50MB
    fileSize: 10 * 1024 * 1024,
  },
});

module.exports = upload;