const Address = require("../models/AffordableAddress");
const Customer = require("../models/affordable_customers"); // ✅ adjust path/model export

// GET /api/affordable/address/:userId
exports.getAddressesByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const addresses = await Address.find({ userId }).sort({ createdAt: -1 });
    return res.json({ addresses });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch addresses" });
  }
};

// POST /api/affordable/address
exports.addAddress = async (req, res) => {
  try {
    const {
      userId,
      fullName,
      phone,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      landmark,
      isDefault,
    } = req.body;

    if (!userId || !fullName || !phone || !addressLine1 || !city || !state || !pincode) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // if isDefault = true => unset other defaults
    if (isDefault === true) {
      await Address.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const address = await Address.create({
      userId,
      fullName,
      phone,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      landmark,
      isDefault: Boolean(isDefault),
    });

    // ✅ Update customer: push address + set default if needed
    const customerUpdate = {
      $addToSet: { addresses: address._id },
    };

    if (address.isDefault) {
      customerUpdate.$set = { defaultAddress: address._id };
    }

    await Customer.findByIdAndUpdate(userId, customerUpdate, { new: true });

    return res.status(201).json({ address });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to add address" });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;
    const {
      userId,
      fullName,
      phone,
      email,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      landmark,
      isDefault,
    } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const existing = await Address.findOne({ _id: addressId, userId });
    if (!existing) return res.status(404).json({ error: "Address not found" });

    if (isDefault === true) {
      await Address.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const updated = await Address.findOneAndUpdate(
      { _id: addressId, userId },
      {
        $set: {
          fullName,
          phone,
          email,
          addressLine1,
          addressLine2,
          city,
          state,
          pincode,
          landmark,
          isDefault: Boolean(isDefault),
        },
      },
      { new: true }
    );

    // ✅ Ensure customer has this address id in addresses array
    await Customer.findByIdAndUpdate(
      userId,
      { $addToSet: { addresses: updated._id } },
      { new: true }
    );

    // ✅ If set as default, update customer's defaultAddress too
    if (updated.isDefault) {
      await Customer.findByIdAndUpdate(
        userId,
        { $set: { defaultAddress: updated._id } },
        { new: true }
      );
    }

    return res.json({ address: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to update address" });
  }
};

// DELETE /api/affordable/address/:addressId/:userId
exports.deleteAddress = async (req, res) => {
  try {
    const { addressId, userId } = req.params;

    const deleted = await Address.findOneAndDelete({ _id: addressId, userId });
    if (!deleted) return res.status(404).json({ error: "Address not found" });

    // ✅ remove from customer.addresses
    await Customer.findByIdAndUpdate(
      userId,
      {
        $pull: { addresses: deleted._id },
        ...(deleted.isDefault ? { $set: { defaultAddress: null } } : {}),
      },
      { new: true }
    );

    // If default deleted, set latest as default (optional)
    if (deleted.isDefault) {
      const latest = await Address.findOne({ userId }).sort({ createdAt: -1 });

      if (latest) {
        // set latest as default in Address collection
        await Address.updateMany({ userId }, { $set: { isDefault: false } });
        latest.isDefault = true;
        await latest.save();

        // set defaultAddress in customer
        await Customer.findByIdAndUpdate(
          userId,
          {
            $addToSet: { addresses: latest._id },
            $set: { defaultAddress: latest._id },
          },
          { new: true }
        );
      }
    }

    return res.json({ message: "Address deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to delete address" });
  }
};
