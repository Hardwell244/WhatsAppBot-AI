/**
 * ============================================
 * REQUEST VALIDATORS - Octávio Augusto
 * Validação de dados com Joi
 * ============================================
 */

const Joi = require('joi');
const logger = require('../logs/logger');

class RequestValidators {
    /**
     * Middleware genérico de validação
     */
    static validate(schema, property = 'body') {
        return (req, res, next) => {
            const { error, value } = schema.validate(req[property], {
                abortEarly: false,
                stripUnknown: true
            });

            if (error) {
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message
                }));

                logger.warn('Validation error:', {
                    path: req.path,
                    errors: errors,
                    ip: req.ip
                });

                return res.status(400).json({
                    success: false,
                    error: 'Erro de validação',
                    details: errors
                });
            }

            // Substituir req[property] com valor validado
            req[property] = value;
            next();
        };
    }

    /**
     * Schemas de Validação
     */

    // Enviar mensagem
    static sendMessageSchema = Joi.object({
        phone: Joi.string()
            .pattern(/^[0-9]{10,15}$/)
            .required()
            .messages({
                'string.pattern.base': 'Número de telefone inválido',
                'any.required': 'Telefone é obrigatório'
            }),
        message: Joi.string()
            .min(1)
            .max(4096)
            .required()
            .messages({
                'string.min': 'Mensagem não pode estar vazia',
                'string.max': 'Mensagem muito longa (máximo 4096 caracteres)',
                'any.required': 'Mensagem é obrigatória'
            })
    });

    // Broadcast
    static broadcastSchema = Joi.object({
        message: Joi.string()
            .min(1)
            .max(4096)
            .required(),
        phones: Joi.array()
            .items(
                Joi.string().pattern(/^[0-9]{10,15}$/)
            )
            .min(1)
            .max(100)
            .required()
            .messages({
                'array.min': 'Forneça pelo menos um telefone',
                'array.max': 'Máximo de 100 telefones por broadcast'
            })
    });

    // Treinamento IA
    static trainingSchema = Joi.object({
        input: Joi.string()
            .min(3)
            .max(500)
            .required()
            .messages({
                'string.min': 'Input muito curto (mínimo 3 caracteres)',
                'string.max': 'Input muito longo (máximo 500 caracteres)'
            }),
        output: Joi.string()
            .min(3)
            .max(2000)
            .required()
            .messages({
                'string.min': 'Output muito curto (mínimo 3 caracteres)',
                'string.max': 'Output muito longo (máximo 2000 caracteres)'
            }),
        approved: Joi.boolean()
            .default(false)
    });

    // Configuração
    static configSchema = Joi.object({
        currentMode: Joi.string()
            .valid('atendimento', 'triagem')
            .optional(),
        modes: Joi.object().optional(),
        flows: Joi.object().optional(),
        departments: Joi.array().optional(),
        ai: Joi.object({
            enabled: Joi.boolean(),
            minConfidence: Joi.number().min(0).max(1),
            learningMode: Joi.boolean()
        }).optional(),
        security: Joi.object({
            rateLimit: Joi.object({
                maxMessages: Joi.number().min(1).max(1000),
                windowMs: Joi.number().min(1000).max(3600000)
            }),
            sessionTimeout: Joi.number().min(60000).max(86400000),
            encryptionEnabled: Joi.boolean()
        }).optional(),
        businessHours: Joi.object({
            enabled: Joi.boolean(),
            start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
            end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
            days: Joi.array().items(Joi.number().min(0).max(6))
        }).optional()
    });

    // Atualizar modo
    static updateModeSchema = Joi.object({
        mode: Joi.string()
            .valid('atendimento', 'triagem')
            .required()
            .messages({
                'any.only': 'Modo deve ser "atendimento" ou "triagem"',
                'any.required': 'Modo é obrigatório'
            })
    });

    // Departamento
    static departmentSchema = Joi.object({
        id: Joi.number().optional(),
        name: Joi.string()
            .min(2)
            .max(100)
            .required(),
        description: Joi.string()
            .max(500)
            .optional(),
        keywords: Joi.array()
            .items(Joi.string())
            .optional(),
        attendants: Joi.array()
            .items(Joi.string())
            .optional(),
        priority: Joi.string()
            .valid('baixa', 'media', 'alta')
            .default('media')
    });

    // Paginação
    static paginationSchema = Joi.object({
        limit: Joi.number()
            .min(1)
            .max(100)
            .default(50),
        offset: Joi.number()
            .min(0)
            .default(0)
    });

    // Query de conversas
    static conversationsQuerySchema = Joi.object({
        phone: Joi.string()
            .pattern(/^[0-9]{10,15}$/)
            .optional(),
        limit: Joi.number()
            .min(1)
            .max(100)
            .default(50),
        offset: Joi.number()
            .min(0)
            .default(0),
        startDate: Joi.date().optional(),
        endDate: Joi.date().optional(),
        sentiment: Joi.string()
            .valid('positive', 'negative', 'neutral')
            .optional()
    });

    // Restaurar backup
    static restoreBackupSchema = Joi.object({
        filename: Joi.string()
            .pattern(/^bot\.config-backup-\d+\.json$/)
            .required()
            .messages({
                'string.pattern.base': 'Nome de arquivo de backup inválido'
            })
    });

    // Métricas
    static metricsQuerySchema = Joi.object({
        range: Joi.string()
            .valid('1h', '24h', '7d', '30d')
            .default('24h')
    });

    // ID de treinamento
    static trainingIdSchema = Joi.object({
        id: Joi.number()
            .integer()
            .min(1)
            .required()
    });

    // Telefone param
    static phoneParamSchema = Joi.object({
        phone: Joi.string()
            .pattern(/^[0-9]{10,15}$/)
            .required()
    });

    // Session ID
    static sessionIdSchema = Joi.object({
        sessionId: Joi.string()
            .uuid()
            .required()
    });

    /**
     * Validadores Customizados
     */

    // Validar CPF
    static isValidCPF(cpf) {
        cpf = cpf.replace(/[^\d]/g, '');

        if (cpf.length !== 11) {
            return false;
        }

        // Verificar se todos os dígitos são iguais
        if (/^(\d)\1{10}$/.test(cpf)) {
            return false;
        }

        // Validar dígitos verificadores
        let sum = 0;
        let remainder;

        for (let i = 1; i <= 9; i++) {
            sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);
        }

        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) {
            remainder = 0;
        }

        if (remainder !== parseInt(cpf.substring(9, 10))) {
            return false;
        }

        sum = 0;
        for (let i = 1; i <= 10; i++) {
            sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);
        }

        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) {
            remainder = 0;
        }

        if (remainder !== parseInt(cpf.substring(10, 11))) {
            return false;
        }

        return true;
    }

    // Validar CNPJ
    static isValidCNPJ(cnpj) {
        cnpj = cnpj.replace(/[^\d]/g, '');

        if (cnpj.length !== 14) {
            return false;
        }

        // Verificar se todos os dígitos são iguais
        if (/^(\d)\1{13}$/.test(cnpj)) {
            return false;
        }

        // Validar primeiro dígito verificador
        let size = cnpj.length - 2;
        let numbers = cnpj.substring(0, size);
        const digits = cnpj.substring(size);
        let sum = 0;
        let pos = size - 7;

        for (let i = size; i >= 1; i--) {
            sum += numbers.charAt(size - i) * pos--;
            if (pos < 2) {
                pos = 9;
            }
        }

        let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);

        if (result !== parseInt(digits.charAt(0))) {
            return false;
        }

        // Validar segundo dígito verificador
        size = size + 1;
        numbers = cnpj.substring(0, size);
        sum = 0;
        pos = size - 7;

        for (let i = size; i >= 1; i--) {
            sum += numbers.charAt(size - i) * pos--;
            if (pos < 2) {
                pos = 9;
            }
        }

        result = sum % 11 < 2 ? 0 : 11 - (sum % 11);

        if (result !== parseInt(digits.charAt(1))) {
            return false;
        }

        return true;
    }

    // Validar Email
    static isValidEmail(email) {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email);
    }

    // Validar Telefone Brasileiro
    static isValidBrazilianPhone(phone) {
        // Remove tudo que não for dígito
        const cleaned = phone.replace(/\D/g, '');

        // Valida formatos: (XX) 9XXXX-XXXX ou (XX) XXXX-XXXX
        return /^[1-9]{2}9?[0-9]{8}$/.test(cleaned);
    }

    /**
     * Schema customizado com validadores
     */
    static customValidationSchema = Joi.object({
        cpf: Joi.string()
            .custom((value, helpers) => {
                if (!RequestValidators.isValidCPF(value)) {
                    return helpers.error('any.invalid');
                }
                return value;
            })
            .messages({
                'any.invalid': 'CPF inválido'
            }),
        cnpj: Joi.string()
            .custom((value, helpers) => {
                if (!RequestValidators.isValidCNPJ(value)) {
                    return helpers.error('any.invalid');
                }
                return value;
            })
            .messages({
                'any.invalid': 'CNPJ inválido'
            }),
        email: Joi.string()
            .email()
            .messages({
                'string.email': 'Email inválido'
            }),
        phone: Joi.string()
            .custom((value, helpers) => {
                if (!RequestValidators.isValidBrazilianPhone(value)) {
                    return helpers.error('any.invalid');
                }
                return value;
            })
            .messages({
                'any.invalid': 'Telefone brasileiro inválido'
            })
    });
}

module.exports = RequestValidators;
