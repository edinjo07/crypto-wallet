const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdraw', 'send', 'receive'],
    required: true
  },
  cryptocurrency: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  fromAddress: String,
  toAddress: String,
  txHash: String,
  network: {
    type: String,
    enum: ['ethereum', 'polygon', 'bsc', 'bitcoin', 'btc'],
    default: 'ethereum'
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed', 'reorged'],
    default: 'pending'
  },
  confirmations: {
    type: Number,
    default: 0
  },
  confirmedAt: Date,
  lastCheckedAt: Date,
  reorged: {
    type: Boolean,
    default: false
  },
  gasUsed: Number,
  gasFee: Number,
  blockNumber: Number,
  timestamp: {
    type: Date,
    default: Date.now
  },
  description: {
    type: String,
    default: ''
  },
  adminNote: {
    type: String,
    default: ''
  },
  adminEdited: {
    type: Boolean,
    default: false
  },
  adminEditedAt: Date
});

// Index for faster queries
transactionSchema.index({ userId: 1, timestamp: -1 });
transactionSchema.index({ txHash: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
