const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class SecurityManager {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.secretKey = process.env.ENCRYPTION_KEY || this.generateKey();
        this.ivLength = 16;
        this.saltRounds = 12;
        
        // Rate limiting storage
        this.rateLimits = new Map();
        this.blockedNumbers = new Set();
    }

    // Gerar chave de criptografia
    generateKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Criptografar dados
    encrypt(text) {
        try {
            const iv = crypto.randomBytes(this.ivLength);
            const key = Buffer.from(this.secretKey, 'hex');
            
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();
            
            return {
                iv: iv.toString('hex'),
                encryptedData: encrypted,
                authTag: authTag.toString('hex')
            };
        } catch (error) {
            console.error('Encryption error:', error);
            return null;
        }
    }

    // Descriptografar dados
    decrypt(encryptedData) {
        try {
            const key = Buffer.from(this.secretKey, 'hex');
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');
            
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            return null;
        }
    }

    // Hash de senha
    async hashPassword(password) {
        return await bcrypt.hash(password, this.saltRounds);
    }

    // Verificar senha
    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    // Rate limiting
    checkRateLimit(phone, maxMessages = 30) {
        const now = Date.now();
        const userLimits = this.rateLimits.get(phone) || [];
        
        // Limpar mensagens antigas (últimos 60 segundos)
        const recentMessages = userLimits.filter(timestamp => now - timestamp < 60000);
        
        if (recentMessages.length >= maxMessages) {
            this.blockedNumbers.add(phone);
            console.warn(`⚠️ Rate limit exceeded for ${phone}`);
            return false;
        }
        
        recentMessages.push(now);
        this.rateLimits.set(phone, recentMessages);
        return true;
    }

    // Verificar se número está bloqueado
    isBlocked(phone) {
        return this.blockedNumbers.has(phone);
    }

    // Desbloquear número
    unblock(phone) {
        this.blockedNumbers.delete(phone);
        this.rateLimits.delete(phone);
    }

    // Sanitizar input
    sanitizeInput(text) {
        if (typeof text !== 'string') return '';
        
        // Remove caracteres perigosos
        return text
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '')
            .trim()
            .substring(0, 5000); // Limite de caracteres
    }

    // Validar número de telefone
    validatePhone(phone) {
        const phoneRegex = /^\d{10,15}$/;
        const cleanPhone = phone.replace(/\D/g, '');
        return phoneRegex.test(cleanPhone);
    }

    // Gerar token de sessão
    generateSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Limpar rate limits periodicamente
    startCleanupInterval() {
        setInterval(() => {
            const now = Date.now();
            for (const [phone, timestamps] of this.rateLimits.entries()) {
                const recent = timestamps.filter(t => now - t < 60000);
                if (recent.length === 0) {
                    this.rateLimits.delete(phone);
                } else {
                    this.rateLimits.set(phone, recent);
                }
            }
        }, 30000); // A cada 30 segundos
    }
}

module.exports = new SecurityManager();