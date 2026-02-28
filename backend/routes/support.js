'use strict';
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const logger = require('../core/logger');

// POST /api/support — submit a support ticket (auth required)
router.post('/', auth, async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !subject.trim()) return res.status(400).json({ message: 'Subject is required.' });
    if (!message || !message.trim()) return res.status(400).json({ message: 'Message is required.' });
    if (subject.trim().length > 120) return res.status(400).json({ message: 'Subject too long (max 120 chars).' });
    if (message.trim().length > 2000) return res.status(400).json({ message: 'Message too long (max 2000 chars).' });

    const user = await User.findById(req.userId).select('name email').lean();
    const ticket = await SupportTicket.create({
      userId: req.userId,
      name:  user?.name  || '',
      email: user?.email || '',
      subject: subject.trim(),
      message: message.trim(),
    });

    logger.info('support_ticket_created', { ticketId: ticket._id, userId: req.userId });
    res.status(201).json({ message: 'Support ticket submitted.', ticketId: ticket._id });
  } catch (err) {
    logger.error('Error creating support ticket', { message: err.message });
    res.status(500).json({ message: 'Failed to submit support ticket.' });
  }
});

module.exports = router;
