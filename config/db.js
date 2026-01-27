const mongoose = require("mongoose");

mongoose.set("strictQuery", false);

async function connectDB() {
  try {
    const uri = (process.env.MONGODB_URI || "").trim();

    console.log("👉 Using MONGODB_URI:", uri); // TEMP DEBUG
    console.log("👉 Starts with:", uri.slice(0, 20));

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
        useNewUrlParser: true,
  useUnifiedTopology: true,
  family: 4  // Forces IPv4 only

    });

    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
