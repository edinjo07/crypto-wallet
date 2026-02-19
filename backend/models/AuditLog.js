const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actorType: {
    type: String,
    enum: ['admin', 'user', 'system'],
    required: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  action: {
    type: String,
    required: true
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  targetWalletId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  network: {
    type: String,
    default: null
  },
  ip: String,
  userAgent: String,
  success: {
    type: Boolean,
    default: true
  },
  details: {
    type: Object,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ network: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
