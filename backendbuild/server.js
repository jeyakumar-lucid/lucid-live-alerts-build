const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const httpServer = createServer(app);

// Debug logging
console.log('Starting server with environment:');
console.log('PORT:', process.env.PORT);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:81',
  'http://localhost:3000',
  'http://localhost:3003',  // Add localhost:3003
  'http://localhost:82',
  'https://notification-app-frontend.onrender.com' // Added deployed frontend
].filter(Boolean);

console.log('Allowed Origins:', allowedOrigins);

app.use(cors({
  origin: function(origin, callback) {
    console.log('Incoming request from origin:', origin);
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      console.log('Origin rejected:', origin);
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    console.log('Origin accepted:', origin);
    return callback(null, true);
  },
  credentials: true
}));

// Routes
const authRoutes = require('./routes/authRoutes');
const alertRoutes = require('./routes/alertRoutes');

// Mount routes with /api prefix
app.use('/api/auth', authRoutes);
app.use('/api/alerts', alertRoutes);

// Serve static files from the React app build
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'Live Alerts API is running',
    mongoStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// SSE endpoint with dynamic CORS headers
app.get('/api/alerts/events/:userId', (req, res) => {
  const allowedOrigins = [
    process.env.FRONTEND_URL,
    'http://localhost:81',
    'http://localhost:3000',
    'http://localhost:3003',
    'http://localhost:82',
    'https://notification-app-frontend.onrender.com' // Added deployed frontend
  ].filter(Boolean);
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  // Existing SSE setup code here
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/alerts')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: err.message || 'Something went wrong!' });
});

// Catch-all handler: for any request that doesn't match an API route, send back React's index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

const PORT = process.env.PORT || 82;
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});