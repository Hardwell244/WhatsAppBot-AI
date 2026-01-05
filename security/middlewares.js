/**
 * ============================================
 * SECURITY MIDDLEWARES - Octávio Augusto
 * Middlewares de segurança para API
 * ============================================
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const logger = require('../logs/logger');
const security = require('./encryption');

class SecurityMiddlewares {
    /**
     * Configurar Helmet para segurança de headers HTTP
     */
    static helmet() {
        return helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:', 'https:']
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            },
            frameguard: {
                action: 'deny'
            },
            noSniff: true,
            xssFilter: true,
            referrerPolicy: {
                policy: 'same-origin'
            }
        });
    }

    /**
     * Configurar CORS
     */
    static cors() {
        const allowedOrigins = process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(',')
            : ['http://localhost:3000'];

        const corsOptions = {
            origin: (origin, callback) => {
                // Permitir requests sem origin (mobile apps, postman, etc)
                if (!origin || allowedOrigins.includes('*')) {
                    return callback(null, true);
                }

                if (allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    logger.warn(`CORS blocked origin: ${origin}`);
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
            exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
            maxAge: 86400 // 24 horas
        };

        return cors(corsOptions);
    }

    /**
     * Rate Limiting Global
     */
    static globalRateLimit() {
        return rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutos
            max: 100, // 100 requests por IP
            message: {
                success: false,
                error: 'Muitas requisições deste IP. Tente novamente em 15 minutos.'
            },
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
                res.status(429).json({
                    success: false,
                    error: 'Muitas requisições. Tente novamente em alguns minutos.',
                    retryAfter: 900 // 15 minutos em segundos
                });
            }
        });
    }

    /**
     * Rate Limiting para API Endpoints
     */
    static apiRateLimit() {
        return rateLimit({
            windowMs: 60 * 1000, // 1 minuto
            max: 30, // 30 requests por minuto
            message: {
                success: false,
                error: 'Limite de requisições da API excedido'
            },
            standardHeaders: true,
            legacyHeaders: false,
            keyGenerator: (req) => {
                // Rate limit por IP + User (se autenticado)
                return req.user ? `${req.ip}-${req.user.id}` : req.ip;
            }
        });
    }

    /**
     * Rate Limiting Estrito para Autenticação
     */
    static authRateLimit() {
        return rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutos
            max: 5, // 5 tentativas
            skipSuccessfulRequests: true,
            message: {
                success: false,
                error: 'Muitas tentativas de autenticação. Conta temporariamente bloqueada.'
            },
            handler: (req, res) => {
                logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
                res.status(429).json({
                    success: false,
                    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
                    retryAfter: 900
                });
            }
        });
    }

    /**
     * Sanitização de Input
     */
    static sanitizeInput(req, res, next) {
        try {
            // Sanitizar body
            if (req.body) {
                req.body = SecurityMiddlewares._deepSanitize(req.body);
            }

            // Sanitizar query params
            if (req.query) {
                req.query = SecurityMiddlewares._deepSanitize(req.query);
            }

            // Sanitizar params
            if (req.params) {
                req.params = SecurityMiddlewares._deepSanitize(req.params);
            }

            next();
        } catch (error) {
            logger.error('Error sanitizing input:', error);
            res.status(400).json({
                success: false,
                error: 'Input inválido'
            });
        }
    }

    /**
     * Sanitização profunda recursiva
     */
    static _deepSanitize(obj) {
        if (typeof obj === 'string') {
            return security.sanitizeInput(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => SecurityMiddlewares._deepSanitize(item));
        }

        if (obj && typeof obj === 'object') {
            const sanitized = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = SecurityMiddlewares._deepSanitize(value);
            }
            return sanitized;
        }

        return obj;
    }

    /**
     * Validação de Content-Type
     */
    static validateContentType(req, res, next) {
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            const contentType = req.get('Content-Type');

            if (!contentType || !contentType.includes('application/json')) {
                logger.warn(`Invalid content-type: ${contentType} from ${req.ip}`);
                return res.status(415).json({
                    success: false,
                    error: 'Content-Type deve ser application/json'
                });
            }
        }

        next();
    }

    /**
     * Logging de Requisições
     */
    static requestLogger(req, res, next) {
        const start = Date.now();

        // Capturar informações da requisição
        const requestInfo = {
            method: req.method,
            path: req.path,
            ip: req.ip,
            userAgent: req.get('user-agent'),
            timestamp: new Date().toISOString()
        };

        // Log quando a resposta terminar
        res.on('finish', () => {
            const duration = Date.now() - start;

            const logData = {
                ...requestInfo,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                size: res.get('Content-Length') || 0
            };

            // Log diferente baseado no status
            if (res.statusCode >= 500) {
                logger.error('Server Error:', logData);
            } else if (res.statusCode >= 400) {
                logger.warn('Client Error:', logData);
            } else {
                logger.http('Request:', logData);
            }
        });

        next();
    }

    /**
     * Compressão de Respostas
     */
    static compression() {
        return compression({
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            },
            level: 6, // Nível de compressão (0-9)
            threshold: 1024 // Comprimir apenas se > 1KB
        });
    }

    /**
     * Proteção contra NoSQL Injection
     */
    static noSqlInjectionProtection(req, res, next) {
        const check = (obj) => {
            if (typeof obj === 'object' && obj !== null) {
                for (const key in obj) {
                    // Verificar operadores MongoDB/NoSQL
                    if (key.startsWith('$') || key.startsWith('{')) {
                        logger.warn(`NoSQL injection attempt detected: ${key} from ${req.ip}`);
                        return false;
                    }

                    // Verificar recursivamente
                    if (!check(obj[key])) {
                        return false;
                    }
                }
            }
            return true;
        };

        // Verificar body, query e params
        if (!check(req.body) || !check(req.query) || !check(req.params)) {
            return res.status(400).json({
                success: false,
                error: 'Requisição inválida detectada'
            });
        }

        next();
    }

    /**
     * Limite de Tamanho do Body
     */
    static bodyLimit(limit = '10mb') {
        return (req, res, next) => {
            const contentLength = req.get('content-length');

            if (contentLength) {
                const sizeInBytes = parseInt(contentLength);
                const limitInBytes = SecurityMiddlewares._parseSize(limit);

                if (sizeInBytes > limitInBytes) {
                    logger.warn(`Body size limit exceeded: ${sizeInBytes} bytes from ${req.ip}`);
                    return res.status(413).json({
                        success: false,
                        error: `Body muito grande. Máximo permitido: ${limit}`
                    });
                }
            }

            next();
        };
    }

    static _parseSize(size) {
        const units = {
            b: 1,
            kb: 1024,
            mb: 1024 * 1024,
            gb: 1024 * 1024 * 1024
        };

        const match = size.toString().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);

        if (!match) {
            return parseInt(size);
        }

        const value = parseFloat(match[1]);
        const unit = match[2];

        return value * (units[unit] || 1);
    }

    /**
     * Timeout de Requisição
     */
    static timeout(ms = 30000) {
        return (req, res, next) => {
            req.setTimeout(ms, () => {
                logger.warn(`Request timeout: ${req.path} from ${req.ip}`);
                res.status(408).json({
                    success: false,
                    error: 'Requisição excedeu o tempo limite'
                });
            });

            next();
        };
    }

    /**
     * Validar API Key (se configurada)
     */
    static apiKeyAuth(req, res, next) {
        const apiKey = req.get('X-API-Key');
        const configuredKey = process.env.API_KEY;

        // Se não há API key configurada, pular validação
        if (!configuredKey || process.env.API_AUTH_ENABLED !== 'true') {
            return next();
        }

        if (!apiKey || apiKey !== configuredKey) {
            logger.warn(`Invalid API key attempt from ${req.ip}`);
            return res.status(401).json({
                success: false,
                error: 'API key inválida ou ausente'
            });
        }

        next();
    }

    /**
     * JWT Authentication Middleware
     */
    static jwtAuth(req, res, next) {
        try {
            const token = req.get('Authorization')?.replace('Bearer ', '');

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'Token de autenticação não fornecido'
                });
            }

            // Verificar token (implementar quando adicionar JWT)
            // const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // req.user = decoded;

            next();
        } catch (error) {
            logger.warn(`JWT auth failed: ${error.message} from ${req.ip}`);
            return res.status(401).json({
                success: false,
                error: 'Token inválido ou expirado'
            });
        }
    }

    /**
     * Verificar se é horário comercial
     */
    static businessHours(req, res, next) {
        if (process.env.BUSINESS_HOURS_ENABLED !== 'true') {
            return next();
        }

        const now = new Date();
        const day = now.getDay(); // 0 = Domingo, 6 = Sábado
        const hour = now.getHours();

        const businessDays = process.env.BUSINESS_DAYS?.split(',').map(Number) || [1, 2, 3, 4, 5];
        const startHour = parseInt(process.env.BUSINESS_HOURS_START?.split(':')[0]) || 9;
        const endHour = parseInt(process.env.BUSINESS_HOURS_END?.split(':')[0]) || 18;

        if (!businessDays.includes(day) || hour < startHour || hour >= endHour) {
            return res.status(503).json({
                success: false,
                error: 'Fora do horário de atendimento',
                businessHours: {
                    days: businessDays,
                    start: process.env.BUSINESS_HOURS_START,
                    end: process.env.BUSINESS_HOURS_END
                }
            });
        }

        next();
    }

    /**
     * Adicionar headers de segurança customizados
     */
    static securityHeaders(req, res, next) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader('X-Powered-By', 'Octávio Augusto AI');
        res.removeHeader('X-Powered-By'); // Remove Express header

        next();
    }

    /**
     * Error Handler Middleware
     */
    static errorHandler(err, req, res, next) {
        // Log do erro
        logger.error('Unhandled error:', {
            error: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method,
            ip: req.ip
        });

        // Não expor stack trace em produção
        const isDevelopment = process.env.NODE_ENV === 'development';

        res.status(err.status || 500).json({
            success: false,
            error: err.message || 'Erro interno do servidor',
            ...(isDevelopment && { stack: err.stack })
        });
    }

    /**
     * 404 Not Found Handler
     */
    static notFoundHandler(req, res) {
        logger.warn(`404 Not Found: ${req.method} ${req.path} from ${req.ip}`);

        res.status(404).json({
            success: false,
            error: 'Endpoint não encontrado',
            path: req.path,
            method: req.method
        });
    }
}

module.exports = SecurityMiddlewares;
