const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const FlowEngine = require('./flow-engine');
const AIBrain = require('../ai/brain');
const database = require('../database/database');
const security = require('../security/encryption');
const logger = require('../logs/logger');

class WhatsAppBot {
    constructor(config) {
        this.config = config;
        this.client = null;
        this.isReady = false;
        this.activeSessions = new Map();
        this.messageQueue = [];
        
        // Inicializar Flow Engine
        this.flowEngine = new FlowEngine(config);
        
        this.initClient();
    }

    // Inicializar cliente WhatsApp
    initClient() {
        logger.info('🚀 Initializing WhatsApp Client...');

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './sessions'
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        this.setupEventHandlers();
    }

    // Configurar eventos do WhatsApp
    setupEventHandlers() {
        // QR Code para autenticação
        this.client.on('qr', (qr) => {
            logger.info('📱 QR Code received! Scan with WhatsApp:');
            qrcode.generate(qr, { small: true });
            console.log('\n🔍 Ou acesse o dashboard em: http://localhost:3000\n');
        });

        // Cliente pronto
        this.client.on('ready', () => {
            this.isReady = true;
            logger.info('✅ WhatsApp Bot is READY!');
            logger.info(`📱 Bot Name: ${this.config.botName}`);
            logger.info(`🤖 Mode: ${this.config.mode.toUpperCase()}`);
            logger.info(`🔄 Flow Engine: ACTIVE`);
            
            // Iniciar limpeza automática
            security.startCleanupInterval();
        });

        // Autenticação
        this.client.on('authenticated', () => {
            logger.info('🔐 WhatsApp authenticated successfully!');
        });

        // Falha de autenticação
        this.client.on('auth_failure', (msg) => {
            logger.error('❌ Authentication failed:', msg);
        });

        // Desconectado
        this.client.on('disconnected', (reason) => {
            logger.warn('⚠️ WhatsApp disconnected:', reason);
            this.isReady = false;
        });

        // Receber mensagens
        this.client.on('message', async (message) => {
            await this.handleIncomingMessage(message);
        });

        // Mensagem criada (enviada pelo bot)
        this.client.on('message_create', async (message) => {
            if (message.fromMe) {
                await this.logBotMessage(message);
            }
        });
    }

    // ============================================
    // PROCESSAR MENSAGEM RECEBIDA
    // ============================================
    
    async handleIncomingMessage(message) {
        try {
            const from = message.from;
            const contact = await message.getContact();
            const chatName = contact.pushname || contact.number;
            const messageBody = message.body;

            // Ignorar mensagens de grupo e status
            if (message.isGroup || message.from === 'status@broadcast') {
                return;
            }

            // Ignorar mensagens do próprio bot
            if (message.fromMe) {
                return;
            }

            logger.info(`📩 Message from ${chatName} (${from}): ${messageBody}`);

            // Verificar rate limit
            if (!security.checkRateLimit(from, this.config.security.max_messages_per_minute)) {
                await this.sendMessage(from, '⚠️ Você está enviando mensagens muito rápido. Por favor, aguarde um momento.');
                return;
            }

            // Verificar se está bloqueado
            if (security.isBlocked(from)) {
                logger.warn(`🚫 Blocked number tried to send message: ${from}`);
                return;
            }

            // Sanitizar mensagem
            const sanitizedMessage = security.sanitizeInput(messageBody);

            // Obter ou criar sessão
            let session = this.getSession(from);
            if (!session) {
                session = this.createSession(from, chatName);
            }

            // Salvar mensagem no banco
            database.saveConversation(from, sanitizedMessage, 'user', null, null, session.id);

            // Obter contexto do usuário
            let userContext = database.getUserContext(from);
            if (!userContext) {
                userContext = {
                    phone: from,
                    name: chatName,
                    interaction_count: 0
                };
                database.saveUserContext(from, userContext);
            }

            // Processar comando especial
            if (sanitizedMessage.startsWith('/')) {
                await this.handleCommand(from, sanitizedMessage, session);
                return;
            }

            // Verificar horário de atendimento
            if (this.config.business_hours.enabled && !this.isBusinessHours()) {
                if (this.config.business_hours.auto_reply_offline) {
                    await this.sendMessage(from, this.config.business_hours.offline_message);
                }
                return;
            }

            // ============================================
            // PROCESSAR COM FLOW ENGINE
            // ============================================
            
            const flowResult = await this.flowEngine.processMessage(from, sanitizedMessage, userContext);
            
            await this.handleFlowResult(from, flowResult, session, userContext);

            // Atualizar sessão
            session.messagesCount++;
            session.lastInteraction = Date.now();
            database.updateSessionMessageCount(session.id);

        } catch (error) {
            logger.error('Error handling incoming message:', error);
            await this.sendMessage(message.from, '❌ Desculpe, ocorreu um erro. Tente novamente em instantes.');
        }
    }

    // ============================================
    // PROCESSAR RESULTADO DO FLOW ENGINE
    // ============================================
    
    async handleFlowResult(from, result, session, userContext) {
        try {
            // Se houver erro, transferir para humano
            if (result.error) {
                await this.sendMessage(from, result.message);
                await this.transferToHuman(from, session);
                return;
            }

            // Enviar mensagem
            if (result.message) {
                // Aplicar delay se especificado
                if (result.delay) {
                    await this.sleep(result.delay);
                }

                await this.sendMessage(from, result.message);
                
                // Salvar resposta do bot no banco
                const sentiment = result.sentiment?.classification || null;
                database.saveConversation(from, result.message, 'bot', sentiment, null, session.id);
            }

            // Processar ações especiais
            if (result.action) {
                await this.handleAction(from, result, session, userContext);
            }

            // Se deve continuar processando
            if (result.continue) {
                // Processar próximo step automaticamente
                const nextResult = await this.flowEngine.processMessage(from, '', userContext);
                if (nextResult && nextResult.message) {
                    await this.handleFlowResult(from, nextResult, session, userContext);
                }
            }

            // Se o fluxo foi reiniciado
            if (result.restart) {
                // Reiniciar fluxo do zero
                const initialResult = await this.flowEngine.processMessage(from, '', userContext);
                if (initialResult && initialResult.message) {
                    await this.sleep(1000);
                    await this.handleFlowResult(from, initialResult, session, userContext);
                }
            }

        } catch (error) {
            logger.error('Error handling flow result:', error);
            await this.sendMessage(from, 'Desculpe, houve um erro. Vou te conectar com um atendente.');
            await this.transferToHuman(from, session);
        }
    }

    // ============================================
    // PROCESSAR AÇÕES
    // ============================================
    
    async handleAction(from, result, session, userContext) {
        switch (result.action) {
            case 'transfer_human':
                await this.transferToHuman(from, session);
                break;

            case 'transfer_department':
                await this.transferToDepartment(from, result.departmentId, session, result.priority);
                break;

            case 'boleto_generated':
                // Aqui você implementaria integração real com API de boletos
                logger.info(`💰 Boleto generated for ${from}`);
                database.saveMetric('boleto_generated', {
                    phone: from,
                    timestamp: new Date().toISOString()
                });
                break;

            case 'send_email':
                // Aqui você implementaria integração com serviço de email
                logger.info(`📧 Email sent to ${userContext.email}`);
                break;

            default:
                logger.warn(`Unknown action: ${result.action}`);
        }
    }

    // ============================================
    // TRANSFERÊNCIAS
    // ============================================
    
    async transferToHuman(from, session) {
        logger.info(`🤝 Transferring ${from} to human attendant`);
        
        session.needsHuman = true;
        session.transferredAt = Date.now();
        
        // Notificar no log
        database.saveMetric('human_transfer', {
            phone: from,
            sessionId: session.id,
            timestamp: new Date().toISOString()
        });

        // Enviar notificação (aqui você integraria com sistema de notificações)
        logger.warn(`🔔 HUMAN TRANSFER REQUEST: ${from}`);
    }

    async transferToDepartment(from, departmentId, session, priority = 'normal') {
        const department = this.config.departments.find(d => d.id === departmentId);
        
        if (!department) {
            logger.error(`Department not found: ${departmentId}`);
            return;
        }

        logger.info(`📋 Transferring ${from} to department: ${department.name}`);
        
        session.department = departmentId;
        session.priority = priority;
        session.transferredAt = Date.now();

        // Salvar métrica
        database.saveMetric('department_transfer', {
            phone: from,
            department: department.name,
            departmentId: departmentId,
            priority: priority,
            timestamp: new Date().toISOString()
        });

        // Se houver número de transferência configurado
        if (department.transfer_number) {
            logger.info(`📞 Would transfer to ${department.transfer_number}`);
        }

        // Notificação de alta prioridade
        if (priority === 'high') {
            logger.warn(`🚨 HIGH PRIORITY TRANSFER: ${from} to ${department.name}`);
        }
    }

    // ============================================
    // COMANDOS ESPECIAIS
    // ============================================
    
    async handleCommand(from, command, session) {
        const cmd = command.toLowerCase();

        switch(cmd) {
            case '/menu':
                this.flowEngine.resetUserFlow(from);
                const menuResult = await this.flowEngine.processMessage(from, '', {});
                if (menuResult) {
                    await this.sendMessage(from, menuResult.message);
                }
                break;

            case '/status':
                const stats = database.getStats();
                const flowStats = this.flowEngine.getStats();
                await this.sendMessage(from, `📊 *Status do Sistema*\n\n` +
                    `Mensagens: ${stats.totalConversations}\n` +
                    `Usuários: ${stats.totalUsers}\n` +
                    `IA Treinada: ${stats.totalTrainingData} exemplos\n` +
                    `Modo: ${this.config.mode}\n` +
                    `Usuários ativos no fluxo: ${flowStats.activeUsers}`);
                break;

            case '/reset':
                this.flowEngine.resetUserFlow(from);
                AIBrain.clearContext();
                await this.sendMessage(from, '🔄 Conversa resetada! Vamos começar de novo.');
                break;

            case '/help':
                await this.sendMessage(from, 
                    '❓ *Comandos Disponíveis:*\n\n' +
                    '/menu - Voltar ao menu principal\n' +
                    '/status - Ver status do bot\n' +
                    '/reset - Resetar conversa\n' +
                    '/help - Esta ajuda');
                break;

            case '/debug':
                const userState = this.flowEngine.getUserState(from);
                await this.sendMessage(from, 
                    `🔧 *Debug Info:*\n\n` +
                    `Flow: ${userState?.currentFlow || 'none'}\n` +
                    `Step: ${userState?.stepId || 'none'}\n` +
                    `Waiting input: ${userState?.waitingInput || false}`);
                break;

            default:
                await this.sendMessage(from, '❌ Comando desconhecido. Use /help para ver comandos.');
        }
    }

    // ============================================
    // GERENCIAR SESSÕES
    // ============================================
    
    getSession(from) {
        return this.activeSessions.get(from);
    }

    createSession(from, name) {
        const sessionId = security.generateSessionToken();
        
        const session = {
            id: sessionId,
            phone: from,
            name: name,
            startedAt: Date.now(),
            lastInteraction: Date.now(),
            messagesCount: 0,
            department: null,
            needsHuman: false,
            priority: 'normal'
        };

        this.activeSessions.set(from, session);
        database.createSession(sessionId, from);

        logger.info(`✅ New session created for ${name} (${from})`);
        
        return session;
    }

    closeSession(from) {
        const session = this.activeSessions.get(from);
        if (session) {
            database.closeSession(session.id);
            this.activeSessions.delete(from);
            this.flowEngine.resetUserFlow(from);
            logger.info(`🔚 Session closed for ${from}`);
        }
    }

    // ============================================
    // VERIFICAÇÕES
    // ============================================
    
    isBusinessHours() {
        if (!this.config.business_hours.enabled) return true;

        const now = new Date();
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
        const schedule = this.config.business_hours.schedule[dayName];

        if (!schedule || !schedule.open || !schedule.close) {
            return false;
        }

        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        return currentTime >= schedule.open && currentTime <= schedule.close;
    }

    // ============================================
    // ENVIO DE MENSAGENS
    // ============================================
    
    async sendMessage(to, message) {
        try {
            await this.client.sendMessage(to, message);
            logger.info(`📤 Sent to ${to}: ${message.substring(0, 50)}...`);
            return true;
        } catch (error) {
            logger.error('Error sending message:', error);
            return false;
        }
    }

    async sendMedia(to, filePath, caption = '') {
        try {
            const media = MessageMedia.fromFilePath(filePath);
            await this.client.sendMessage(to, media, { caption: caption });
            logger.info(`📤 Media sent to ${to}`);
            return true;
        } catch (error) {
            logger.error('Error sending media:', error);
            return false;
        }
    }

    async sendButtons(to, message, buttons) {
        // Nota: whatsapp-web.js não suporta botões nativos
        // Simulamos com menu de texto
        const buttonText = buttons.map((btn, idx) => `${idx + 1}. ${btn.label}`).join('\n');
        await this.sendMessage(to, `${message}\n\n${buttonText}`);
    }

    // ============================================
    // LOG
    // ============================================
    
    async logBotMessage(message) {
        if (message.to && message.body) {
            database.saveConversation(message.to, message.body, 'bot', null, null, null);
        }
    }

    // ============================================
    // CONTROLE DO BOT
    // ============================================
    
    async start() {
        try {
            logger.info('🚀 Starting WhatsApp Bot...');
            await this.client.initialize();
        } catch (error) {
            logger.error('Failed to start bot:', error);
            throw error;
        }
    }

    async stop() {
        try {
            logger.info('🛑 Stopping WhatsApp Bot...');
            
            // Fechar todas as sessões ativas
            for (const [phone, session] of this.activeSessions) {
                this.closeSession(phone);
            }
            
            await this.client.destroy();
            this.isReady = false;
        } catch (error) {
            logger.error('Error stopping bot:', error);
        }
    }

    async restart() {
        try {
            logger.info('🔄 Restarting WhatsApp Bot...');
            await this.stop();
            await this.sleep(2000);
            await this.start();
        } catch (error) {
            logger.error('Error restarting bot:', error);
            throw error;
        }
    }

    // ============================================
    // UTILITIES
    // ============================================
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStatus() {
        return {
            isReady: this.isReady,
            activeSessions: this.activeSessions.size,
            mode: this.config.mode,
            flowEngine: this.flowEngine.getStats(),
            config: {
                botName: this.config.botName,
                aiEnabled: this.config.ai.enabled,
                learningMode: this.config.ai.learning_mode,
                businessHoursEnabled: this.config.business_hours.enabled
            }
        };
    }

    // ============================================
    // BROADCAST & UTILITIES
    // ============================================
    
    async broadcast(phones, message) {
        const results = [];
        
        for (const phone of phones) {
            const result = await this.sendMessage(phone, message);
            results.push({ phone, success: result });
            
            // Delay entre mensagens
            await this.sleep(2000);
        }
        
        return results;
    }

    getAllSessions() {
        return Array.from(this.activeSessions.values());
    }

    getSessionByPhone(phone) {
        return this.activeSessions.get(phone);
    }

    // ============================================
    // HOT RELOAD DE CONFIGURAÇÃO
    // ============================================
    
    reloadConfig(newConfig) {
        logger.info('🔄 Reloading configuration...');
        
        this.config = newConfig;
        this.flowEngine = new FlowEngine(newConfig);
        
        logger.info('✅ Configuration reloaded successfully');
        logger.info(`🤖 New mode: ${this.config.mode}`);
    }
}

module.exports = WhatsAppBot;