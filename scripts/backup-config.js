/**
 * ============================================
 * BACKUP CONFIG SCRIPT
 * Faz backup do arquivo de configuração
 * ============================================
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'bot.config.json');
const BACKUP_DIR = path.join(__dirname, '..', 'config', 'backups');

// Criar diretório de backup se não existir
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Nome do backup com timestamp
const timestamp = Date.now();
const backupName = `bot.config-backup-${timestamp}.json`;
const backupPath = path.join(BACKUP_DIR, backupName);

try {
    console.log('🔄 Iniciando backup da configuração...');

    if (!fs.existsSync(CONFIG_PATH)) {
        console.error('❌ Arquivo de configuração não encontrado:', CONFIG_PATH);
        process.exit(1);
    }

    // Ler e validar JSON
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    JSON.parse(configContent); // Validar se é JSON válido

    // Copiar arquivo
    fs.copyFileSync(CONFIG_PATH, backupPath);

    console.log('✅ Backup criado com sucesso!');
    console.log(`   Arquivo: ${backupName}`);
    console.log(`   Caminho: ${backupPath}`);

    // Limpar backups antigos
    cleanOldBackups();

    process.exit(0);
} catch (error) {
    console.error('❌ Erro ao criar backup:', error.message);
    process.exit(1);
}

function cleanOldBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(file => file.startsWith('bot.config-backup-'))
            .map(file => ({
                name: file,
                path: path.join(BACKUP_DIR, file),
                time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        const MAX_BACKUPS = 10;

        if (files.length > MAX_BACKUPS) {
            const toDelete = files.slice(MAX_BACKUPS);
            console.log(`\n🗑️  Removendo ${toDelete.length} backup(s) antigo(s)...`);

            toDelete.forEach(file => {
                fs.unlinkSync(file.path);
                console.log(`   Removido: ${file.name}`);
            });
        }
    } catch (error) {
        console.warn('⚠️  Erro ao limpar backups antigos:', error.message);
    }
}
