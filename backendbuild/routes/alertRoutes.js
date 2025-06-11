// routes/alertRoutes.js
const express = require('express');
const Alert = require('../models/Alert');
const User = require('../models/user');
const mongoose = require('mongoose');
const router = express.Router();

// Store connected clients for SSE with better structure
const clients = new Map();

// Store auto-notification interval
let autoNotificationInterval = null;

// SSE endpoint for clients to connect
router.get('/events/:userId', (req, res) => {
  const userId = req.params.userId;
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  console.log('🔌 New SSE connection established for user:', userId);

  // Initialize user's connections array if it doesn't exist
  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }

  // Add this connection to the user's set of connections
  clients.get(userId).add(res);
  console.log(`Current connected users: ${Array.from(clients.keys()).join(', ')}`);
  console.log(`Active connections for user ${userId}: ${clients.get(userId).size}`);

  // Send initial connection success message
  const connectionMsg = {
    type: 'connected',
    message: 'SSE Connection established'
  };
  res.write(`data: ${JSON.stringify(connectionMsg)}\n\n`);

  // Send a heartbeat to keep the connection alive
  const heartbeat = setInterval(() => {
    if (res.closed || res.writableEnded || res.destroyed) {
      clearInterval(heartbeat);
      return;
    }
    res.write(': heartbeat\n\n');
  }, 10000); // Every 10 seconds

  // Remove client when they disconnect
  req.on('close', () => {
    console.log('❌ SSE connection closed for user:', userId);
    
    // Remove this specific connection
    const userConnections = clients.get(userId);
    if (userConnections) {
      userConnections.delete(res);
      
      // If no more connections for this user, remove the user entry
      if (userConnections.size === 0) {
    clients.delete(userId);
      }
    }
    
    clearInterval(heartbeat);
    console.log(`Remaining connected users: ${Array.from(clients.keys()).join(', ')}`);
  });
});

// Close SSE connection
router.get('/events/close', (req, res) => {
  res.status(200).send('SSE connection closed');
});

// ✅ GET alerts for user (query param)
router.get('/', async (req, res) => {
  const { userId, page = 1, limit = 50 } = req.query;
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get total count for pagination info
    const totalCount = await Alert.countDocuments({
      $or: [{ userId }, { userIds: userId }]
    });

    // Get paginated alerts
    const alerts = await Alert.find({
      $or: [{ userId }, { userIds: userId }]
    })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    res.json({
      alerts,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
      totalAlerts: totalCount
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch alerts' });
  }
});

// ✅ GET alerts for user (path param)
router.get('/:userId', async (req, res) => {
  const { page = 1, limit = 50, filter = 'all' } = req.query;
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const userIdRaw = req.params.userId;
    const userIdObj = mongoose.Types.ObjectId.isValid(userIdRaw)
      ? new mongoose.Types.ObjectId(userIdRaw)
      : userIdRaw;

    // Build base query
    const baseQuery = {
      $or: [{ userId: userIdObj }, { userIds: userIdObj }]
    };

    // Add isRead filter if needed
    if (filter === 'unread') {
      baseQuery.isRead = false;
    } else if (filter === 'read') {
      baseQuery.isRead = true;
    }

    // Use Promise.all to run queries concurrently
    const [alerts, counts] = await Promise.all([
      Alert.find(baseQuery)
        .select('_id message type isRead timestamp') // Only select needed fields
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(), // Use lean() for better performance

      Alert.aggregate([
        { $match: { $or: [{ userId: userIdObj }, { userIds: userIdObj }] } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            read: { 
              $sum: { 
                $cond: [{ $eq: ['$isRead', true] }, 1, 0]
              }
            },
            unread: { 
              $sum: { 
                $cond: [{ $eq: ['$isRead', false] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);

    const stats = counts[0] || { total: 0, read: 0, unread: 0 };

    res.json({
      alerts,
      currentPage: parseInt(page),
      totalPages: Math.ceil(stats.total / parseInt(limit)),
      stats: {
        total: stats.total,
        read: stats.read,
        unread: stats.unread
      }
    });
  } catch (err) {
    console.error('Error fetching alerts:', err);
    res.status(500).json({ message: 'Failed to fetch alerts' });
  }
});

// Create a new alert
router.post('/', async (req, res) => {
  try {
    const { userId, message, type } = req.body;
    
    // Validate required fields
    if (!message || !type) {
      return res.status(400).json({ message: 'Message and type are required' });
    }

    // Create alert data
    const alertData = {
      message,
      type,
      isRead: false,
      timestamp: new Date(),
      ...(userId && { userId, userIds: [userId] })
    };

    // Save the alert to the database
    const alert = new Alert(alertData);
    await alert.save();

    // Function to send alert to a specific client connection
    const sendAlertToClient = (clientRes) => {
      try {
        if (!clientRes.closed) {
          clientRes.write(`data: ${JSON.stringify(alert)}\n\n`);
        }
      } catch (error) {
        console.error('Error sending to client:', error);
      }
    };

    if (!userId) {
      // Broadcast to ALL connected clients when userId is null
      console.log('Broadcasting to all connected clients');
      let totalConnections = 0;
      
      // Iterate through all users
      for (const [userId, userConnections] of clients.entries()) {
        console.log(`Sending to user ${userId} with ${userConnections.size} connections`);
        userConnections.forEach(clientRes => {
          sendAlertToClient(clientRes);
          totalConnections++;
        });
      }
      
      console.log(`Broadcast complete. Sent to ${totalConnections} connections`);
    } else {
      // Send only to the specified user's connections
      const userConnections = clients.get(userId);
      if (userConnections) {
        console.log(`Sending to user ${userId} with ${userConnections.size} connections`);
        userConnections.forEach(clientRes => {
          sendAlertToClient(clientRes);
        });
      }
    }

    res.status(201).json(alert);
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ message: 'Failed to create alert' });
  }
});

// Set auto-notification interval
router.post('/set-interval', async (req, res) => {
  try {
    const { interval } = req.body;
    
    if (!interval || isNaN(interval) || interval < 1) {
      return res.status(400).json({ message: 'Invalid interval' });
    }

    // Clear existing interval if any
    if (autoNotificationInterval) {
      clearInterval(autoNotificationInterval);
    }

    // Set new interval
    autoNotificationInterval = setInterval(async () => {
      const allUsers = await User.find({});
      const targetUserIds = allUsers.map(user => user._id);

      const alertData = {
        message: `Automatic notification at ${new Date().toLocaleString()}`,
        type: 'automatic',
        isRead: false,
        timestamp: new Date(),
        userIds: targetUserIds,
        userId: targetUserIds[0]
      };

      const alert = new Alert(alertData);
      await alert.save();

      // Send to all connected clients
      clients.forEach((client, clientId) => {
        client.forEach((clientRes) => {
          sendAlertToClient(clientRes);
        });
      });
    }, interval * 60 * 1000); // Convert minutes to milliseconds

    res.status(200).json({ message: `Auto-notification interval set to ${interval} minutes` });
  } catch (err) {
    console.error('Error setting interval:', err);
    res.status(400).json({ message: 'Failed to set interval' });
  }
});

// ✅ Mark one alert as read
router.patch('/:id/read', async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }
    alert.isRead = true;
    await alert.save();
    res.json(alert);
  } catch (err) {
    res.status(500).json({ message: 'Failed to mark alert as read' });
  }
});

// ✅ Mark all as read (body param)
router.put('/markAllAsRead', async (req, res) => {
  const { userId } = req.body;
  try {
    await Alert.updateMany(
      {
        $or: [
          { userId, isRead: false },
          { userIds: userId, isRead: false }
        ]
      },
      { $set: { isRead: true } }
    );
    res.status(200).json({ message: 'All alerts marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to mark alerts as read' });
  }
});

// ✅ Mark all as read (path param)
router.put('/:userId/read-all', async (req, res) => {
  try {
    await Alert.updateMany(
      {
        $or: [
          { userId: req.params.userId, isRead: false },
          { userIds: req.params.userId, isRead: false }
        ]
      },
      { $set: { isRead: true } }
    );
    res.status(200).json({ message: 'All alerts marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to mark alerts as read' });
  }
});

module.exports = router;
