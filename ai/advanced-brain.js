/**
 * ============================================
 * ADVANCED AI BRAIN - Octávio Augusto v2.0
 * Sistema de IA avançado com múltiplos algoritmos
 * ============================================
 */

const natural = require('natural');
const sentiment = require('sentiment');
const compromise = require('compromise');
const database = require('../database/database');
const logger = require('../logs/logger');

class AdvancedAIBrain {
    constructor() {
        // ============================================
        // INICIALIZAÇÃO DE COMPONENTES NLP
        // ============================================

        // Tokenizers e Stemmers
        this.tokenizer = new natural.WordTokenizer();
        this.stemmerPt = natural.PorterStemmerPt;
        this.stemmerEn = natural.PorterStemmer;

        // TF-IDF para análise de relevância
        this.tfidf = new natural.TfIdf();

        // Classificadores
        this.bayesClassifier = new natural.BayesClassifier();
        this.logisticRegressionClassifier = new natural.LogisticRegressionClassifier();

        // Análise de sentimento
        this.sentimentAnalyzer = new sentiment();

        // Distância de Levenshtein para similaridade
        this.levenshtein = natural.LevenshteinDistance;

        // Jaro-Winkler para matching de strings
        this.jaroWinkler = natural.JaroWinklerDistance;

        // ============================================
        // CONFIGURAÇÕES AVANÇADAS
        // ============================================

        this.config = {
            // Confiança mínima para usar resposta
            minConfidence: parseFloat(process.env.AI_MIN_CONFIDENCE) || 0.75,

            // Habilitar aprendizado
            learningEnabled: process.env.AI_LEARNING_MODE === 'true',

            // Tamanho do contexto
            maxContextSize: parseInt(process.env.AI_MAX_CONTEXT_SIZE) || 10,

            // Threshold para similaridade
            similarityThreshold: 0.85,

            // Peso dos algoritmos na decisão final
            weights: {
                tfidf: 0.30,
                levenshtein: 0.25,
                jaroWinkler: 0.20,
                bayes: 0.15,
                context: 0.10
            },

            // Cache
            cacheEnabled: true,
            cacheMaxSize: 1000,
            cacheTTL: 3600000 // 1 hora
        };

        // ============================================
        // ESTRUTURAS DE DADOS
        // ============================================

        // Dados de treinamento
        this.trainingData = [];

        // Contexto de conversação (últimas N mensagens)
        this.conversationContext = new Map();

        // Cache de respostas
        this.responseCache = new Map();

        // Padrões de intenção (Intent Detection)
        this.intentPatterns = this.initializeIntentPatterns();

        // Entidades conhecidas
        this.knownEntities = {
            produtos: ['plano', 'serviço', 'produto', 'pacote', 'assinatura'],
            pagamento: ['pagar', 'pagamento', 'boleto', 'pix', 'cartão', 'fatura'],
            suporte: ['problema', 'erro', 'ajuda', 'dúvida', 'questão', 'bug'],
            vendas: ['comprar', 'adquirir', 'contratar', 'orçamento', 'preço'],
            cancelamento: ['cancelar', 'desistir', 'encerrar', 'parar']
        };

        // Sinônimos e expansões
        this.synonyms = {
            'oi': ['olá', 'opa', 'eae', 'e aí', 'oie', 'hello', 'hi'],
            'obrigado': ['obrigada', 'vlw', 'valeu', 'thanks', 'thx'],
            'sim': ['yes', 'claro', 'com certeza', 'pode ser', 'ok'],
            'não': ['no', 'nao', 'negativo', 'jamais', 'de jeito nenhum']
        };

        // Estatísticas
        this.stats = {
            totalProcessed: 0,
            cacheHits: 0,
            averageConfidence: 0,
            intentDistribution: {},
            sentimentDistribution: { positive: 0, negative: 0, neutral: 0 }
        };

        // Inicializar
        this.initialize();

        logger.info('🧠 Advanced AI Brain v2.0 initialized');
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    async initialize() {
        try {
            await this.loadTrainingData();
            await this.trainClassifiers();
            this.startCacheCleanup();

            logger.info(`✅ AI Brain ready with ${this.trainingData.length} training examples`);
        } catch (error) {
            logger.error('Error initializing AI Brain:', error);
        }
    }

    // Carregar dados de treinamento
    async loadTrainingData() {
        try {
            const data = database.getTrainingData();
            this.trainingData = data.filter(item => item.approved === 1);

            // Adicionar ao TF-IDF
            this.trainingData.forEach(item => {
                this.tfidf.addDocument(this.preprocessText(item.input));
            });

            logger.info(`📚 Loaded ${this.trainingData.length} approved training examples`);
        } catch (error) {
            logger.error('Error loading training data:', error);
            this.trainingData = [];
        }
    }

    // Treinar classificadores
    async trainClassifiers() {
        if (this.trainingData.length === 0) {
            return;
        }

        try {
            // Treinar Bayes com intenções
            this.trainingData.forEach(item => {
                const intent = this.extractIntentFromResponse(item.output);
                if (intent) {
                    this.bayesClassifier.addDocument(
                        this.preprocessText(item.input),
                        intent
                    );
                }
            });

            this.bayesClassifier.train();

            logger.info('✅ Classifiers trained successfully');
        } catch (error) {
            logger.error('Error training classifiers:', error);
        }
    }

    // ============================================
    // PROCESSAMENTO DE MENSAGEM
    // ============================================

    async processMessage(message, userContext = {}) {
        const startTime = Date.now();

        try {
            // Sanitizar entrada
            const cleanMessage = this.sanitizeInput(message);

            if (!cleanMessage) {
                throw new Error('Empty message after sanitization');
            }

            // Verificar cache
            if (this.config.cacheEnabled) {
                const cached = this.getCachedResponse(cleanMessage);
                if (cached) {
                    this.stats.cacheHits++;
                    logger.debug(`Cache hit for: "${cleanMessage}"`);
                    return cached;
                }
            }

            // Pré-processar texto
            const processedMessage = this.preprocessText(cleanMessage);

            // Análises paralelas
            const [
                sentimentResult,
                entities,
                intent,
                keywords
            ] = await Promise.all([
                this.analyzeSentiment(cleanMessage),
                this.extractEntities(cleanMessage),
                this.detectIntent(processedMessage),
                this.extractKeywords(processedMessage)
            ]);

            // Adicionar ao contexto
            this.updateConversationContext(userContext.phone, {
                message: cleanMessage,
                intent,
                sentiment: sentimentResult.label,
                timestamp: Date.now()
            });

            // Buscar melhor resposta usando múltiplos algoritmos
            const response = await this.findBestResponse(
                processedMessage,
                userContext,
                intent,
                entities
            );

            // Preparar resultado
            const result = {
                response: response.text,
                confidence: response.confidence,
                sentiment: sentimentResult,
                intent: intent,
                entities: entities,
                keywords: keywords,
                needsHumanHandoff: response.confidence < this.config.minConfidence,
                processingTime: Date.now() - startTime,
                algorithm: response.algorithm
            };

            // Cachear resposta
            if (this.config.cacheEnabled && response.confidence >= 0.8) {
                this.cacheResponse(cleanMessage, result);
            }

            // Atualizar estatísticas
            this.updateStats(result);

            // Aprendizado automático
            if (this.config.learningEnabled && response.confidence >= 0.85) {
                this.learnFromInteraction(cleanMessage, response.text, response.confidence);
            }

            logger.info(
                `Message processed: "${cleanMessage.substring(0, 50)}..." | ` +
                `Confidence: ${(response.confidence * 100).toFixed(1)}% | ` +
                `Intent: ${intent} | ` +
                `Sentiment: ${sentimentResult.label} | ` +
                `Time: ${result.processingTime}ms`
            );

            return result;

        } catch (error) {
            logger.error('Error processing message:', error);
            return this.getErrorResponse(error);
        }
    }

    // ============================================
    // PRÉ-PROCESSAMENTO DE TEXTO
    // ============================================

    sanitizeInput(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        return text
            .trim()
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/[<>\"\']/g, '') // Remove caracteres perigosos
            .substring(0, 1000); // Limita tamanho
    }

    preprocessText(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^\w\s]/g, ' ') // Remove pontuação
            .replace(/\s+/g, ' ') // Normaliza espaços
            .trim();
    }

    // Expandir sinônimos
    expandSynonyms(text) {
        let expanded = text;

        for (const [word, synonyms] of Object.entries(this.synonyms)) {
            const pattern = new RegExp(`\\b${word}\\b`, 'gi');
            if (pattern.test(expanded)) {
                expanded += ' ' + synonyms.join(' ');
            }
        }

        return expanded;
    }

    // ============================================
    // ANÁLISE DE SENTIMENTO AVANÇADA
    // ============================================

    analyzeSentiment(text) {
        const result = this.sentimentAnalyzer.analyze(text);

        // Classificar sentimento
        let label = 'neutral';
        if (result.comparative > 0.2) {
            label = 'positive';
        } else if (result.comparative < -0.2) {
            label = 'negative';
        }

        // Detectar emoções específicas
        const emotions = this.detectEmotions(text);

        return {
            score: result.score,
            comparative: result.comparative,
            label: label,
            emotions: emotions,
            positive: result.positive,
            negative: result.negative
        };
    }

    detectEmotions(text) {
        const emotionPatterns = {
            joy: /feliz|alegre|contente|animado|satisfeito|maravilhoso|ótimo|excelente/i,
            sadness: /triste|chateado|decepcionado|frustrado|infeliz/i,
            anger: /raiva|irritado|furioso|bravo|puto|revoltado/i,
            fear: /medo|receio|preocupado|ansioso|nervoso/i,
            surprise: /surpreso|chocado|impressionado|uau/i,
            disgust: /nojo|repugnante|horrível|péssimo/i
        };

        const emotions = [];

        for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
            if (pattern.test(text)) {
                emotions.push(emotion);
            }
        }

        return emotions;
    }

    // ============================================
    // EXTRAÇÃO DE ENTIDADES (NER)
    // ============================================

    extractEntities(text) {
        const entities = {
            people: [],
            places: [],
            organizations: [],
            dates: [],
            numbers: [],
            emails: [],
            phones: [],
            custom: {}
        };

        try {
            // Usar compromise para NER
            const doc = compromise(text);

            // Pessoas
            entities.people = doc.people().out('array');

            // Lugares
            entities.places = doc.places().out('array');

            // Organizações
            entities.organizations = doc.organizations().out('array');

            // Datas
            entities.dates = doc.dates().out('array');

            // Números
            entities.numbers = doc.numbers().out('array');

            // Emails (regex)
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
            entities.emails = text.match(emailRegex) || [];

            // Telefones (regex brasileiro)
            const phoneRegex = /(\(?\d{2}\)?\s?)?9?\d{4}-?\d{4}/g;
            entities.phones = text.match(phoneRegex) || [];

            // Entidades customizadas
            for (const [category, keywords] of Object.entries(this.knownEntities)) {
                const found = keywords.filter(keyword =>
                    text.toLowerCase().includes(keyword)
                );
                if (found.length > 0) {
                    entities.custom[category] = found;
                }
            }

        } catch (error) {
            logger.error('Error extracting entities:', error);
        }

        return entities;
    }

    // ============================================
    // DETECÇÃO DE INTENÇÃO (Intent Detection)
    // ============================================

    detectIntent(text) {
        // Usar padrões pré-definidos
        for (const [intent, patterns] of Object.entries(this.intentPatterns)) {
            for (const pattern of patterns) {
                if (pattern.test(text)) {
                    return intent;
                }
            }
        }

        // Usar classificador Bayes
        try {
            const classification = this.bayesClassifier.classify(text);
            if (classification) {
                return classification;
            }
        } catch (error) {
            logger.debug('Bayes classification failed:', error.message);
        }

        return 'unknown';
    }

    initializeIntentPatterns() {
        return {
            greeting: [
                /^(oi|ola|olá|hey|opa|eae|e ai|bom dia|boa tarde|boa noite)/i
            ],
            farewell: [
                /^(tchau|ate logo|até logo|falou|flw|adeus|bye|até mais)/i
            ],
            gratitude: [
                /(obrigad[oa]|valeu|vlw|thanks|agradeço)/i
            ],
            question: [
                /^(qual|como|quando|onde|por que|porque|quem|quanto)/i,
                /\?$/
            ],
            complaint: [
                /(problema|erro|bug|falha|não funciona|nao funciona|reclamação)/i
            ],
            praise: [
                /(parabéns|parabens|excelente|ótimo|otimo|perfeito|maravilhoso|amei)/i
            ],
            help: [
                /(ajuda|socorro|help|duvida|dúvida|como faço|como faco)/i
            ],
            purchase: [
                /(comprar|adquirir|contratar|quero|preciso|gostaria de|preço|preco|valor)/i
            ],
            support: [
                /(suporte|atendimento|falar com|preciso de ajuda)/i
            ],
            cancel: [
                /(cancelar|desistir|não quero|nao quero|encerrar)/i
            ],
            confirm: [
                /^(sim|yes|claro|com certeza|pode ser|ok|okay|certo)/i
            ],
            deny: [
                /^(não|nao|no|negativo|nunca|jamais)/i
            ]
        };
    }

    extractIntentFromResponse(response) {
        // Lógica simples para extrair intenção da resposta
        // Pode ser melhorada com ML
        if (/saudação|olá|bem-vindo/i.test(response)) {
            return 'greeting';
        }
        if (/pagamento|boleto|pix/i.test(response)) {
            return 'payment';
        }
        if (/suporte|ajuda/i.test(response)) {
            return 'support';
        }
        return 'general';
    }

    // ============================================
    // EXTRAÇÃO DE PALAVRAS-CHAVE
    // ============================================

    extractKeywords(text, topN = 5) {
        const tokens = this.tokenizer.tokenize(text);
        const stemmed = tokens.map(token => this.stemmerPt.stem(token));

        // Remover stopwords
        const stopwords = ['o', 'a', 'de', 'da', 'do', 'e', 'para', 'com', 'em', 'que'];
        const filtered = stemmed.filter(word => !stopwords.includes(word));

        // Contar frequência
        const frequency = {};
        filtered.forEach(word => {
            frequency[word] = (frequency[word] || 0) + 1;
        });

        // Ordenar por frequência
        const sorted = Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN)
            .map(([word]) => word);

        return sorted;
    }

    // ============================================
    // BUSCA DE MELHOR RESPOSTA (Multi-Algorithm)
    // ============================================

    async findBestResponse(processedMessage, userContext, intent, entities) {
        if (this.trainingData.length === 0) {
            return {
                text: 'Ainda estou aprendendo. Em breve poderei ajudar melhor!',
                confidence: 0.3,
                algorithm: 'fallback'
            };
        }

        const candidates = [];

        // ============================================
        // ALGORITMO 1: TF-IDF
        // ============================================

        try {
            const tfidfScores = [];
            this.tfidf.tfidfs(processedMessage, (i, measure) => {
                if (i < this.trainingData.length) {
                    tfidfScores.push({
                        index: i,
                        score: measure,
                        weight: this.config.weights.tfidf
                    });
                }
            });

            const topTfidf = tfidfScores
                .sort((a, b) => b.score - a.score)
                .slice(0, 5);

            topTfidf.forEach(result => {
                const data = this.trainingData[result.index];
                candidates.push({
                    text: data.output,
                    confidence: result.score * result.weight,
                    algorithm: 'tfidf',
                    trainingId: data.id
                });
            });
        } catch (error) {
            logger.debug('TF-IDF error:', error.message);
        }

        // ============================================
        // ALGORITMO 2: Levenshtein Distance
        // ============================================

        try {
            this.trainingData.forEach(data => {
                const distance = this.levenshtein(
                    processedMessage,
                    this.preprocessText(data.input)
                );
                const maxLen = Math.max(processedMessage.length, data.input.length);
                const similarity = 1 - (distance / maxLen);

                if (similarity > 0.5) {
                    candidates.push({
                        text: data.output,
                        confidence: similarity * this.config.weights.levenshtein,
                        algorithm: 'levenshtein',
                        trainingId: data.id
                    });
                }
            });
        } catch (error) {
            logger.debug('Levenshtein error:', error.message);
        }

        // ============================================
        // ALGORITMO 3: Jaro-Winkler Distance
        // ============================================

        try {
            this.trainingData.forEach(data => {
                const similarity = this.jaroWinkler(
                    processedMessage,
                    this.preprocessText(data.input)
                );

                if (similarity > 0.7) {
                    candidates.push({
                        text: data.output,
                        confidence: similarity * this.config.weights.jaroWinkler,
                        algorithm: 'jarowinkler',
                        trainingId: data.id
                    });
                }
            });
        } catch (error) {
            logger.debug('Jaro-Winkler error:', error.message);
        }

        // ============================================
        // ALGORITMO 4: Contexto de Conversação
        // ============================================

        if (userContext.phone) {
            const context = this.getConversationContext(userContext.phone);
            if (context.length > 0) {
                const recentIntents = context.slice(-3).map(c => c.intent);

                // Boost respostas relacionadas ao contexto
                candidates.forEach(candidate => {
                    if (recentIntents.includes(intent)) {
                        candidate.confidence += this.config.weights.context;
                    }
                });
            }
        }

        // ============================================
        // SELECIONAR MELHOR CANDIDATO
        // ============================================

        if (candidates.length === 0) {
            return {
                text: 'Não tenho certeza sobre isso. Você pode reformular sua pergunta?',
                confidence: 0.2,
                algorithm: 'none'
            };
        }

        // Agrupar por texto e somar confiança
        const grouped = {};
        candidates.forEach(candidate => {
            if (!grouped[candidate.text]) {
                grouped[candidate.text] = {
                    text: candidate.text,
                    confidence: 0,
                    algorithms: []
                };
            }
            grouped[candidate.text].confidence += candidate.confidence;
            grouped[candidate.text].algorithms.push(candidate.algorithm);
        });

        // Selecionar melhor
        const best = Object.values(grouped)
            .sort((a, b) => b.confidence - a.confidence)[0];

        // Normalizar confiança
        best.confidence = Math.min(best.confidence, 1.0);
        best.algorithm = best.algorithms.join('+');

        // Atualizar uso no banco
        if (best.confidence >= this.config.minConfidence) {
            this.updateTrainingUsage(candidates[0].trainingId);
        }

        return best;
    }

    // ============================================
    // CONTEXTO DE CONVERSAÇÃO
    // ============================================

    updateConversationContext(phone, entry) {
        if (!phone) {
            return;
        }

        if (!this.conversationContext.has(phone)) {
            this.conversationContext.set(phone, []);
        }

        const context = this.conversationContext.get(phone);
        context.push(entry);

        // Limitar tamanho
        if (context.length > this.config.maxContextSize) {
            context.shift();
        }
    }

    getConversationContext(phone) {
        return this.conversationContext.get(phone) || [];
    }

    clearConversationContext(phone) {
        this.conversationContext.delete(phone);
    }

    // ============================================
    // CACHE DE RESPOSTAS
    // ============================================

    getCachedResponse(message) {
        const cached = this.responseCache.get(message);

        if (!cached) {
            return null;
        }

        // Verificar TTL
        if (Date.now() - cached.timestamp > this.config.cacheTTL) {
            this.responseCache.delete(message);
            return null;
        }

        return cached.response;
    }

    cacheResponse(message, response) {
        // Limitar tamanho do cache
        if (this.responseCache.size >= this.config.cacheMaxSize) {
            const firstKey = this.responseCache.keys().next().value;
            this.responseCache.delete(firstKey);
        }

        this.responseCache.set(message, {
            response: response,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.responseCache.clear();
        logger.info('Response cache cleared');
    }

    startCacheCleanup() {
        // Limpar cache expirado a cada hora
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this.responseCache.entries()) {
                if (now - value.timestamp > this.config.cacheTTL) {
                    this.responseCache.delete(key);
                }
            }
            logger.debug(`Cache cleanup: ${this.responseCache.size} entries remaining`);
        }, 3600000);
    }

    // ============================================
    // APRENDIZADO AUTOMÁTICO
    // ============================================

    async learn(input, output, approved = false) {
        try {
            // Salvar no banco
            const confidence = approved ? 1.0 : 0.8;
            database.saveTrainingData(input, output, confidence, approved ? 1 : 0);

            // Adicionar ao TF-IDF
            this.tfidf.addDocument(this.preprocessText(input));

            // Recarregar dados
            await this.loadTrainingData();

            // Re-treinar classificadores
            if (approved) {
                await this.trainClassifiers();
            }

            logger.info(`📚 New training added: "${input}" -> "${output}"`);

            return true;
        } catch (error) {
            logger.error('Error learning:', error);
            return false;
        }
    }

    async learnFromInteraction(input, output, confidence) {
        // Aprendizado automático apenas se confiança alta
        if (confidence >= 0.85 && this.config.learningEnabled) {
            await this.learn(input, output, false);
        }
    }

    updateTrainingUsage(trainingId) {
        try {
            database.updateTrainingUsage(trainingId);
        } catch (error) {
            logger.debug('Error updating training usage:', error.message);
        }
    }

    // ============================================
    // ESTATÍSTICAS
    // ============================================

    updateStats(result) {
        this.stats.totalProcessed++;

        // Confiança média
        this.stats.averageConfidence =
            (this.stats.averageConfidence * (this.stats.totalProcessed - 1) + result.confidence) /
            this.stats.totalProcessed;

        // Distribuição de intenções
        this.stats.intentDistribution[result.intent] =
            (this.stats.intentDistribution[result.intent] || 0) + 1;

        // Distribuição de sentimento
        this.stats.sentimentDistribution[result.sentiment.label]++;
    }

    getStats() {
        return {
            trainingDataCount: this.trainingData.length,
            totalProcessed: this.stats.totalProcessed,
            cacheSize: this.responseCache.size,
            cacheHits: this.stats.cacheHits,
            cacheHitRate: this.stats.totalProcessed > 0
                ? (this.stats.cacheHits / this.stats.totalProcessed * 100).toFixed(2) + '%'
                : '0%',
            averageConfidence: (this.stats.averageConfidence * 100).toFixed(2) + '%',
            intentDistribution: this.stats.intentDistribution,
            sentimentDistribution: this.stats.sentimentDistribution,
            config: this.config
        };
    }

    // ============================================
    // UTILITÁRIOS
    // ============================================

    getErrorResponse(error) {
        return {
            response: 'Desculpe, tive um problema ao processar sua mensagem. Nossa equipe foi notificada.',
            confidence: 0,
            sentiment: { score: 0, comparative: 0, label: 'neutral', emotions: [] },
            intent: 'error',
            entities: {},
            keywords: [],
            needsHumanHandoff: true,
            error: error.message
        };
    }

    // Resetar IA
    async reset() {
        this.responseCache.clear();
        this.conversationContext.clear();
        await this.loadTrainingData();
        await this.trainClassifiers();
        logger.info('🔄 AI Brain reset completed');
    }
}

// Singleton
const advancedBrain = new AdvancedAIBrain();

module.exports = advancedBrain;
