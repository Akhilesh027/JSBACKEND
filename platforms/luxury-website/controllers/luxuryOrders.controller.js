const mongoose = require("mongoose");
const Customer = require("../models/luxury_customers");
const LuxuryOrder = require("../models/luxury_orders.js");

const normalizeMethod = (m) => {
  const method = String(m || "").toLowerCase();
  if (["card", "upi", "netbanking", "cod"].includes(method)) return method;
  return "cod";
};

exports.placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { addressId, address, items, pricing, totals, payment } = req.body;

    // ✅ validate items
    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Cart items required" });
    }

    // ✅ load customer
    const customer = await Customer.findById(req.user.id)
      .select("addresses firstName lastName email phone totalOrders totalSpent loyaltyPoints rewardTier")
      .session(session);

    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    // ✅ Resolve shipping address snapshot
    let shippingAddress = null;

    if (addressId) {
      const addr = customer.addresses?.find((a) => String(a._id) === String(addressId));
      if (!addr) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Address not found" });
      }
      shippingAddress = addr.toObject ? addr.toObject() : addr;
    } else if (address) {
      if (!address.addressLine1 || !address.city || !address.state || !address.pincode) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Invalid address" });
      }
      shippingAddress = address;
    } else {
      const def = customer.addresses?.find((a) => a.isDefault);
      if (!def) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "No address found. Add an address." });
      }
      shippingAddress = def.toObject ? def.toObject() : def;
    }

    // ✅ normalize + validate items (server side)
    const cleanItems = items.map((it, idx) => {
      const productId = it.productId || it.product?._id || it.id || null;

      if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) {
        throw new Error(`Invalid productId at item index ${idx}`);
      }

      const qty = Math.max(1, Number(it.quantity) || 1);
      const price = Math.max(0, Number(it.price) || 0);

      return {
        productId,
        name: String(it.name || ""),
        image: String(it.image || ""),
        color: String(it.color || ""),
        price,
        quantity: qty,
        lineTotal: price * qty,
      };
    });

    // ✅ totals compute (always compute server-side)
    const computedSubtotal = cleanItems.reduce((s, it) => s + it.lineTotal, 0);
    const computedShipping = computedSubtotal > 500000 ? 0 : computedSubtotal === 0 ? 0 : 5000;
    const computedTotal = computedSubtotal + computedShipping;

    // store only computed values
    const subtotal = computedSubtotal;
    const shipping = computedShipping;
    const total = computedTotal;

    // ✅ Payment method & statuses
    const method = normalizeMethod(payment?.method);
    const paymentStatus = method === "cod" ? "unpaid" : "pending";
    const orderStatus = "placed";

    // ✅ create order
    const order = await LuxuryOrder.create(
      [
        {
          customerId: req.user.id,
          items: cleanItems,
          pricing: {
            subtotal,
            shipping,
            total,
            currency: "INR",
          },
          shippingAddress: {
            label: shippingAddress.label || "Home",
            firstName: shippingAddress.firstName || customer.firstName,
            lastName: shippingAddress.lastName || customer.lastName,
            email: shippingAddress.email || customer.email,
            phone: shippingAddress.phone || customer.phone,
            addressLine1: shippingAddress.addressLine1,
            addressLine2: shippingAddress.addressLine2 || "",
            city: shippingAddress.city,
            state: shippingAddress.state,
            pincode: shippingAddress.pincode,
            country: shippingAddress.country || "India",
          },
          payment: {
            method,
            status: paymentStatus,
            transactionId: payment?.transactionId ? String(payment.transactionId) : "",
            meta:
              method === "upi"
                ? { upiId: payment?.upiId || "" }
                : method === "netbanking"
                ? { bank: payment?.bank || "" }
                : method === "card"
                ? { last4: payment?.last4 || "" }
                : {},
          },
          status: orderStatus,
        },
      ],
      { session }
    );

    const createdOrder = order[0];

    // ✅ update customer stats safely (atomic)
    // points: 1 point per 100 spent (same as your schema method)
    const points = Math.floor(total / 100);

    // You can keep purchaseHistory detailed as you want. Here it's a simple snapshot.
    const purchaseHistoryEntry = {
      productId: cleanItems?.[0]?.productId || null, // optional
      productName: cleanItems?.[0]?.name || "Order",
      amount: total,
      date: new Date(),
      status: orderStatus,
    };

    await Customer.updateOne(
      { _id: req.user.id },
      {
        $push: {
          orders: createdOrder._id,
          purchaseHistory: purchaseHistoryEntry,
        },
        $inc: {
          totalOrders: 1,
          totalSpent: total,
          loyaltyPoints: points,
        },
      },
      { session }
    );

    // ✅ commit
    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      message: "Order placed",
      orderId: createdOrder._id,
      status: createdOrder.status,
      paymentStatus: createdOrder.payment?.status,
      order: createdOrder,
      statsUpdated: {
        addedToOrders: true,
        totalOrdersIncremented: true,
        totalSpentAdded: total,
        loyaltyPointsAdded: points,
      },
    });
  } catch (err) {
    console.error("placeOrder error:", err);

    await session.abortTransaction();
    session.endSession();

    if (String(err?.message || "").startsWith("Invalid productId")) {
      return res.status(400).json({ success: false, message: err.message });
    }

    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await LuxuryOrder.find({ customerId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ success: true, orders });
  } catch (err) {
    console.error("getMyOrders error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid orderId" });
    }

    const order = await LuxuryOrder.findOne({ _id: orderId, customerId: req.user.id });

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    return res.json({ success: true, order });
  } catch (err) {
    console.error("getOrderById error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
