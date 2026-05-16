const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    avatar: String,
    password: { type: String },
    phone: { type: String, sparse: true },
    otp: { type: String },
    otpExpiry: { type: Date },
    authMethod: {
      type: String,
      enum: ['google', 'email', 'phone'],
      default: 'google',
    },
    emailVerified: { type: Boolean, default: false },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    preferences: {
      location: {
        name: { type: String, default: 'New Delhi' },
        lat: { type: Number, default: 28.6139 },
        lng: { type: Number, default: 77.209 },
        tz: { type: Number, default: 5.5 },
      },
      darkMode: { type: Boolean, default: false },
      defaultView: { type: String, default: 'calendar' },
    },
    calendarRefreshToken: { type: String, default: null },
    subscription: {
      plan: {
        type: String,
        enum: ['free', 'yearly'],
        default: 'free',
      },
      status: {
        type: String,
        enum: ['active', 'expired', 'cancelled'],
        default: 'active',
      },
      razorpaySubscriptionId: String,
      razorpayCustomerId: String,
      currentPeriodEnd: Date,
      startedAt: Date,
      vsYear: Number,
    },
    payments: [{
      paymentId:   { type: String, required: true },
      orderId:     { type: String },
      plan:        { type: String },
      years:       { type: Number },
      amountPaise: { type: Number },
      currency:    { type: String, default: 'INR' },
      periodEnd:   { type: Date },
      paidAt:      { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
