const database = require('../database/database');
const AIBrain = require('../ai/brain');
const logger = require('../logs/logger');
const security = require('../security/encryption');

class FlowEngine {
    constructor(config) {
        this.config = config;
        this.userStates = new Map(); // Estado de cada usuário
        this.validators = this.setupValidators();
        
        logger.info('🔄 Flow Engine initialized');
    }

    // ============================================
    // PROCESSAR MENSAGEM NO FLUXO
    // ============================================
    
    async processMessage(phone, message, userContext) {
        try {
            // Obter ou criar estado do usuário
            let userState = this.getUserState(phone);
            
            // Se é primeira interação, iniciar fluxo
            if (!userState || !userState.currentFlow) {
                const flowId = this.config.mode === 'atendimento' 
                    ? this.config.modes.atendimento.flowId 
                    : this.config.modes.triagem.flowId;
                
                userState = this.initializeUserFlow(phone, flowId, userContext);
            }
            
            // Processar input do usuário no step atual
            const result = await this.processStep(phone, message, userState, userContext);
            
            return result;
            
        } catch (error) {
            logger.error('Error in flow processing:', error);
            return {
                message: 'Desculpe, ocorreu um erro. Vou te conectar com um atendente.',
                action: 'transfer_human',
                error: true
            };
        }
    }

    // ============================================
    // GERENCIAR ESTADO DO USUÁRIO
    // ============================================
    
    getUserState(phone) {
        return this.userStates.get(phone);
    }

    initializeUserFlow(phone, flowId, userContext) {
        const flow = this.config.flows[flowId];
        
        if (!flow) {
            logger.error(`Flow not found: ${flowId}`);
            return null;
        }

        const userState = {
            phone: phone,
            currentFlow: flowId,
            currentStep: 0,
            stepId: flow.steps[0].id,
            data: {},
            context: userContext || {},
            retryCount: 0,
            history: [],
            startedAt: Date.now()
        };

        this.userStates.set(phone, userState);
        logger.info(`Flow initialized for ${phone}: ${flowId}`);
        
        return userState;
    }

    updateUserState(phone, updates) {
        const state = this.userStates.get(phone);
        if (state) {
            Object.assign(state, updates);
            this.userStates.set(phone, state);
        }
    }

    resetUserFlow(phone) {
        this.userStates.delete(phone);
        logger.info(`Flow reset for ${phone}`);
    }

    // ============================================
    // PROCESSAR STEP
    // ============================================
    
    async processStep(phone, message, userState, userContext) {
        const flow = this.config.flows[userState.currentFlow];
        const step = flow.steps[userState.currentStep];

        logger.info(`Processing step ${step.id} (${step.type}) for ${phone}`);

        // Adicionar ao histórico
        userState.history.push({
            stepId: step.id,
            type: step.type,
            input: message,
            timestamp: Date.now()
        });

        // Processar baseado no tipo de step
        switch (step.type) {
            case 'message':
                return await this.handleMessageStep(phone, step, userState, userContext);
            
            case 'menu':
                return await this.handleMenuStep(phone, message, step, userState, userContext);
            
            case 'capture_data':
                return await this.handleCaptureDataStep(phone, message, step, userState, userContext);
            
            case 'quick_reply':
                return await this.handleQuickReplyStep(phone, message, step, userState, userContext);
            
            case 'ai_response':
                return await this.handleAIResponseStep(phone, message, step, userState, userContext);
            
            case 'action':
                return await this.handleActionStep(phone, step, userState, userContext);
            
            case 'condition':
                return await this.handleConditionStep(phone, message, step, userState, userContext);
            
            default:
                logger.error(`Unknown step type: ${step.type}`);
                return { message: 'Erro no fluxo.', error: true };
        }
    }

    // ============================================
    // HANDLERS DE STEPS
    // ============================================

    // MESSAGE STEP - Apenas envia mensagem
    async handleMessageStep(phone, step, userState, userContext) {
        const message = this.replaceVariables(step.message, userState, userContext);
        
        // Avançar para próximo step
        if (step.next) {
            this.moveToNextStep(phone, userState, step.next);
        }

        return {
            message: message,
            delay: step.delay || 0,
            continue: !!step.next
        };
    }

    // MENU STEP - Menu com opções
    async handleMenuStep(phone, message, step, userState, userContext) {
        // Se é a primeira vez no step, mostrar menu
        if (!userState.waitingInput) {
            const menuMessage = this.buildMenuMessage(step, userState, userContext);
            
            userState.waitingInput = true;
            userState.expectedInput = 'menu_option';
            userState.menuOptions = step.options;
            this.updateUserState(phone, userState);

            return {
                message: menuMessage,
                waitingInput: true
            };
        }

        // Validar escolha do usuário
        const sanitized = message.trim();
        const option = step.options.find(opt => opt.id === sanitized);

        if (!option) {
            // Opção inválida
            userState.retryCount++;

            if (userState.retryCount >= (step.max_retries || 3)) {
                // Excedeu tentativas
                return this.handleMaxRetriesExceeded(phone, userState);
            }

            const retryMsg = step.retry_message || 'Opção inválida. Tente novamente.';
            return {
                message: retryMsg,
                waitingInput: true
            };
        }

        // Opção válida - executar ação
        userState.retryCount = 0;
        userState.waitingInput = false;
        userState.data.lastMenuChoice = option.id;

        // Salvar no contexto
        database.saveUserContext(phone, {
            name: userContext.name,
            lastMenuChoice: option.id
        });

        switch (option.action) {
            case 'goto':
                // Ir para outro fluxo
                return this.gotoFlow(phone, option.target, userState, userContext);
            
            case 'transfer_human':
                return {
                    message: '🤝 Conectando você com um atendente humano...',
                    action: 'transfer_human',
                    transferComplete: true
                };
            
            case 'transfer_department':
                return {
                    message: this.getDepartmentTransferMessage(option.target),
                    action: 'transfer_department',
                    departmentId: option.target,
                    transferComplete: true
                };
            
            default:
                logger.error(`Unknown menu action: ${option.action}`);
                return { message: 'Erro no menu.', error: true };
        }
    }

    // CAPTURE DATA STEP - Captura dados do usuário
    async handleCaptureDataStep(phone, message, step, userState, userContext) {
        // Se é primeira vez, fazer pergunta
        if (!userState.waitingInput) {
            const question = this.replaceVariables(step.message, userState, userContext);
            
            userState.waitingInput = true;
            userState.expectedInput = step.field;
            userState.validationType = step.validation;
            this.updateUserState(phone, userState);

            return {
                message: question,
                waitingInput: true
            };
        }

        // Validar input
        const validation = this.validateInput(message, step.validation);

        if (!validation.valid) {
            userState.retryCount++;

            if (userState.retryCount >= 3) {
                return this.handleMaxRetriesExceeded(phone, userState);
            }

            return {
                message: `❌ ${validation.error}\n\n${step.message}`,
                waitingInput: true
            };
        }

        // Input válido - salvar dados
        const value = validation.value;
        
        // Salvar no estado do fluxo
        userState.data[step.field] = value;
        
        // Salvar no contexto do usuário
        if (step.save_to) {
            const path = step.save_to.split('.');
            if (path[0] === 'user_context') {
                userContext[path[1]] = value;
                database.saveUserContext(phone, userContext);
            }
        }

        // Resetar estado de espera
        userState.waitingInput = false;
        userState.retryCount = 0;

        // Avançar para próximo step
        if (step.next) {
            this.moveToNextStep(phone, userState, step.next);
        }

        return {
            message: `✅ Perfeito!`,
            delay: 500,
            continue: !!step.next
        };
    }

    // QUICK REPLY STEP - Respostas rápidas
    async handleQuickReplyStep(phone, message, step, userState, userContext) {
        if (!userState.waitingInput) {
            const msg = this.replaceVariables(step.message, userState, userContext);
            const options = step.options.map(opt => `• ${opt.label}`).join('\n');
            
            userState.waitingInput = true;
            userState.quickReplyOptions = step.options;
            this.updateUserState(phone, userState);

            return {
                message: `${msg}\n\n${options}`,
                waitingInput: true
            };
        }

        // Validar resposta
        const sanitized = message.toLowerCase().trim();
        const option = step.options.find(opt => 
            opt.id.toLowerCase() === sanitized || 
            opt.label.toLowerCase().includes(sanitized)
        );

        if (!option) {
            return {
                message: '❌ Resposta inválida. Escolha uma das opções acima.',
                waitingInput: true
            };
        }

        userState.waitingInput = false;
        userState.data.quickReply = option.id;

        // Ir para próximo step definido na opção
        if (option.next) {
            if (option.next === 'main_flow') {
                // Reiniciar fluxo principal
                this.resetUserFlow(phone);
                return {
                    message: '🔄 Voltando ao menu principal...',
                    restart: true
                };
            }
            
            this.moveToNextStep(phone, userState, option.next);
        }

        return {
            message: '✅ Entendido!',
            continue: !!option.next
        };
    }

    // AI RESPONSE STEP - Resposta com IA
    async handleAIResponseStep(phone, message, step, userState, userContext) {
        if (!this.config.ai.enabled) {
            // IA desabilitada, ir para fallback
            if (step.fallback) {
                this.moveToNextStep(phone, userState, step.fallback);
                return { continue: true };
            }
            return { message: 'IA não disponível no momento.' };
        }

        // Processar com IA
        const aiResponse = await AIBrain.processMessage(message, userContext);

        if (aiResponse.confidence >= step.confidence_threshold) {
            // IA confiante - usar resposta
            userState.data.aiResponse = aiResponse.response;
            
            return {
                message: aiResponse.response,
                confidence: aiResponse.confidence,
                fromAI: true
            };
        } else {
            // IA não confiante - ir para fallback
            if (step.fallback) {
                this.moveToNextStep(phone, userState, step.fallback);
                return {
                    message: 'Deixa eu te conectar com alguém que pode te ajudar melhor!',
                    continue: true
                };
            }

            return {
                message: 'Não tenho certeza sobre isso. Vou te transferir para um especialista!',
                action: 'transfer_human'
            };
        }
    }

    // ACTION STEP - Executar ações
    async handleActionStep(phone, step, userState, userContext) {
        logger.info(`Executing action: ${step.action}`);

        switch (step.action) {
            case 'transfer_department':
                const dept = this.config.departments.find(d => d.id === step.department_id);
                const msg = this.replaceVariables(
                    step.context_message || dept.transfer_message,
                    userState,
                    userContext
                );

                // Notificar sistema
                if (step.notify_human) {
                    logger.info(`🔔 TRANSFER NOTIFICATION: ${msg}`);
                }

                return {
                    message: msg,
                    action: 'transfer_department',
                    departmentId: step.department_id,
                    priority: step.priority || 'normal',
                    transferComplete: true
                };

            case 'transfer_human':
                return {
                    message: '🤝 Conectando você com um atendente...',
                    action: 'transfer_human',
                    transferComplete: true
                };

            case 'generate_boleto':
                // Simular geração de boleto
                return {
                    message: step.success_message || 'Boleto gerado com sucesso!',
                    action: 'boleto_generated',
                    continue: !!step.next
                };

            case 'send_email':
                // Simular envio de email
                logger.info(`📧 Email would be sent to ${userContext.email}`);
                return {
                    message: 'E-mail enviado com sucesso!',
                    continue: !!step.next
                };

            default:
                logger.error(`Unknown action: ${step.action}`);
                return {
                    message: 'Ação não implementada.',
                    error: true
                };
        }
    }

    // CONDITION STEP - Condições lógicas
    async handleConditionStep(phone, message, step, userState, userContext) {
        // Avaliar condição
        const condition = this.evaluateCondition(step.condition, userState, userContext);

        if (condition) {
            // Condição verdadeira
            if (step.if_true) {
                this.moveToNextStep(phone, userState, step.if_true);
                return { continue: true };
            }
        } else {
            // Condição falsa
            if (step.if_false) {
                this.moveToNextStep(phone, userState, step.if_false);
                return { continue: true };
            }
        }

        return { message: 'Erro na condição.' };
    }

    // ============================================
    // NAVEGAÇÃO DE FLUXO
    // ============================================

    moveToNextStep(phone, userState, nextStepId) {
        const flow = this.config.flows[userState.currentFlow];
        const nextIndex = flow.steps.findIndex(s => s.id === nextStepId);

        if (nextIndex === -1) {
            logger.error(`Step not found: ${nextStepId}`);
            return false;
        }

        userState.currentStep = nextIndex;
        userState.stepId = nextStepId;
        this.updateUserState(phone, userState);

        logger.info(`User ${phone} moved to step ${nextStepId}`);
        return true;
    }

    gotoFlow(phone, flowId, userState, userContext) {
        const newFlow = this.config.flows[flowId];

        if (!newFlow) {
            logger.error(`Flow not found: ${flowId}`);
            return { message: 'Erro ao trocar fluxo.', error: true };
        }

        // Salvar fluxo anterior no histórico
        userState.previousFlow = userState.currentFlow;

        // Iniciar novo fluxo
        this.resetUserFlow(phone);
        this.initializeUserFlow(phone, flowId, userContext);

        logger.info(`User ${phone} switched to flow ${flowId}`);

        return {
            message: '🔄 Redirecionando...',
            flowChanged: true,
            continue: true
        };
    }

    // ============================================
    // VALIDAÇÕES
    // ============================================

    setupValidators() {
        return {
            text: (value) => {
                if (!value || value.trim().length < 2) {
                    return { valid: false, error: 'Por favor, digite um texto válido.' };
                }
                return { valid: true, value: value.trim() };
            },

            email: (value) => {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    return { valid: false, error: 'E-mail inválido. Exemplo: seu@email.com' };
                }
                return { valid: true, value: value.toLowerCase().trim() };
            },

            phone: (value) => {
                const phoneRegex = /^[\d\s\(\)\-\+]{10,15}$/;
                const cleaned = value.replace(/\D/g, '');
                
                if (!phoneRegex.test(value) || cleaned.length < 10) {
                    return { valid: false, error: 'Telefone inválido. Digite DDD + número.' };
                }
                return { valid: true, value: cleaned };
            },

            cpf: (value) => {
                const cpf = value.replace(/\D/g, '');
                
                if (cpf.length !== 11 || !this.validateCPF(cpf)) {
                    return { valid: false, error: 'CPF inválido.' };
                }
                return { valid: true, value: cpf };
            },

            cnpj: (value) => {
                const cnpj = value.replace(/\D/g, '');
                
                if (cnpj.length !== 14 || !this.validateCNPJ(cnpj)) {
                    return { valid: false, error: 'CNPJ inválido.' };
                }
                return { valid: true, value: cnpj };
            },

            cpf_cnpj: (value) => {
                const doc = value.replace(/\D/g, '');
                
                if (doc.length === 11) {
                    return this.validators.cpf(value);
                } else if (doc.length === 14) {
                    return this.validators.cnpj(value);
                } else {
                    return { valid: false, error: 'CPF/CNPJ inválido.' };
                }
            },

            number: (value) => {
                const num = parseFloat(value);
                if (isNaN(num)) {
                    return { valid: false, error: 'Digite apenas números.' };
                }
                return { valid: true, value: num };
            },

            option: (value) => {
                // Validação simples de opção
                return { valid: true, value: value.trim() };
            }
        };
    }

    validateInput(value, validationType) {
        const validator = this.validators[validationType];
        
        if (!validator) {
            logger.warn(`Unknown validation type: ${validationType}`);
            return { valid: true, value: value };
        }

        return validator(value);
    }

    // Validação de CPF
    validateCPF(cpf) {
        if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let digit = 11 - (sum % 11);
        if (digit >= 10) digit = 0;
        if (digit !== parseInt(cpf.charAt(9))) return false;

        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cpf.charAt(i)) * (11 - i);
        }
        digit = 11 - (sum % 11);
        if (digit >= 10) digit = 0;
        if (digit !== parseInt(cpf.charAt(10))) return false;

        return true;
    }

    // Validação de CNPJ
    validateCNPJ(cnpj) {
        if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

        let length = cnpj.length - 2;
        let numbers = cnpj.substring(0, length);
        const digits = cnpj.substring(length);
        let sum = 0;
        let pos = length - 7;

        for (let i = length; i >= 1; i--) {
            sum += numbers.charAt(length - i) * pos--;
            if (pos < 2) pos = 9;
        }

        let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        if (result !== parseInt(digits.charAt(0))) return false;

        length = length + 1;
        numbers = cnpj.substring(0, length);
        sum = 0;
        pos = length - 7;

        for (let i = length; i >= 1; i--) {
            sum += numbers.charAt(length - i) * pos--;
            if (pos < 2) pos = 9;
        }

        result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        if (result !== parseInt(digits.charAt(1))) return false;

        return true;
    }

    // ============================================
    // UTILIDADES
    // ============================================

    replaceVariables(text, userState, userContext) {
        let result = text;

        // Substituir variáveis do contexto
        result = result.replace(/\{(\w+)\}/g, (match, key) => {
            // Procurar no contexto do usuário
            if (userContext && userContext[key]) {
                return userContext[key];
            }
            // Procurar nos dados do fluxo
            if (userState.data && userState.data[key]) {
                return userState.data[key];
            }
            // Manter original se não encontrar
            return match;
        });

        return result;
    }

    buildMenuMessage(step, userState, userContext) {
        const message = this.replaceVariables(step.message, userState, userContext);
        return message;
    }

    getDepartmentTransferMessage(deptId) {
        const dept = this.config.departments.find(d => d.id === deptId);
        return dept ? dept.transfer_message : 'Transferindo...';
    }

    evaluateCondition(condition, userState, userContext) {
        // Implementação básica de condições
        // Exemplo: "user_context.email exists"
        // Exemplo: "data.interest contains 'software'"
        
        try {
            const parts = condition.split(' ');
            const path = parts[0].split('.');
            const operator = parts[1];
            const value = parts.slice(2).join(' ');

            let target;
            if (path[0] === 'user_context') {
                target = userContext[path[1]];
            } else if (path[0] === 'data') {
                target = userState.data[path[1]];
            }

            switch (operator) {
                case 'exists':
                    return !!target;
                case 'equals':
                    return target === value;
                case 'contains':
                    return target && target.includes(value);
                default:
                    return false;
            }
        } catch (error) {
            logger.error('Error evaluating condition:', error);
            return false;
        }
    }

    handleMaxRetriesExceeded(phone, userState) {
        logger.warn(`Max retries exceeded for ${phone}`);
        
        if (this.config.fallback.transfer_after_limit) {
            return {
                message: this.config.fallback.transfer_message,
                action: 'transfer_human',
                transferComplete: true
            };
        }

        // Resetar fluxo
        this.resetUserFlow(phone);
        
        return {
            message: 'Vamos recomeçar do início.',
            restart: true
        };
    }

    // ============================================
    // ESTATÍSTICAS
    // ============================================

    getStats() {
        return {
            activeUsers: this.userStates.size,
            totalFlows: Object.keys(this.config.flows).length,
            mode: this.config.mode
        };
    }
}

module.exports = FlowEngine;