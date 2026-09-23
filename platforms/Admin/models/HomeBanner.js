const mongoose = require("mongoose");

const DualBannerItemSchema = new mongoose.Schema(
  {
    bannerIndex: { type: Number, required: true, enum: [1, 2] },
    imageUrl: { type: String, default: "" },
    badge: { type: String, default: "" },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    ctaText: { type: String, default: "Shop Now" },
    ctaLink: { type: String, default: "/categories" },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const VideoBannerSchema = new mongoose.Schema(
  {
    videoUrl: { type: String, default: "" },
    posterUrl: { type: String, default: "" },
    badge: { type: String, default: "" },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    ctaText: { type: String, default: "Explore Collection" },
    ctaLink: { type: String, default: "/categories" },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const HomeBannerSchema = new mongoose.Schema(
  {
    website: {
      type: String,
      required: true,
      enum: ["affordable", "midrange", "luxury"],
      unique: true,
      index: true,
    },
    videoBanner: {
      type: VideoBannerSchema,
      default: () => ({}),
    },
    dualBanners: {
      type: [DualBannerItemSchema],
      default: [
        {
          bannerIndex: 1,
          imageUrl: "",
          badge: "Featured Collection",
          title: "Modern Living Spaces",
          subtitle: "Explore our latest handcrafted living room designs",
          ctaText: "Shop Now",
          ctaLink: "/categories/living-room",
          isActive: true,
        },
        {
          bannerIndex: 2,
          imageUrl: "",
          badge: "Special Offer",
          title: "Bedroom Comfort Sets",
          subtitle: "Premium wood craftsmanship engineered for comfort",
          ctaText: "Explore Now",
          ctaLink: "/categories/bedroom",
          isActive: true,
        },
      ],
    },
    updatedBy: { type: String, default: "Admin" },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("HomeBanner", HomeBannerSchema);
