const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  walletAddress: {
    type: String,
    required: true
  },
  contractAddress: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  decimals: {
    type: Number,
    required: true,
    default: 18
  },
  balance: {
    type: String,
    default: '0'
  },
  network: {
    type: String,
    enum: ['ethereum', 'polygon', 'bsc'],
    default: 'ethereum'
  },
  isCustom: {
    type: Boolean,
    default: false
  },
  logoUrl: String,
  priceUsd: Number,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Compound index for efficient queries
tokenSchema.index({ userId: 1, walletAddress: 1, contractAddress: 1 }, { unique: true });
tokenSchema.index({ symbol: 1, network: 1 });

module.exports = mongoose.model('Token', tokenSchema);
