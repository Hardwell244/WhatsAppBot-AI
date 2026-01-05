# Contribuindo para WhatsApp Bot AI - Octávio Augusto

Primeiramente, obrigado por considerar contribuir com o WhatsApp Bot AI! São pessoas como você que tornam este projeto cada vez melhor.

## Código de Conduta

Este projeto e todos os participantes estão sob o Código de Conduta. Ao participar, espera-se que você mantenha esse código. Por favor, reporte comportamentos inaceitáveis.

## Como posso contribuir?

### Reportando Bugs

Antes de criar um relatório de bug, verifique se já não existe uma issue sobre o problema. Se você não encontrar uma issue aberta sobre o problema, crie uma nova.

**Bons relatórios de bug incluem:**

- Um título claro e descritivo
- Passos detalhados para reproduzir o problema
- Comportamento esperado vs comportamento atual
- Screenshots (se aplicável)
- Informações do ambiente (OS, versão do Node.js, etc.)
- Logs relevantes

**Exemplo de template:**

```markdown
## Descrição
[Descrição clara e concisa do bug]

## Passos para Reproduzir
1. Vá para '...'
2. Clique em '...'
3. Role até '...'
4. Veja o erro

## Comportamento Esperado
[O que deveria acontecer]

## Comportamento Atual
[O que realmente acontece]

## Screenshots
[Se aplicável, adicione screenshots]

## Ambiente
- OS: [e.g. Windows 10, Ubuntu 20.04]
- Node.js: [e.g. v18.0.0]
- npm: [e.g. 8.0.0]
- Versão do Bot: [e.g. 1.0.0]

## Logs
[Adicione logs relevantes]
```

### Sugerindo Melhorias

Sugestões de melhorias são rastreadas como GitHub issues. Crie uma issue e forneça as seguintes informações:

- Use um título claro e descritivo
- Forneça uma descrição detalhada da melhoria sugerida
- Explique por que essa melhoria seria útil
- Liste exemplos de como a feature funcionaria
- Se possível, sugira uma implementação

### Pull Requests

#### Processo de Pull Request

1. **Fork o repositório** e crie sua branch a partir de `main`
2. **Faça suas mudanças** seguindo os padrões de código
3. **Adicione testes** se você criou código novo
4. **Atualize a documentação** se necessário
5. **Certifique-se de que os testes passam** (`npm test`)
6. **Certifique-se de que o código está formatado** (`npm run format`)
7. **Faça commit das suas mudanças** usando mensagens descritivas
8. **Push para sua branch** e abra um Pull Request

#### Mensagens de Commit

Usamos mensagens de commit semânticas. Siga este formato:

```
<tipo>(<escopo>): <assunto>

<corpo>

<rodapé>
```

**Tipos:**
- `feat`: Nova feature
- `fix`: Correção de bug
- `docs`: Mudanças na documentação
- `style`: Formatação, ponto e vírgula faltando, etc (sem mudança de código)
- `refactor`: Refatoração de código
- `perf`: Melhoria de performance
- `test`: Adição ou correção de testes
- `chore`: Mudanças no processo de build, ferramentas auxiliares, etc

**Exemplos:**

```bash
feat(ai): adiciona suporte para análise de sentimento em tempo real

- Implementa análise de sentimento usando biblioteca sentiment
- Adiciona cache para melhorar performance
- Atualiza documentação da API

Closes #123
```

```bash
fix(whatsapp): corrige vazamento de memória no processamento de mensagens

O processamento de mensagens não estava limpando o cache corretamente,
causando vazamento de memória após uso prolongado.

Fixes #456
```

### Padrões de Código

#### JavaScript

- Use ES6+ features (const, let, arrow functions, template literals, etc.)
- Use 4 espaços para indentação
- Use aspas simples para strings
- Use ponto e vírgula
- Limite linhas a 120 caracteres
- Nomeie variáveis e funções de forma descritiva
- Adicione JSDoc para funções públicas

**Exemplo:**

```javascript
/**
 * Processa uma mensagem do usuário e retorna uma resposta
 * @param {string} message - Mensagem do usuário
 * @param {Object} context - Contexto do usuário
 * @returns {Promise<string>} Resposta processada
 */
async function processMessage(message, context) {
    const normalizedMessage = message.trim().toLowerCase();

    if (!normalizedMessage) {
        throw new Error('Mensagem vazia');
    }

    const response = await aiEngine.generateResponse(normalizedMessage, context);
    return response;
}
```

#### Estrutura de Pastas

```
whatsappbot-ai/
├── ai/                 # Módulos de IA
├── config/             # Configurações
├── database/           # Banco de dados
├── modules/            # Módulos principais
├── security/           # Segurança
├── logs/               # Logs
├── tests/              # Testes
│   ├── unit/          # Testes unitários
│   └── integration/   # Testes de integração
├── scripts/            # Scripts utilitários
└── dashboard/          # Dashboard web
```

### Testes

- Escreva testes para novas features
- Mantenha a cobertura de testes acima de 80%
- Use Jest para testes
- Separe testes unitários e de integração

**Exemplo de teste:**

```javascript
describe('AIBrain', () => {
    describe('processMessage', () => {
        it('deve processar mensagem simples', async () => {
            const message = 'Olá';
            const context = { phone: '5511999999999' };

            const result = await AIBrain.processMessage(message, context);

            expect(result).toBeDefined();
            expect(result.response).toBeTruthy();
            expect(result.confidence).toBeGreaterThan(0);
        });

        it('deve rejeitar mensagem vazia', async () => {
            const message = '';
            const context = { phone: '5511999999999' };

            await expect(AIBrain.processMessage(message, context))
                .rejects
                .toThrow('Mensagem vazia');
        });
    });
});
```

### Documentação

- Atualize o README.md se você mudar funcionalidades
- Adicione JSDoc para funções públicas
- Documente APIs e endpoints novos
- Adicione exemplos de uso quando aplicável

## Configuração do Ambiente de Desenvolvimento

1. **Clone o repositório**
```bash
git clone https://github.com/seu-usuario/WhatsAppBot-AI.git
cd WhatsAppBot-AI
```

2. **Instale as dependências**
```bash
npm install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env
# Edite .env com suas configurações
```

4. **Execute os testes**
```bash
npm test
```

5. **Inicie em modo desenvolvimento**
```bash
npm run dev
```

## Ferramentas Recomendadas

- **Editor**: VSCode com extensões ESLint e Prettier
- **Terminal**: Git Bash (Windows) ou terminal padrão (Linux/Mac)
- **Cliente API**: Postman ou Insomnia
- **Git GUI**: GitKraken, SourceTree ou GitHub Desktop

## Processo de Review

Todas as submissões, incluindo submissões de membros do projeto, requerem review. Usamos GitHub pull requests para esse propósito.

**O que procuramos em um PR:**

- ✅ Código limpo e bem documentado
- ✅ Testes adequados
- ✅ Sem breaking changes (a menos que acordado)
- ✅ Documentação atualizada
- ✅ Commits bem descritos

## Comunicação

- **Issues**: Para bugs e feature requests
- **Discussions**: Para perguntas e discussões gerais
- **Pull Requests**: Para contribuições de código

## Reconhecimento

Todos os contribuidores serão reconhecidos no README.md do projeto.

## Dúvidas?

Sinta-se à vontade para abrir uma issue com a tag `question` ou iniciar uma discussão.

---

**Obrigado por contribuir!** 🎉

Sua ajuda é fundamental para tornar este projeto cada vez melhor.
