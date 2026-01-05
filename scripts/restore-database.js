/**
 * ============================================
 * RESTORE DATABASE SCRIPT
 * Restaura backup do banco de dados
 * ============================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DB_PATH = path.join(__dirname, '..', 'database', 'bot.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Listar backups disponíveis
try {
    if (!fs.existsSync(BACKUP_DIR)) {
        console.error('❌ Diretório de backups não encontrado');
        process.exit(1);
    }

    const backups = fs.readdirSync(BACKUP_DIR)
        .filter(file => file.startsWith('bot-db-backup-'))
        .map(file => ({
            name: file,
            path: path.join(BACKUP_DIR, file),
            time: fs.statSync(path.join(BACKUP_DIR, file)).mtime
        }))
        .sort((a, b) => b.time - a.time);

    if (backups.length === 0) {
        console.error('❌ Nenhum backup encontrado');
        process.exit(1);
    }

    console.log('\n📦 Backups disponíveis:\n');

    backups.forEach((backup, index) => {
        const size = (fs.statSync(backup.path).size / (1024 * 1024)).toFixed(2);
        console.log(`${index + 1}. ${backup.name}`);
        console.log(`   Data: ${backup.time.toLocaleString('pt-BR')}`);
        console.log(`   Tamanho: ${size} MB\n`);
    });

    rl.question('Escolha o número do backup para restaurar (ou "q" para sair): ', (answer) => {
        if (answer.toLowerCase() === 'q') {
            console.log('👋 Operação cancelada');
            rl.close();
            process.exit(0);
        }

        const index = parseInt(answer) - 1;

        if (isNaN(index) || index < 0 || index >= backups.length) {
            console.error('❌ Opção inválida');
            rl.close();
            process.exit(1);
        }

        const selectedBackup = backups[index];

        console.log(`\n⚠️  ATENÇÃO: Você está prestes a restaurar o backup:`);
        console.log(`   ${selectedBackup.name}`);
        console.log(`   Isso irá SOBRESCREVER o banco de dados atual!\n`);

        rl.question('Tem certeza? (sim/não): ', (confirm) => {
            if (confirm.toLowerCase() !== 'sim') {
                console.log('👋 Operação cancelada');
                rl.close();
                process.exit(0);
            }

            try {
                // Fazer backup do DB atual antes de restaurar
                if (fs.existsSync(DB_PATH)) {
                    const preRestoreBackup = path.join(BACKUP_DIR, `pre-restore-${Date.now()}.db`);
                    fs.copyFileSync(DB_PATH, preRestoreBackup);
                    console.log(`\n💾 Backup pré-restauração salvo: ${path.basename(preRestoreBackup)}`);
                }

                // Restaurar backup
                fs.copyFileSync(selectedBackup.path, DB_PATH);

                console.log('✅ Banco de dados restaurado com sucesso!');
                console.log(`   Backup restaurado: ${selectedBackup.name}`);
                console.log('\n⚠️  Reinicie o bot para aplicar as mudanças');

                rl.close();
                process.exit(0);
            } catch (error) {
                console.error('❌ Erro ao restaurar backup:', error.message);
                rl.close();
                process.exit(1);
            }
        });
    });
} catch (error) {
    console.error('❌ Erro:', error.message);
    rl.close();
    process.exit(1);
}
