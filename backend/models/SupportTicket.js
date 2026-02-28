'use strict';
const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  name:     { type: String, default: '' },
  email:    { type: String, default: '' },
  subject:  { type: String, required: true },
  message:  { type: String, required: true },
  status:   { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
  adminNote:{ type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);
