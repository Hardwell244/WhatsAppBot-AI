/**
 * ============================================
 * BACKUP DATABASE SCRIPT
 * Faz backup do banco de dados SQLite
 * ============================================
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database', 'bot.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Criar diretório de backup se não existir
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Nome do backup com timestamp
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupName = `bot-db-backup-${timestamp}.db`;
const backupPath = path.join(BACKUP_DIR, backupName);

try {
    console.log('🔄 Iniciando backup do banco de dados...');

    if (!fs.existsSync(DB_PATH)) {
        console.error('❌ Banco de dados não encontrado:', DB_PATH);
        process.exit(1);
    }

    // Copiar arquivo
    fs.copyFileSync(DB_PATH, backupPath);

    // Verificar se foi copiado
    const stats = fs.statSync(backupPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log('✅ Backup criado com sucesso!');
    console.log(`   Arquivo: ${backupName}`);
    console.log(`   Tamanho: ${sizeInMB} MB`);
    console.log(`   Caminho: ${backupPath}`);

    // Limpar backups antigos (manter apenas os últimos 7)
    cleanOldBackups();

    process.exit(0);
} catch (error) {
    console.error('❌ Erro ao criar backup:', error.message);
    process.exit(1);
}

function cleanOldBackups() {
    try {
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(file => file.startsWith('bot-db-backup-'))
            .map(file => ({
                name: file,
                path: path.join(BACKUP_DIR, file),
                time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS) || 7;

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
