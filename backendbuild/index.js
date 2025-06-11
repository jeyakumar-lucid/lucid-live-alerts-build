// index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const alertRoutes = require('./routes/alertRoutes');
const authRoutes = require('./routes/authRoutes');
const Alert = require('./models/Alert');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Store active SSE connections
const activeConnections = new Map();

// Routes
app.use('/api/alerts', alertRoutes);
app.use('/api/auth', authRoutes);

// Connect to MongoDB
const MONGODB_URI = 'mongodb://127.0.0.1:27017/alerts';
console.log('Attempting to connect to MongoDB at:', MONGODB_URI);

mongoose.connect(MONGODB_URI)
.then(() => {
    console.log('Connected to MongoDB');
    const PORT = process.env.PORT || 3002;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
  });
})
  .catch((error) => {
    console.error('MongoDB connection error:', error);
});

module.exports = app;
