const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    // Determine resource type based on file mimetype
    const isImage = file.mimetype.startsWith("image/");
    const isPdf = file.mimetype === "application/pdf";

    if (isImage) {
      return {
        folder: "estimates/images",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        resource_type: "image",
      };
    } else if (isPdf) {
      return {
        folder: "estimates/pdfs",
        resource_type: "raw", // required for non‑image files
        format: "pdf",
      };
    } else {
      // Fallback – treat as raw, store in misc
      return {
        folder: "estimates/misc",
        resource_type: "raw",
      };
    }
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // increased to 20MB for PDFs
});

module.exports = upload;