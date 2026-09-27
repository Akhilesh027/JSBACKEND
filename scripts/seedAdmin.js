const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Admin = require("../platforms/Admin/models/Admin");

const seedAdmin = async () => {
  try {
    const uri = (process.env.MONGODB_URI || "").trim();
    if (!uri) {
      console.error("❌ MONGODB_URI is not defined in .env");
      process.exit(1);
    }

    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      family: 4,
    });
    console.log("✅ MongoDB connected successfully.");

    // Delete old default admin if present
    await Admin.deleteMany({ email: "admin@gmail.com" });
    console.log("🧹 Removed old admin@gmail.com account if present.");

    const email = "info@jaghsoraluxore.com";
    const plainPassword = "JS@2026#jj";
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });

    if (existingAdmin) {
      existingAdmin.password = hashedPassword;
      existingAdmin.role = "cap_admin";
      existingAdmin.isActive = true;
      if (!existingAdmin.name) existingAdmin.name = "Super Admin";
      if (!existingAdmin.mobile) existingAdmin.mobile = "9550379505";
      await existingAdmin.save();
      console.log(`✅ Admin account '${email}' updated successfully.`);
    } else {
      await Admin.create({
        name: "Super Admin",
        email: email.toLowerCase(),
        mobile: "9550379505",
        role: "cap_admin",
        password: hashedPassword,
        isActive: true,
      });
      console.log(`✅ Admin account '${email}' created successfully.`);
    }

    console.log("-----------------------------------------");
    console.log("🎉 Admin credentials ready:");
    console.log(`📧 Email:    ${email}`);
    console.log(`🔑 Password: ${plainPassword}`);
    console.log(`👑 Role:     cap_admin`);
    console.log("-----------------------------------------");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding admin:", err);
    process.exit(1);
  }
};

seedAdmin();
