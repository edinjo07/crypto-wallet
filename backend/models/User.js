const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  kycStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  kycReviewMessage: {
    type: String,
    default: ''
  },
  recoveryStatus: {
    type: String,
    enum: [
      'NO_KYC',
      'KYC_SUBMITTED',
      'KYC_PROCESSING',
      'KYC_MORE_DOCS',
      'KYC_APPROVED',
      'KYC_REJECTED',
      'SEED_READY',
      'SEED_REVEALED'
    ],
    default: 'NO_KYC'
  },
  kycData: {
    fullName: String,
    documentType: String,
    documentNumber: String,
    documentHash: String,
    // Identity document images
    idFrontUrl: String,
    idBackUrl: String,
    // Address verification
    addressDocType: String,   // 'bank_statement' | 'utility_bill'
    addressDocUrl: String,
    // Optional additional documents
    otherDocUrls: [String],
    submittedAt: Date
  },
  notifications: [{
    message: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['info', 'warning', 'error', 'success'],
      default: 'info'
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    read: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date
    }
  }],
  wallets: [{
    address: String,
    encryptedPrivateKey: String,
    encryptedDataKey: String,
    keyId: String,
    network: {
      type: String,
      enum: ['ethereum', 'polygon', 'bsc', 'bitcoin', 'btc'],
      default: 'ethereum'
    },
    watchOnly: {
      type: Boolean,
      default: false
    },
    label: {
      type: String,
      default: ''
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  refreshTokens: [{
    tokenHash: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
