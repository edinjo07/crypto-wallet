const mongoose = require('mongoose');

const balanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  walletAddress: {
    type: String,
    required: true
  },
  cryptocurrency: {
    type: String,
    required: true
  },
  balance: {
    type: Number,
    default: 0
  },
  network: {
    type: String,
    enum: ['ethereum', 'polygon', 'bsc'],
    default: 'ethereum'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient queries
balanceSchema.index({ userId: 1, walletAddress: 1, cryptocurrency: 1 }, { unique: true });

module.exports = mongoose.model('Balance', balanceSchema);
