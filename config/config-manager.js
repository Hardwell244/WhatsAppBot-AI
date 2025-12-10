const fs = require('fs');
const path = require('path');
const logger = require('../logs/logger');

class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, 'bot.config.json');
        this.config = this.loadConfig();
    }

    // Carregar configuração
    loadConfig() {
        try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('Error loading config:', error);
            return null;
        }
    }

    // Salvar configuração
    saveConfig(newConfig) {
        try {
            // Backup da configuração atual
            const backupPath = path.join(__dirname, `bot.config.backup.${Date.now()}.json`);
            fs.copyFileSync(this.configPath, backupPath);

            // Salvar nova configuração
            fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2), 'utf8');
            
            this.config = newConfig;
            
            logger.info('✅ Configuration saved successfully');
            return { success: true, message: 'Configuração salva com sucesso!' };
        } catch (error) {
            logger.error('Error saving config:', error);
            return { success: false, error: error.message };
        }
    }

    // Obter configuração atual
    getConfig() {
        return this.config;
    }

    // Atualizar configuração parcial
    updateConfig(updates) {
        try {
            this.config = { ...this.config, ...updates };
            return this.saveConfig(this.config);
        } catch (error) {
            logger.error('Error updating config:', error);
            return { success: false, error: error.message };
        }
    }

    // Atualizar modo (atendimento ou triagem)
    updateMode(mode) {
        if (!['atendimento', 'triagem'].includes(mode)) {
            return { success: false, error: 'Modo inválido' };
        }
        
        this.config.mode = mode;
        return this.saveConfig(this.config);
    }

    // Atualizar departamento
    updateDepartment(deptId, data) {
        const index = this.config.departments.findIndex(d => d.id === deptId);
        
        if (index === -1) {
            return { success: false, error: 'Departamento não encontrado' };
        }
        
        this.config.departments[index] = { ...this.config.departments[index], ...data };
        return this.saveConfig(this.config);
    }

    // Adicionar departamento
    addDepartment(data) {
        const newId = Math.max(...this.config.departments.map(d => d.id), 0) + 1;
        
        const newDept = {
            id: newId,
            name: data.name || 'Novo Departamento',
            keywords: data.keywords || [],
            transfer_number: data.transfer_number || null,
            message: data.message || 'Conectando você...'
        };
        
        this.config.departments.push(newDept);
        return this.saveConfig(this.config);
    }

    // Remover departamento
    removeDepartment(deptId) {
        this.config.departments = this.config.departments.filter(d => d.id !== deptId);
        return this.saveConfig(this.config);
    }

    // Restaurar backup
    restoreBackup(backupFile) {
        try {
            const backupPath = path.join(__dirname, backupFile);
            const backupData = fs.readFileSync(backupPath, 'utf8');
            const backupConfig = JSON.parse(backupData);
            
            return this.saveConfig(backupConfig);
        } catch (error) {
            logger.error('Error restoring backup:', error);
            return { success: false, error: error.message };
        }
    }

    // Listar backups
    listBackups() {
        try {
            const files = fs.readdirSync(__dirname);
            const backups = files
                .filter(f => f.startsWith('bot.config.backup.'))
                .map(f => {
                    const stats = fs.statSync(path.join(__dirname, f));
                    return {
                        filename: f,
                        created: stats.mtime,
                        size: stats.size
                    };
                })
                .sort((a, b) => b.created - a.created);
            
            return backups;
        } catch (error) {
            logger.error('Error listing backups:', error);
            return [];
        }
    }
}

module.exports = new ConfigManager();