const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  secret: {
    type: String,
    required: true
  },
  events: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

webhookSchema.index({ isActive: 1 });

module.exports = mongoose.model('Webhook', webhookSchema);
