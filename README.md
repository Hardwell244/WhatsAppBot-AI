# 🤖 WhatsApp Bot AI

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)

**Bot inteligente de WhatsApp com IA local, aprendizado contínuo e sistema de atendimento profissional**

[Características](#-características) •
[Instalação](#-instalação) •
[Uso](#-uso) •
[API](#-api) •
[Docker](#-docker) •
[Documentação](#-documentação)

</div>

---

## 📋 Sobre o Projeto

Sistema completo de automação de atendimento via WhatsApp com:
- ✅ **IA Local** - Processamento inteligente sem dependências externas
- ✅ **Aprendizado Contínuo** - Melhora automaticamente com as conversas
- ✅ **Fluxos Configuráveis** - Sistema de conversação via JSON
- ✅ **Dashboard em Tempo Real** - Interface web com Socket.io
- ✅ **Segurança Avançada** - Proteção completa com rate limiting e criptografia
- ✅ **Docker Ready** - Deploy facilitado

---

## ✨ Características

### 🧠 Inteligência Artificial
- **2 Motores de IA**: Básico (brain.js) e Avançado (advanced-brain.js)
- **4 Algoritmos Combinados**: TF-IDF, Levenshtein, Jaro-Winkler, Bayes
- **NLP Completo**: Análise de sentimento, extração de entidades, detecção de intenções
- **Cache Inteligente**: Respostas rápidas com TTL configurável
- **Contexto de Conversa**: Memória das últimas mensagens

### 💬 Sistema de Conversação
- **Fluxos Configuráveis**: 7 tipos de etapas (message, menu, capture_data, quick_reply, ai_response, action, condition)
- **Validações Inteligentes**: CPF, CNPJ, email, telefone
- **Multi-departamentos**: Roteamento automático
- **Transferência Humana**: Escalação quando necessário
- **Horário Comercial**: Respeita horários configurados

### 🔐 Segurança
- **Criptografia AES-256-GCM**
- **Rate Limiting** (3 níveis: global, API, autenticação)
- **Sanitização Automática** de inputs
- **Validação com Joi** em todos endpoints
- **Helmet** para proteção HTTP
- **CORS Configurável**

### 📊 Monitoramento
- **Dashboard Web** em tempo real
- **Métricas Completas**: conversas, usuários, sentimento, departamentos
- **Logs Estruturados** com Winston
- **Health Checks** para DevOps
- **Prometheus Ready**

---

## 🛠 Tecnologias

- **[Node.js](https://nodejs.org/)** v14+ - Runtime
- **[Express.js](https://expressjs.com/)** v4.18 - Framework web
- **[whatsapp-web.js](https://wwebjs.dev/)** v1.23 - Cliente WhatsApp
- **[Socket.io](https://socket.io/)** v4.7 - WebSocket
- **[Natural](https://github.com/NaturalNode/natural)** v6.10 - NLP
- **[Compromise](https://compromise.cool/)** v14.10 - Análise linguística
- **[Better-SQLite3](https://github.com/WiseLibs/better-sqlite3)** v9.2 - Banco de dados
- **[Joi](https://joi.dev/)** v17.11 - Validação
- **[Helmet](https://helmetjs.github.io/)** v7.1 - Segurança

---

## 📦 Instalação

### Pré-requisitos
```bash
Node.js >= 14.0.0
npm >= 6.0.0
```

### Passos

1. **Clone o repositório**
```bash
git clone https://github.com/seu-usuario/WhatsAppBot-AI.git
cd WhatsAppBot-AI
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure o ambiente**
```bash
cp .env.example .env
# Edite .env com suas configurações
```

4. **Inicie o bot**
```bash
npm start
```

5. **Escaneie o QR Code** no terminal com WhatsApp

6. **Acesse o Dashboard** em `http://localhost:3000`

---

## 🚀 Uso

### Comandos Disponíveis

```bash
npm start          # Iniciar em produção
npm run dev        # Desenvolvimento (com nodemon)
npm run train      # Treinar IA
npm run lint       # Verificar código
npm run lint:fix   # Corrigir código
npm run format     # Formatar com Prettier
npm test           # Rodar testes
npm run health     # Verificar saúde do sistema
npm run backup:db  # Backup do banco
```

### Comandos do Bot (via WhatsApp)
- `/menu` - Menu principal
- `/status` - Status e estatísticas
- `/reset` - Reiniciar conversação
- `/help` - Ajuda

---

## 🌐 API REST

### Endpoints Principais

#### Health Check
```http
GET /api/health
```

#### Estatísticas
```http
GET /api/stats
```

#### Conversas
```http
GET /api/conversations?limit=50&offset=0
GET /api/conversations/:phone
```

#### Treinamento IA
```http
GET /api/training
POST /api/training

Body:
{
  "input": "pergunta",
  "output": "resposta"
}
```

#### Enviar Mensagem
```http
POST /api/send-message

Body:
{
  "phone": "5511999999999",
  "message": "Olá!"
}
```

#### Broadcast
```http
POST /api/broadcast

Body:
{
  "message": "Mensagem para todos",
  "phones": ["5511999999999", "5511888888888"]
}
```

---

## 🐳 Docker

### Build e Execução

```bash
# Build da imagem
npm run docker:build

# Iniciar (produção)
npm run docker:up

# Ver logs
npm run docker:logs

# Parar
npm run docker:down

# Desenvolvimento (hot reload)
npm run docker:dev
```

### Com Monitoramento

```bash
docker-compose --profile monitoring up -d
```

Isso inicia:
- WhatsApp Bot
- Redis (cache)
- Prometheus (métricas)
- Grafana (dashboards)

---

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```env
# Servidor
PORT=3000
NODE_ENV=production

# Segurança
ENCRYPTION_KEY=sua_chave_32_bytes
JWT_SECRET=seu_jwt_secret

# IA
AI_ENABLED=true
AI_MIN_CONFIDENCE=0.75
AI_LEARNING_MODE=true

# Rate Limiting
RATE_LIMIT_MAX_MESSAGES=30
```

Veja [.env.example](.env.example) para todas as opções.

### Fluxos de Conversação

Edite [config/bot.config.json](config/bot.config.json) para configurar:
- Modos de operação (atendimento/triagem)
- Fluxos de conversa
- Departamentos
- Mensagens automáticas
- Horários de atendimento

---

## 🤝 Contribuindo

Contribuições são muito bem-vindas! Veja [CONTRIBUTING.md](CONTRIBUTING.md) para detalhes.

1. Fork o projeto
2. Crie sua branch (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

---

## 📝 Licença

Este projeto está sob a licença MIT. Veja [LICENSE](LICENSE) para mais detalhes.

---

## 👨‍💻 Autor

**Octávio Augusto**

- GitHub: [@Hardwell244](https://github.com/Hardwell244)

---

## 🙏 Agradecimentos

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- [Natural](https://github.com/NaturalNode/natural)
- [Winston](https://github.com/winstonjs/winston)
- Comunidade Node.js

---

<div align="center">

**Se este projeto te ajudou, considere dar uma ⭐!**

Desenvolvido com ❤️ por Octávio Augusto

</div>
