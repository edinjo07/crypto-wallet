const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  webhookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Webhook',
    required: true
  },
  eventType: {
    type: String,
    required: true
  },
  payload: {
    type: Object,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'delivered', 'failed'],
    default: 'pending'
  },
  attempts: {
    type: Number,
    default: 0
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now
  },
  lastError: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

webhookEventSchema.index({ status: 1, nextAttemptAt: 1 });
webhookEventSchema.index({ webhookId: 1, createdAt: -1 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
