/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║   WHATSAPP BOT AI - BLACKCORE v1.0 - ENTERPRISE EDITION  ║
 * ║   Sistema Profissional de Atendimento Inteligente        ║
 * ║   Desenvolvido por: Octávio - BLACKCORE                  ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const WhatsAppBot = require('./modules/whatsapp');
const AITrainer = require('./ai/trainer');
const database = require('./database/database');
const AIBrain = require('./ai/brain');
const logger = require('./logs/logger');
const security = require('./security/encryption');

// ============================================
// CONFIGURAÇÃO E INICIALIZAÇÃO
// ============================================

class BotServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.PORT = process.env.PORT || 3000;
        this.whatsappBot = null;
        this.config = null;
        this.configManager = null;
        this.startTime = Date.now();
        this.connectedClients = new Set();
        this.metrics = {
            requests: 0,
            errors: 0,
            messagesSent: 0,
            messagesReceived: 0
        };

        this.init();
    }

    // ============================================
    // INICIALIZAÇÃO DO SERVIDOR
    // ============================================
    
    async init() {
        try {
            this.loadConfiguration();
            this.setupMiddleware();
            this.setupRoutes();
            this.setupSocketIO();
            this.setupErrorHandlers();
            await this.startServer();
        } catch (error) {
            logger.error('Fatal initialization error:', error);
            process.exit(1);
        }
    }

    // Carregar configurações
    loadConfiguration() {
        try {
            const configPath = path.join(__dirname, 'config', 'bot.config.json');
            this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            // Criar ConfigManager
            const ConfigManager = require('./config/config-manager');
            this.configManager = ConfigManager;
            
            logger.info('✅ Configuration loaded successfully');
        } catch (error) {
            logger.error('Error loading configuration:', error);
            throw error;
        }
    }

    // ============================================
    // MIDDLEWARE
    // ============================================
    
    setupMiddleware() {
        // Body parser
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            
            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });

        // Request logging
        this.app.use((req, res, next) => {
            const start = Date.now();
            this.metrics.requests++;
            
            res.on('finish', () => {
                const duration = Date.now() - start;
                logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
            });
            
            next();
        });

        // Rate limiting básico
        this.app.use((req, res, next) => {
            const ip = req.ip || req.connection.remoteAddress;
            
            if (!security.checkRateLimit(ip, 100)) { // 100 req/min por IP
                return res.status(429).json({
                    success: false,
                    error: 'Rate limit exceeded'
                });
            }
            
            next();
        });

        // Static files
        this.app.use(express.static(path.join(__dirname, 'dashboard', 'public')));

        logger.info('✅ Middleware configured');
    }

    // ============================================
    // ROTAS DA API
    // ============================================
    
    setupRoutes() {
        const router = express.Router();

        // ============ HEALTH CHECK ============
        router.get('/health', (req, res) => {
            const uptime = Date.now() - this.startTime;
            const botStatus = this.whatsappBot ? this.whatsappBot.getStatus() : { isReady: false };
            
            res.json({
                success: true,
                status: 'online',
                uptime: uptime,
                uptimeFormatted: this.formatUptime(uptime),
                bot: botStatus,
                metrics: this.metrics,
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            });
        });

        // ============ ESTATÍSTICAS ============
        router.get('/stats', (req, res) => {
            try {
                const dbStats = database.getStats();
                const aiStats = AIBrain.getStats();
                const botStatus = this.whatsappBot ? this.whatsappBot.getStatus() : { isReady: false };
                
                res.json({
                    success: true,
                    data: {
                        database: dbStats,
                        ai: aiStats,
                        bot: botStatus,
                        server: {
                            uptime: Date.now() - this.startTime,
                            requests: this.metrics.requests,
                            errors: this.metrics.errors,
                            connectedClients: this.connectedClients.size
                        },
                        timestamp: new Date().toISOString()
                    }
                });
            } catch (error) {
                logger.error('Error getting stats:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ CONVERSAS ============
        router.get('/conversations', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const offset = parseInt(req.query.offset) || 0;
                
                const conversations = database.db.prepare(
                    'SELECT * FROM conversations ORDER BY timestamp DESC LIMIT ? OFFSET ?'
                ).all(limit, offset);
                
                const total = database.db.prepare('SELECT COUNT(*) as count FROM conversations').get();
                
                res.json({
                    success: true,
                    data: conversations,
                    pagination: {
                        limit,
                        offset,
                        total: total.count,
                        hasMore: (offset + limit) < total.count
                    }
                });
            } catch (error) {
                logger.error('Error getting conversations:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.get('/conversations/:phone', (req, res) => {
            try {
                const phone = req.params.phone;
                const limit = parseInt(req.query.limit) || 50;
                
                const conversations = database.getConversationHistory(phone, limit);
                const userContext = database.getUserContext(phone);
                
                res.json({
                    success: true,
                    data: {
                        conversations,
                        userContext
                    }
                });
            } catch (error) {
                logger.error('Error getting conversation:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ TREINAMENTO IA ============
        router.get('/training', (req, res) => {
            try {
                const trainingData = database.getTrainingData();
                
                res.json({
                    success: true,
                    data: trainingData,
                    total: trainingData.length
                });
            } catch (error) {
                logger.error('Error getting training data:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.post('/training', async (req, res) => {
            try {
                const { input, output } = req.body;
                
                if (!input || !output) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Input and output required' 
                    });
                }
                
                await AIBrain.learn(input, output, true);
                
                // Notificar clientes conectados
                this.io.emit('training-updated', { input, output });
                
                res.json({
                    success: true,
                    message: 'Training data added successfully'
                });
            } catch (error) {
                logger.error('Error adding training data:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.delete('/training/:id', async (req, res) => {
            try {
                const id = parseInt(req.params.id);
                
                database.db.prepare('DELETE FROM ai_training WHERE id = ?').run(id);
                AIBrain.loadTrainingData();
                
                res.json({
                    success: true,
                    message: 'Training data deleted'
                });
            } catch (error) {
                logger.error('Error deleting training data:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ CONFIGURAÇÃO ============
        router.get('/config', (req, res) => {
            try {
                const config = this.configManager.getConfig();
                res.json({ success: true, data: config });
            } catch (error) {
                logger.error('Error getting config:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.post('/config', async (req, res) => {
    try {
        const result = this.configManager.saveConfig(req.body);
        
        if (result.success) {
            // Recarregar configuração do bot (HOT RELOAD!)
            this.config = this.configManager.getConfig();
            
            // 🔥 ATUALIZAR BOT SEM REINICIAR
            if (this.whatsappBot && this.whatsappBot.isReady) {
                this.whatsappBot.reloadConfig(this.config);
                logger.info('🔥 HOT RELOAD: Bot configuration updated without restart!');
            }
            
            // Notificar clientes
            this.io.emit('config-updated', this.config);
        }
        
        res.json(result);
    } catch (error) {
        logger.error('Error saving config:', error);
        this.metrics.errors++;
        res.status(500).json({ success: false, error: error.message });
    }
});

        router.patch('/config/mode', async (req, res) => {
            try {
                const { mode } = req.body;
                const result = this.configManager.updateMode(mode);
                
                if (result.success) {
                    this.config = this.configManager.getConfig();
                    this.io.emit('mode-changed', { mode });
                }
                
                res.json(result);
            } catch (error) {
                logger.error('Error updating mode:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Departamentos
        router.post('/config/departments', async (req, res) => {
            try {
                const result = this.configManager.addDepartment(req.body);
                if (result.success) {
                    this.config = this.configManager.getConfig();
                    this.io.emit('departments-updated');
                }
                res.json(result);
            } catch (error) {
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.put('/config/departments/:id', async (req, res) => {
            try {
                const deptId = parseInt(req.params.id);
                const result = this.configManager.updateDepartment(deptId, req.body);
                if (result.success) {
                    this.config = this.configManager.getConfig();
                    this.io.emit('departments-updated');
                }
                res.json(result);
            } catch (error) {
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.delete('/config/departments/:id', async (req, res) => {
            try {
                const deptId = parseInt(req.params.id);
                const result = this.configManager.removeDepartment(deptId);
                if (result.success) {
                    this.config = this.configManager.getConfig();
                    this.io.emit('departments-updated');
                }
                res.json(result);
            } catch (error) {
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Backups
        router.get('/config/backups', (req, res) => {
            try {
                const backups = this.configManager.listBackups();
                res.json({ success: true, data: backups });
            } catch (error) {
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.post('/config/restore', async (req, res) => {
            try {
                const { filename } = req.body;
                const result = this.configManager.restoreBackup(filename);
                
                if (result.success) {
                    this.config = this.configManager.getConfig();
                    this.io.emit('config-restored');
                }
                
                res.json(result);
            } catch (error) {
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ USUÁRIOS ============
        router.get('/users', (req, res) => {
            try {
                const users = database.db.prepare(
                    'SELECT * FROM user_context ORDER BY last_interaction DESC'
                ).all();
                
                res.json({
                    success: true,
                    data: users,
                    total: users.length
                });
            } catch (error) {
                logger.error('Error getting users:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.get('/users/:phone', (req, res) => {
            try {
                const phone = req.params.phone;
                const userContext = database.getUserContext(phone);
                const conversations = database.getConversationHistory(phone, 100);
                
                res.json({
                    success: true,
                    data: {
                        context: userContext,
                        conversations: conversations
                    }
                });
            } catch (error) {
                logger.error('Error getting user:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ SESSÕES ============
        router.get('/sessions', (req, res) => {
            try {
                const sessions = database.db.prepare(
                    'SELECT * FROM sessions WHERE status = ? ORDER BY started_at DESC',
                ).all('active');
                
                res.json({
                    success: true,
                    data: sessions,
                    total: sessions.length
                });
            } catch (error) {
                logger.error('Error getting sessions:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.delete('/sessions/:sessionId', (req, res) => {
            try {
                const sessionId = req.params.sessionId;
                database.closeSession(sessionId);
                
                res.json({
                    success: true,
                    message: 'Session closed'
                });
            } catch (error) {
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ MÉTRICAS AVANÇADAS ============
        router.get('/metrics', (req, res) => {
            try {
                const timeRange = req.query.range || '24h'; // 1h, 24h, 7d, 30d
                
                // Métricas de conversas por período
                const conversationsMetrics = this.getConversationsMetrics(timeRange);
                
                // Métricas de sentimento
                const sentimentMetrics = database.db.prepare(`
                    SELECT sentiment, COUNT(*) as count 
                    FROM conversations 
                    WHERE sentiment IS NOT NULL 
                    GROUP BY sentiment
                `).all();
                
                // Métricas de departamentos
                const departmentMetrics = database.db.prepare(`
                    SELECT department_id, COUNT(*) as count 
                    FROM conversations 
                    WHERE department_id IS NOT NULL 
                    GROUP BY department_id
                `).all();
                
                res.json({
                    success: true,
                    data: {
                        conversations: conversationsMetrics,
                        sentiment: sentimentMetrics,
                        departments: departmentMetrics,
                        server: this.metrics
                    }
                });
            } catch (error) {
                logger.error('Error getting metrics:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ ENVIAR MENSAGEM MANUAL ============
        router.post('/send-message', async (req, res) => {
            try {
                const { phone, message } = req.body;
                
                if (!phone || !message) {
                    return res.status(400).json({
                        success: false,
                        error: 'Phone and message required'
                    });
                }
                
                if (!this.whatsappBot || !this.whatsappBot.isReady) {
                    return res.status(503).json({
                        success: false,
                        error: 'WhatsApp bot not ready'
                    });
                }
                
                const result = await this.whatsappBot.sendMessage(phone, message);
                
                if (result) {
                    this.metrics.messagesSent++;
                    res.json({
                        success: true,
                        message: 'Message sent successfully'
                    });
                } else {
                    throw new Error('Failed to send message');
                }
            } catch (error) {
                logger.error('Error sending message:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ BROADCAST ============
        router.post('/broadcast', async (req, res) => {
            try {
                const { message, phones } = req.body;
                
                if (!message || !phones || !Array.isArray(phones)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Message and phones array required'
                    });
                }
                
                if (!this.whatsappBot || !this.whatsappBot.isReady) {
                    return res.status(503).json({
                        success: false,
                        error: 'WhatsApp bot not ready'
                    });
                }
                
                const results = [];
                for (const phone of phones) {
                    const result = await this.whatsappBot.sendMessage(phone, message);
                    results.push({ phone, success: result });
                    
                    // Delay entre mensagens para evitar ban
                    await this.sleep(2000);
                }
                
                const successCount = results.filter(r => r.success).length;
                this.metrics.messagesSent += successCount;
                
                res.json({
                    success: true,
                    message: `Broadcast sent to ${successCount}/${phones.length} contacts`,
                    results
                });
            } catch (error) {
                logger.error('Error broadcasting:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ LOGS ============
        router.get('/logs', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 100;
                const level = req.query.level || 'all';
                
                const logFile = path.join(__dirname, 'logs', 'combined.log');
                const logs = fs.readFileSync(logFile, 'utf8')
                    .split('\n')
                    .filter(line => line.trim())
                    .slice(-limit)
                    .reverse();
                
                res.json({
                    success: true,
                    data: logs,
                    total: logs.length
                });
            } catch (error) {
                logger.error('Error getting logs:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ EXPORTAR DADOS ============
        router.get('/export/conversations', (req, res) => {
            try {
                const conversations = database.db.prepare(
                    'SELECT * FROM conversations ORDER BY timestamp DESC'
                ).all();
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="conversations-${Date.now()}.json"`);
                res.send(JSON.stringify(conversations, null, 2));
            } catch (error) {
                logger.error('Error exporting conversations:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.get('/export/training', (req, res) => {
            try {
                const training = database.getTrainingData();
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="training-${Date.now()}.json"`);
                res.send(JSON.stringify(training, null, 2));
            } catch (error) {
                logger.error('Error exporting training:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ============ CONTROLE DO BOT ============
        router.post('/bot/restart', async (req, res) => {
            try {
                logger.info('🔄 Restarting bot...');
                
                if (this.whatsappBot) {
                    await this.whatsappBot.stop();
                }
                
                this.whatsappBot = new WhatsAppBot(this.config);
                await this.whatsappBot.start();
                
                res.json({
                    success: true,
                    message: 'Bot restarted successfully'
                });
            } catch (error) {
                logger.error('Error restarting bot:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        router.post('/bot/stop', async (req, res) => {
            try {
                if (this.whatsappBot) {
                    await this.whatsappBot.stop();
                    this.whatsappBot = null;
                }
                
                res.json({
                    success: true,
                    message: 'Bot stopped'
                });
            } catch (error) {
                logger.error('Error stopping bot:', error);
                this.metrics.errors++;
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Montar rotas com prefixo /api
        this.app.use('/api', router);

        // ============ PÁGINAS HTML ============
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'dashboard', 'public', 'index.html'));
        });

        this.app.get('/dashboard', (req, res) => {
            res.sendFile(path.join(__dirname, 'dashboard', 'public', 'index.html'));
        });

        this.app.get('/config.html', (req, res) => {
            res.sendFile(path.join(__dirname, 'dashboard', 'public', 'config.html'));
        });

        // 404 Handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                path: req.path
            });
        });

        logger.info('✅ Routes configured');
    }

    // ============================================
    // WEBSOCKET / SOCKET.IO
    // ============================================
    
    setupSocketIO() {
        this.io.on('connection', (socket) => {
            this.connectedClients.add(socket.id);
            logger.info(`📡 Client connected: ${socket.id} (Total: ${this.connectedClients.size})`);
            
            // Enviar status inicial
            socket.emit('initial-status', {
                bot: this.whatsappBot ? this.whatsappBot.getStatus() : { isReady: false },
                stats: database.getStats(),
                config: this.config
            });
            
            // Ping/Pong para manter conexão
            const pingInterval = setInterval(() => {
                socket.emit('ping', { timestamp: Date.now() });
            }, 30000);
            
            socket.on('pong', (data) => {
                // Cliente respondeu
            });
            
            socket.on('disconnect', () => {
                clearInterval(pingInterval);
                this.connectedClients.delete(socket.id);
                logger.info(`📡 Client disconnected: ${socket.id} (Total: ${this.connectedClients.size})`);
            });
            
            // Eventos customizados
            socket.on('request-stats', () => {
                socket.emit('stats-update', {
                    db: database.getStats(),
                    ai: AIBrain.getStats(),
                    server: this.metrics
                });
            });
        });
        
        // Broadcast periódico de estatísticas
        setInterval(() => {
            if (this.connectedClients.size > 0) {
                this.io.emit('stats-update', {
                    db: database.getStats(),
                    ai: AIBrain.getStats(),
                    server: this.metrics,
                    timestamp: new Date().toISOString()
                });
            }
        }, 10000); // A cada 10 segundos
        
        logger.info('✅ Socket.IO configured');
    }

    // ============================================
    // ERROR HANDLERS
    // ============================================
    
    setupErrorHandlers() {
        // Express error handler
        this.app.use((err, req, res, next) => {
            logger.error('Express error:', err);
            this.metrics.errors++;
            
            res.status(err.status || 500).json({
                success: false,
                error: err.message || 'Internal server error',
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
            });
        });
        
        // Process error handlers
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            this.metrics.errors++;
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
            this.metrics.errors++;
        });
        
        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info(`\n🛑 ${signal} received. Shutting down gracefully...`);
            
            // Parar de aceitar novas conexões
            this.server.close(() => {
                logger.info('✅ HTTP server closed');
            });
            
            // Desconectar todos os clientes WebSocket
            this.io.close(() => {
                logger.info('✅ Socket.IO closed');
            });
            
            // Parar bot do WhatsApp
            if (this.whatsappBot) {
                await this.whatsappBot.stop();
                logger.info('✅ WhatsApp bot stopped');
            }
            
            // Fechar conexões de banco de dados
            if (database.db) {
                database.db.close();
                logger.info('✅ Database closed');
            }
            
            logger.info('👋 Shutdown complete. Goodbye!');
            process.exit(0);
        };
        
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        
        logger.info('✅ Error handlers configured');
    }

    // ============================================
    // START SERVER
    // ============================================
    
    async startServer() {
        try {
            // Iniciar servidor HTTP
            this.server.listen(this.PORT, () => {
                logger.info(`🌐 Dashboard running on http://localhost:${this.PORT}`);
                logger.info(`📊 Access dashboard at http://localhost:${this.PORT}/dashboard`);
                console.log(`\n🌐 Dashboard disponível em: http://localhost:${this.PORT}\n`);
            });
            
            // Treinar IA inicial
            logger.info('🧠 Checking AI training data...');
            const trainingCount = await AITrainer.seedInitialTraining();
            
            if (trainingCount > 0) {
                logger.info(`✅ AI trained with ${trainingCount} examples`);
            }
            
            // Inicializar bot do WhatsApp
            logger.info('📱 Initializing WhatsApp Bot...');
            this.whatsappBot = new WhatsAppBot(this.config);
            await this.whatsappBot.start();
            
            // Iniciar limpeza automática de segurança
            security.startCleanupInterval();
            
            // Banner de sucesso
            this.printSuccessBanner();
            
        } catch (error) {
            logger.error('Failed to start server:', error);
            throw error;
        }
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    getConversationsMetrics(timeRange) {
        const ranges = {
            '1h': 3600000,
            '24h': 86400000,
            '7d': 604800000,
            '30d': 2592000000
        };
        
        const ms = ranges[timeRange] || ranges['24h'];
        const since = Date.now() - ms;
        
        const count = database.db.prepare(
            "SELECT COUNT(*) as count FROM conversations WHERE timestamp > datetime(?, 'unixepoch', 'localtime')"
        ).get(since / 1000);
        
        return {
            timeRange,
            count: count.count,
            since: new Date(since).toISOString()
        };
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printSuccessBanner() {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║    ✅ SISTEMA INICIADO COM SUCESSO!                      ║
║    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   ║
║                                                           ║
║    🌐 Dashboard: http://localhost:${this.PORT}                  ║
║    ⚙️  Configurações: http://localhost:${this.PORT}/config.html   ║
║    📊 API Docs: http://localhost:${this.PORT}/api/health        ║
║                                                           ║
║    🤖 WhatsApp Bot: ${this.whatsappBot?.isReady ? 'ONLINE ✅' : 'CONNECTING... ⏳'}     ║
║    🧠 IA Treinada: ${AIBrain.getStats().trainingDataCount} exemplos              ║
║    👥 Usuários: ${database.getStats().totalUsers}                               ║
║                                                           ║
║    📱 Escaneie o QR Code com WhatsApp para conectar     ║
║    🛑 Pressione CTRL+C para parar o sistema             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
        
        logger.info('✅ System fully operational!');
    }
}

// ============================================
// INICIAR APLICAÇÃO
// ============================================

// Banner inicial
console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║    🤖 WHATSAPP BOT AI - BLACKCORE v1.0                   ║
║    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   ║
║                                                           ║
║    📱 Bot Inteligente com IA Local                       ║
║    🧠 Aprendizado Contínuo                               ║
║    🔒 Segurança Militar                                  ║
║    ⚡ Ultra Modular & Enterprise Grade                   ║
║                                                           ║
║    Desenvolvido por: Octávio - BLACKCORE                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

🚀 Inicializando sistema...
`);

// Criar e iniciar servidor
const botServer = new BotServer();

// Exportar para testes (opcional)
module.exports = BotServer;