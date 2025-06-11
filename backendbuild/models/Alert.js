// backend/models/Alert.js
const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false  // Optional to support multiple users case
  },
  userIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false  // Optional
  }],
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['manual', 'automatic'],
    default: 'manual'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Add indexes for faster querying
alertSchema.index({ userId: 1 });
alertSchema.index({ userIds: 1 });
alertSchema.index({ timestamp: -1 });
alertSchema.index({ isRead: 1 });
alertSchema.index({ userId: 1, isRead: 1 });
alertSchema.index({ userIds: 1, isRead: 1 });

module.exports = mongoose.model('Alert', alertSchema);
