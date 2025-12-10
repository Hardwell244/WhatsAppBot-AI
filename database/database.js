const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
    constructor() {
        const dbPath = path.join(__dirname, 'whatsapp_bot.db');
        this.db = new Database(dbPath);
        this.initTables();
    }

    initTables() {
        // Tabela de conversas
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                phone VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                sender VARCHAR(10) NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                sentiment VARCHAR(20),
                department_id INTEGER,
                session_id VARCHAR(100)
            )
        `);

        // Tabela de treinamento da IA
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS ai_training (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                input TEXT NOT NULL,
                output TEXT NOT NULL,
                confidence REAL DEFAULT 0,
                usage_count INTEGER DEFAULT 0,
                last_used DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                approved BOOLEAN DEFAULT 0
            )
        `);

        // Tabela de contexto de usuários
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_context (
                phone VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100),
                last_department INTEGER,
                last_interaction DATETIME,
                interaction_count INTEGER DEFAULT 0,
                preferences TEXT,
                notes TEXT
            )
        `);

        // Tabela de métricas
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_type VARCHAR(50),
                metric_value TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Tabela de sessões
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                session_id VARCHAR(100) PRIMARY KEY,
                phone VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                ended_at DATETIME,
                messages_count INTEGER DEFAULT 0
            )
        `);

        console.log('✅ Database initialized successfully');
    }

    // Salvar conversa
    saveConversation(phone, message, sender, sentiment = null, departmentId = null, sessionId = null) {
        const stmt = this.db.prepare(`
            INSERT INTO conversations (phone, message, sender, sentiment, department_id, session_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(phone, message, sender, sentiment, departmentId, sessionId);
    }

    // Buscar histórico de conversa
    getConversationHistory(phone, limit = 10) {
        const stmt = this.db.prepare(`
            SELECT * FROM conversations 
            WHERE phone = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `);
        return stmt.all(phone, limit);
    }

    // Salvar dados de treinamento
    saveTrainingData(input, output, confidence = 0) {
        const stmt = this.db.prepare(`
            INSERT INTO ai_training (input, output, confidence)
            VALUES (?, ?, ?)
        `);
        return stmt.run(input, output, confidence);
    }

    // Buscar dados de treinamento
    getTrainingData() {
        const stmt = this.db.prepare(`
            SELECT * FROM ai_training WHERE approved = 1 ORDER BY usage_count DESC
        `);
        return stmt.all();
    }

    // Atualizar uso de resposta da IA
    updateTrainingUsage(id) {
        const stmt = this.db.prepare(`
            UPDATE ai_training 
            SET usage_count = usage_count + 1, last_used = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
        return stmt.run(id);
    }

    // Gerenciar contexto do usuário
    saveUserContext(phone, data) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO user_context 
            (phone, name, last_department, last_interaction, interaction_count, preferences, notes)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, COALESCE((SELECT interaction_count FROM user_context WHERE phone = ?), 0) + 1, ?, ?)
        `);
        return stmt.run(phone, data.name || null, data.department || null, phone, JSON.stringify(data.preferences || {}), data.notes || null);
    }

    getUserContext(phone) {
        const stmt = this.db.prepare(`SELECT * FROM user_context WHERE phone = ?`);
        return stmt.get(phone);
    }

    // Métricas
    saveMetric(type, value) {
        const stmt = this.db.prepare(`
            INSERT INTO metrics (metric_type, metric_value) VALUES (?, ?)
        `);
        return stmt.run(type, JSON.stringify(value));
    }

    getMetrics(type = null, limit = 100) {
        let query = `SELECT * FROM metrics`;
        if (type) query += ` WHERE metric_type = ?`;
        query += ` ORDER BY timestamp DESC LIMIT ?`;
        
        const stmt = this.db.prepare(query);
        return type ? stmt.all(type, limit) : stmt.all(limit);
    }

    // Sessões
    createSession(sessionId, phone) {
        const stmt = this.db.prepare(`
            INSERT INTO sessions (session_id, phone) VALUES (?, ?)
        `);
        return stmt.run(sessionId, phone);
    }

    updateSessionMessageCount(sessionId) {
        const stmt = this.db.prepare(`
            UPDATE sessions SET messages_count = messages_count + 1 WHERE session_id = ?
        `);
        return stmt.run(sessionId);
    }

    closeSession(sessionId) {
        const stmt = this.db.prepare(`
            UPDATE sessions SET status = 'closed', ended_at = CURRENT_TIMESTAMP WHERE session_id = ?
        `);
        return stmt.run(sessionId);
    }

    // Estatísticas gerais
    getStats() {
        const totalConversations = this.db.prepare(`SELECT COUNT(*) as count FROM conversations`).get();
        const totalUsers = this.db.prepare(`SELECT COUNT(DISTINCT phone) as count FROM conversations`).get();
        const totalTrainingData = this.db.prepare(`SELECT COUNT(*) as count FROM ai_training WHERE approved = 1`).get();
        const activeSessions = this.db.prepare(`SELECT COUNT(*) as count FROM sessions WHERE status = 'active'`).get();

        return {
            totalConversations: totalConversations.count,
            totalUsers: totalUsers.count,
            totalTrainingData: totalTrainingData.count,
            activeSessions: activeSessions.count
        };
    }
}

module.exports = new DatabaseManager();