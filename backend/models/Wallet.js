const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  network: {
    type: String,
    enum: ['bitcoin'],
    default: 'bitcoin'
  },
  address: {
    type: String,
    required: true
  },
  encryptedMnemonic: String,
  encryptedSeed: {
    ciphertext: String,
    iv: String,
    tag: String,
    v: String
  },
  createdByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  seedShownAt: Date,
  revoked: {
    type: Boolean,
    default: false
  }
});

walletSchema.index({ userId: 1, revoked: 1 });
walletSchema.index({ address: 1 });

module.exports = mongoose.model('Wallet', walletSchema);
