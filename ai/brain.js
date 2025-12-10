const natural = require('natural');
const sentiment = require('sentiment');
const compromise = require('compromise');
const database = require('../database/database');
const logger = require('../logs/logger');

class AIBrain {
    constructor() {
        // Configurar tokenizer e classificador
        this.tokenizer = new natural.WordTokenizer();
        this.stemmer = natural.PorterStemmerPt;
        this.tfidf = new natural.TfIdf();
        this.sentimentAnalyzer = new sentiment();
        
        // Configurações
        this.minConfidence = 0.7;
        this.learningEnabled = true;
        this.contextWindow = [];
        this.maxContextSize = 10;
        
        // Cache de respostas
        this.responseCache = new Map();
        
        // Carregar dados de treinamento
        this.loadTrainingData();
        
        logger.info('🧠 AI Brain initialized');
    }

    // Carregar dados de treinamento do banco
    loadTrainingData() {
        try {
            const trainingData = database.getTrainingData();
            this.trainingData = trainingData;
            
            // Adicionar ao TF-IDF
            trainingData.forEach(item => {
                this.tfidf.addDocument(item.input);
            });
            
            logger.info(`✅ Loaded ${trainingData.length} training examples`);
        } catch (error) {
            logger.error('Error loading training data:', error);
            this.trainingData = [];
        }
    }

    // Processar mensagem
    async processMessage(message, userContext = {}) {
        try {
            // Sanitizar entrada
            const cleanMessage = this.sanitize(message);
            
            // Adicionar ao contexto
            this.addToContext(cleanMessage);
            
            // Análise de sentimento
            const sentimentResult = this.analyzeSentiment(cleanMessage);
            
            // Extrair entidades e intenções
            const entities = this.extractEntities(cleanMessage);
            const intent = this.detectIntent(cleanMessage);
            
            // Buscar melhor resposta
            const response = await this.findBestResponse(cleanMessage, userContext, intent);
            
            // Logar análise
            logger.info(`Message processed: "${cleanMessage}" | Sentiment: ${sentimentResult.comparative.toFixed(2)} | Intent: ${intent}`);
            
            return {
                response: response.text,
                confidence: response.confidence,
                sentiment: sentimentResult,
                intent: intent,
                entities: entities,
                needsHumanHandoff: response.confidence < this.minConfidence
            };
        } catch (error) {
            logger.error('Error processing message:', error);
            return {
                response: 'Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente?',
                confidence: 0,
                sentiment: { score: 0, comparative: 0 },
                intent: 'unknown',
                entities: [],
                needsHumanHandoff: true
            };
        }
    }

    // Sanitizar texto
    sanitize(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Análise de sentimento
    analyzeSentiment(text) {
        const result = this.sentimentAnalyzer.analyze(text);
        
        // Classificar sentimento
        let classification = 'neutral';
        if (result.comparative > 0.2) classification = 'positive';
        else if (result.comparative < -0.2) classification = 'negative';
        
        return {
            score: result.score,
            comparative: result.comparative,
            classification: classification,
            tokens: result.tokens
        };
    }

    // Extrair entidades (nomes, lugares, etc)
    extractEntities(text) {
        const doc = compromise(text);
        
        return {
            people: doc.people().out('array'),
            places: doc.places().out('array'),
            organizations: doc.organizations().out('array'),
            dates: doc.dates().out('array'),
            values: doc.values().out('array')
        };
    }

    // Detectar intenção
    detectIntent(message) {
        const intents = {
            greeting: /\b(oi|ola|bom dia|boa tarde|boa noite|hey|e ai)\b/i,
            farewell: /\b(tchau|ate logo|ate mais|falou|obrigado|valeu|ate)\b/i,
            question: /\b(como|quando|onde|porque|qual|quanto|quem|o que)\b/i,
            complaint: /\b(problema|erro|nao funciona|ruim|pessimo|horrivel|reclamar)\b/i,
            praise: /\b(otimo|excelente|perfeito|muito bom|parabens|top|show)\b/i,
            help: /\b(ajuda|socorro|help|auxilio|preciso)\b/i,
            purchase: /\b(comprar|preco|valor|quanto custa|orcamento|pagar)\b/i,
            support: /\b(suporte|tecnico|assistencia|manutencao)\b/i
        };

        for (const [intent, pattern] of Object.entries(intents)) {
            if (pattern.test(message)) {
                return intent;
            }
        }

        return 'unknown';
    }

    // Encontrar melhor resposta
    async findBestResponse(message, userContext, intent) {
        // Verificar cache
        const cacheKey = `${message}_${intent}`;
        if (this.responseCache.has(cacheKey)) {
            const cached = this.responseCache.get(cacheKey);
            logger.debug('Response from cache');
            return cached;
        }

        // Buscar respostas similares no banco de treinamento
        const matches = this.findSimilarResponses(message);
        
        if (matches.length > 0 && matches[0].confidence >= this.minConfidence) {
            const bestMatch = matches[0];
            
            // Atualizar contador de uso
            database.updateTrainingUsage(bestMatch.id);
            
            const response = {
                text: bestMatch.output,
                confidence: bestMatch.confidence,
                trainingId: bestMatch.id
            };
            
            // Adicionar ao cache
            this.responseCache.set(cacheKey, response);
            
            return response;
        }

        // Se não encontrou resposta boa, usar resposta padrão baseada na intenção
        return this.getDefaultResponseByIntent(intent, userContext);
    }

    // Encontrar respostas similares usando TF-IDF
    findSimilarResponses(message) {
        const results = [];
        
        this.trainingData.forEach((item, index) => {
            const similarity = this.calculateSimilarity(message, item.input);
            
            if (similarity > 0.3) { // Threshold mínimo
                results.push({
                    id: item.id,
                    input: item.input,
                    output: item.output,
                    confidence: similarity,
                    usageCount: item.usage_count
                });
            }
        });

        // Ordenar por confiança e uso
        results.sort((a, b) => {
            const confidenceDiff = b.confidence - a.confidence;
            if (Math.abs(confidenceDiff) > 0.1) return confidenceDiff;
            return b.usageCount - a.usageCount;
        });

        return results;
    }

    // Calcular similaridade entre textos
    calculateSimilarity(text1, text2) {
        const tokens1 = new Set(this.tokenizer.tokenize(text1));
        const tokens2 = new Set(this.tokenizer.tokenize(text2));
        
        // Jaccard similarity
        const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
        const union = new Set([...tokens1, ...tokens2]);
        
        const jaccardSim = intersection.size / union.size;
        
        // Levenshtein distance normalizada
        const maxLen = Math.max(text1.length, text2.length);
        const levDist = natural.LevenshteinDistance(text1, text2);
        const levSim = 1 - (levDist / maxLen);
        
        // Média ponderada
        return (jaccardSim * 0.6 + levSim * 0.4);
    }

    // Respostas padrão por intenção
    getDefaultResponseByIntent(intent, userContext) {
        const defaultResponses = {
            greeting: {
                text: `Olá${userContext.name ? ' ' + userContext.name : ''}! Como posso ajudar você hoje?`,
                confidence: 0.9
            },
            farewell: {
                text: 'Até logo! Se precisar de algo, estou por aqui! 😊',
                confidence: 0.9
            },
            question: {
                text: 'Essa é uma ótima pergunta! Vou verificar isso para você.',
                confidence: 0.5
            },
            complaint: {
                text: 'Sinto muito pelo problema! Vou encaminhar para nossa equipe resolver isso urgentemente.',
                confidence: 0.6
            },
            praise: {
                text: 'Muito obrigado pelo feedback! Ficamos felizes em ajudar! 🙏',
                confidence: 0.9
            },
            help: {
                text: 'Claro! Estou aqui para ajudar. O que você precisa?',
                confidence: 0.8
            },
            purchase: {
                text: 'Vou te conectar com nosso time de vendas para te passar as melhores condições!',
                confidence: 0.7
            },
            support: {
                text: 'Vou te transferir para nosso suporte técnico. Eles vão resolver isso rapidinho!',
                confidence: 0.7
            },
            unknown: {
                text: 'Desculpe, não entendi muito bem. Pode reformular sua pergunta?',
                confidence: 0.3
            }
        };

        return defaultResponses[intent] || defaultResponses.unknown;
    }

    // Adicionar ao contexto
    addToContext(message) {
        this.contextWindow.push({
            message: message,
            timestamp: Date.now()
        });

        // Manter apenas últimas N mensagens
        if (this.contextWindow.length > this.maxContextSize) {
            this.contextWindow.shift();
        }
    }

    // Obter contexto
    getContext() {
        return this.contextWindow;
    }

    // Limpar contexto
    clearContext() {
        this.contextWindow = [];
    }

    // Aprender nova resposta
    async learn(input, output, approved = false) {
        if (!this.learningEnabled) return false;

        try {
            // Sanitizar
            const cleanInput = this.sanitize(input);
            const cleanOutput = output.trim();

            // Verificar se já existe
            const existing = this.trainingData.find(item => 
                this.calculateSimilarity(cleanInput, item.input) > 0.9
            );

            if (existing) {
                logger.info('Similar training data already exists');
                return false;
            }

            // Salvar no banco
            const result = database.saveTrainingData(cleanInput, cleanOutput, approved ? 1 : 0);
            
            // Recarregar dados de treinamento
            this.loadTrainingData();
            
            logger.info(`✅ New training data added: "${cleanInput}"`);
            return true;
        } catch (error) {
            logger.error('Error learning new response:', error);
            return false;
        }
    }

    // Estatísticas da IA
    getStats() {
        return {
            trainingDataCount: this.trainingData.length,
            contextSize: this.contextWindow.length,
            cacheSize: this.responseCache.size,
            learningEnabled: this.learningEnabled,
            minConfidence: this.minConfidence
        };
    }
}

module.exports = new AIBrain();