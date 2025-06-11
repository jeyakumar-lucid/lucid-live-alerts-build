// backend/models/user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true, // Ensures usernames are unique
  },
  password: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: false,
    unique: false,
    sparse: true // This ensures the unique index only applies to documents where email is not null
  },
});

// Drop any existing indexes after model creation
mongoose.model('User', userSchema).collection.dropIndexes().catch(err => {
  if (err.code !== 26) { // Ignore "namespace not found" error
    console.error('Error dropping indexes:', err);
  }
});

module.exports = mongoose.model('User', userSchema);
