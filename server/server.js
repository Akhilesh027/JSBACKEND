require("dotenv").config();
const connectDB = require("../config/db");
const app = require("./app");
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
const { verifyWhatsAppConnection } = require("../shared/services/whatsappService");

const startServer = async () => {
  await connectDB(); // DB will be connected first

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    // Check WhatsApp service connection status in console
    await verifyWhatsAppConnection();
  });
};

startServer();
// Reloaded with phoneData
