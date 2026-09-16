const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'appointment_confirmed',
        'appointment_cancelled',
        'appointment_rescheduled',
        'appointment_reminder',
        'appointment_completed',
        'payment_successful',
        'payment_failed',
        'payment_refund',
        'treatment_plan_created',
        'treatment_updated',
        'follow_up_required',
        'prescription_ready',
        'queue_update',
        'general',
      ],
      required: true,
    },
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null }, // appointment/payment/etc id
    isRead: { type: Boolean, default: false },

    // Delivery tracking - useful once push/SMS channels are added
    channels: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);