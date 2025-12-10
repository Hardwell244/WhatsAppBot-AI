const AIBrain = require('./brain');
const database = require('../database/database');
const logger = require('../logs/logger');

class AITrainer {
    constructor() {
        this.brain = AIBrain;
    }

    // Treinar com dados iniciais (Seed Data)
    async seedInitialTraining() {
        logger.info('🌱 Starting AI seed training...');

        const seedData = [
            // Saudações
            { input: 'oi', output: 'Olá! Como posso ajudar você hoje?' },
            { input: 'ola', output: 'Oi! Em que posso ser útil?' },
            { input: 'bom dia', output: 'Bom dia! Tudo bem? Como posso ajudar?' },
            { input: 'boa tarde', output: 'Boa tarde! No que posso ajudar?' },
            { input: 'boa noite', output: 'Boa noite! Como posso te auxiliar?' },
            
            // Despedidas
            { input: 'tchau', output: 'Até logo! Volte sempre que precisar! 😊' },
            { input: 'ate logo', output: 'Até mais! Foi um prazer ajudar!' },
            { input: 'obrigado', output: 'Por nada! Estamos aqui sempre que precisar! 🙏' },
            { input: 'valeu', output: 'Tmj! Qualquer coisa é só chamar!' },
            
            // Perguntas sobre horário
            { input: 'qual o horario de atendimento', output: 'Nosso atendimento funciona de segunda a sexta, das 9h às 18h.' },
            { input: 'voces atendem sabado', output: 'Aos sábados não temos atendimento, mas voltamos segunda-feira!' },
            { input: 'ate que horas atendem', output: 'Atendemos até as 18h de segunda a sexta-feira.' },
            
            // Perguntas sobre empresa
            { input: 'quem e voces', output: 'Somos a BLACKCORE, empresa especializada em desenvolvimento de software e soluções tecnológicas!' },
            { input: 'o que voces fazem', output: 'Desenvolvemos sistemas personalizados, sites, aplicativos e soluções em SaaS para empresas!' },
            
            // Vendas
            { input: 'quanto custa', output: 'Para te passar um orçamento preciso, vou te conectar com nossa equipe de vendas!' },
            { input: 'qual o preco', output: 'Os valores variam conforme o projeto. Vou transferir você para vendas para conversarmos melhor!' },
            { input: 'quero comprar', output: 'Ótimo! Vou te conectar com vendas para fecharmos o melhor negócio!' },
            { input: 'tem desconto', output: 'Temos várias promoções! Deixa eu te passar para vendas que eles te contam tudo!' },
            
            // Suporte
            { input: 'preciso de ajuda', output: 'Claro! Estou aqui para isso. Qual problema você está enfrentando?' },
            { input: 'nao ta funcionando', output: 'Sinto muito pelo problema! Pode me descrever o que está acontecendo?' },
            { input: 'deu erro', output: 'Vou te ajudar a resolver! Qual mensagem de erro aparece?' },
            { input: 'bug', output: 'Entendi, vou registrar esse bug e transferir para nosso time técnico resolver!' },
            
            // Financeiro
            { input: 'quero o boleto', output: 'Vou te conectar com o financeiro para enviar o boleto atualizado!' },
            { input: 'nao recebi a nota fiscal', output: 'Vou verificar com o financeiro e já te envio a nota!' },
            { input: 'forma de pagamento', output: 'Aceitamos boleto, PIX, cartão de crédito e transferência. Qual prefere?' },
            
            // Dúvidas gerais
            { input: 'como funciona', output: 'Posso te explicar! Sobre qual serviço/produto você quer saber?' },
            { input: 'tenho uma duvida', output: 'Fique à vontade para perguntar! Estou aqui para esclarecer!' },
            { input: 'pode me ajudar', output: 'Com certeza! Diga em que posso ajudar!' },
            
            // Reclamações
            { input: 'quero reclamar', output: 'Sinto muito pela experiência ruim. Vou registrar sua reclamação e garantir que seja resolvida!' },
            { input: 'pessimo atendimento', output: 'Peço desculpas pelo ocorrido. Vou encaminhar para o supervisor analisar!' },
            
            // Elogios
            { input: 'muito bom', output: 'Obrigado! Ficamos felizes em ajudar! 😊' },
            { input: 'excelente', output: 'Que ótimo! Seu feedback é muito importante para nós! 🙏' },
            
            // Menu
            { input: 'menu', output: 'Aqui está o menu:\n\n1️⃣ - Vendas\n2️⃣ - Suporte\n3️⃣ - Financeiro\n4️⃣ - Falar com Atendente\n\nDigite o número da opção desejada!' },
            { input: 'opcoes', output: 'Confira as opções disponíveis:\n\n1️⃣ - Vendas\n2️⃣ - Suporte\n3️⃣ - Financeiro\n4️⃣ - Falar com Atendente' }
        ];

        let added = 0;
        for (const item of seedData) {
            const result = await this.brain.learn(item.input, item.output, true);
            if (result) added++;
        }

        logger.info(`✅ Seed training completed! Added ${added} examples`);
        return added;
    }

    // Treinar com conversas reais aprovadas
    async trainFromConversations() {
        try {
            const conversations = database.getConversationHistory('all', 1000);
            
            // Agrupar conversas por sessão
            const sessions = this.groupBySession(conversations);
            
            let trained = 0;
            for (const session of sessions) {
                // Identificar pares de pergunta-resposta
                for (let i = 0; i < session.length - 1; i++) {
                    const userMsg = session[i];
                    const botMsg = session[i + 1];
                    
                    if (userMsg.sender === 'user' && botMsg.sender === 'bot') {
                        await this.brain.learn(userMsg.message, botMsg.message, false);
                        trained++;
                    }
                }
            }
            
            logger.info(`✅ Trained from ${trained} conversation pairs`);
            return trained;
        } catch (error) {
            logger.error('Error training from conversations:', error);
            return 0;
        }
    }

    // Agrupar conversas por sessão
    groupBySession(conversations) {
        const sessions = {};
        
        conversations.forEach(conv => {
            const sessionId = conv.session_id || 'default';
            if (!sessions[sessionId]) sessions[sessionId] = [];
            sessions[sessionId].push(conv);
        });
        
        return Object.values(sessions);
    }

    // Avaliar performance da IA
    async evaluatePerformance() {
        const stats = this.brain.getStats();
        const dbStats = database.getStats();
        
        return {
            aiStats: stats,
            databaseStats: dbStats,
            timestamp: new Date().toISOString()
        };
    }

    // Exportar dados de treinamento
    exportTrainingData() {
        const data = database.getTrainingData();
        return JSON.stringify(data, null, 2);
    }

    // Importar dados de treinamento
    async importTrainingData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            let imported = 0;
            
            for (const item of data) {
                await this.brain.learn(item.input, item.output, item.approved || false);
                imported++;
            }
            
            logger.info(`✅ Imported ${imported} training examples`);
            return imported;
        } catch (error) {
            logger.error('Error importing training data:', error);
            return 0;
        }
    }
}

module.exports = new AITrainer();