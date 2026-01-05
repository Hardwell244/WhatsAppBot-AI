/**
 * ============================================
 * HEALTH CHECK SCRIPT
 * Verifica a saúde do sistema
 * ============================================
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const options = {
    hostname: HOST,
    port: PORT,
    path: '/api/health',
    method: 'GET',
    timeout: 5000
};

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const health = JSON.parse(data);

            if (res.statusCode === 200 && health.success) {
                console.log('✅ Sistema saudável');
                console.log(`   Uptime: ${health.uptimeFormatted}`);
                console.log(`   Bot Status: ${health.bot.isReady ? 'ONLINE' : 'OFFLINE'}`);
                console.log(`   Memória: ${Math.round(health.memory.heapUsed / 1024 / 1024)}MB`);
                process.exit(0);
            } else {
                console.error('❌ Sistema com problemas');
                console.error(`   Status Code: ${res.statusCode}`);
                console.error(`   Resposta: ${data}`);
                process.exit(1);
            }
        } catch (error) {
            console.error('❌ Erro ao parsear resposta:', error.message);
            process.exit(1);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Falha ao conectar ao servidor:', error.message);
    process.exit(1);
});

req.on('timeout', () => {
    console.error('❌ Timeout ao verificar saúde do sistema');
    req.destroy();
    process.exit(1);
});

req.end();
