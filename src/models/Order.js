const mongoose = require("mongoose");

const AddressSchema = new mongoose.Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    zip: { type: String, required: true },
  },
  { _id: false }
);

const RefundSchema = new mongoose.Schema(
  {
    cfRefundId: { type: String, required: true },
    refundId: { type: String, required: true }, // Our internal unique refund ID
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["SUCCESS", "PENDING", "CANCELLED", "ONHOLD", "FAILED"],
      default: "PENDING",
    },
    note: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false } // Do not create _id for subdocuments
);

const PersonDetailsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phoneNumber: { type: String, required: true },
  },
  { _id: false }
);

const OrderItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    menu: { type: mongoose.Schema.Types.ObjectId, ref: "Menu", required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    quantity: { type: Number, required: true },
    personDetails: [{ type: PersonDetailsSchema }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    skippedDates: [{ type: Date }],
    selectedMealTimes: [{ type: String, enum: ['Breakfast', 'Lunch', 'Dinner'] }],
    itemTotalPrice: { type: Number, required: true },
    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [{ type: OrderItemSchema, required: true }],
  paymentMethod: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  currency: { type: String, required: true },
  orderDate: { type: Date, required: true }, // Changed to required as it comes from checkoutDate
  status: {
    type: String,
    enum: ["pending", "confirmed", "delivered", "cancelled", "failed", "readyForDelivery"],
    default: "pending",
  },
  paymentSessionId: { type: String },
  paymentDetails: {
    cfPaymentId: { type: String },
    status: { type: String, enum: ["SUCCESS", "FAILED", "PENDING", "PAID"] },
    paymentTime: { type: Date },
    bankReference: { type: String },
    method: { type: String },
  },
  paymentConfirmedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deliveryAddresses: { type: Map, of: AddressSchema, required: true },
  invoiceUrl: { type: String }, // Add invoiceUrl field
  refunds: [{ type: RefundSchema }], // Add a field to store refund details
  isConfirmationEmailSent: { type: Boolean, default: false }, // Add this field to track email status
  sentVendorNotifications: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }], // Track vendors who have received notifications
});

module.exports = mongoose.model("Order", OrderSchema);
