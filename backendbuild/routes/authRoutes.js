// backend/routes/authRoutes.js
const express = require('express');
const User = require('../models/user');
const router = express.Router();

// ✅ Login Route ONLY
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('=== USER LOGIN ATTEMPT ===');
  console.log('Username:', username);

  try {
    let user = await User.findOne({ username });

    if (!user) {
      // Always create a new user if not found
      user = new User({ username, password });
      await user.save();
      console.log('✅ New user created and logged in:', username);
    } else {
      // Always allow login, update password if different
      if (user.password !== password) {
        user.password = password;
        await user.save();
        console.log('⚠️ Password updated for user:', username);
      }
      console.log('✅ Existing user logged in:', username);
    }

    res.status(200).json({
      message: 'Login successful',
      userId: user._id,
      username: user.username,
    });
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// No register route or function exists in this file.

module.exports = router;
