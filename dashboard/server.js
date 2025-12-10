const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const database = require('../database/database');
const AIBrain = require('../ai/brain');
const logger = require('../logs/logger');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rotas API
app.get('/api/stats', (req, res) => {
    try {
        const dbStats = database.getStats();
        const aiStats = AIBrain.getStats();
        
        res.json({
            success: true,
            data: {
                database: dbStats,
                ai: aiStats,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Error getting stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/conversations/:phone?', (req, res) => {
    try {
        const phone = req.params.phone || 'all';
        const limit = parseInt(req.query.limit) || 50;
        
        const conversations = phone === 'all' 
            ? database.db.prepare('SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ?').all(limit)
            : database.getConversationHistory(phone, limit);
        
        res.json({
            success: true,
            data: conversations
        });
    } catch (error) {
        logger.error('Error getting conversations:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/training', (req, res) => {
    try {
        const trainingData = database.getTrainingData();
        
        res.json({
            success: true,
            data: trainingData
        });
    } catch (error) {
        logger.error('Error getting training data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/training', (req, res) => {
    try {
        const { input, output } = req.body;
        
        if (!input || !output) {
            return res.status(400).json({ success: false, error: 'Input and output required' });
        }
        
        AIBrain.learn(input, output, true);
        
        res.json({
            success: true,
            message: 'Training data added successfully'
        });
    } catch (error) {
        logger.error('Error adding training data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Socket.IO para tempo real
io.on('connection', (socket) => {
    logger.info('📡 Dashboard connected');
    
    socket.on('disconnect', () => {
        logger.info('📡 Dashboard disconnected');
    });
});

// Página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
server.listen(PORT, () => {
    logger.info(`🌐 Dashboard running on http://localhost:${PORT}`);
    logger.info(`📊 Access dashboard at http://localhost:${PORT}/dashboard`);
});

module.exports = { app, server, io };