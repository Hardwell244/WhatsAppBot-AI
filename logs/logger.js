const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Criar pasta de logs se não existir
const logsDir = path.join(__dirname);
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Configurar formatos
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        let log = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        if (stack) log += `\n${stack}`;
        return log;
    })
);

// Criar logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: logFormat,
    transports: [
        // Console
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        // Arquivo de erros
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        // Arquivo geral
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880,
            maxFiles: 5
        }),
        // Arquivo de mensagens
        new winston.transports.File({
            filename: path.join(logsDir, 'messages.log'),
            level: 'info',
            maxsize: 10485760, // 10MB
            maxFiles: 10
        })
    ]
});

module.exports = logger;