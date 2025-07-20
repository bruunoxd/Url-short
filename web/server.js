const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { Pool } = require('pg');

const PORT = 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Configuração do banco PostgreSQL
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB || 'url_shortener',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
});

// Inicializar banco de dados
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS short_urls (
                id SERIAL PRIMARY KEY,
                original_url TEXT NOT NULL,
                short_code VARCHAR(10) UNIQUE NOT NULL,
                click_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE
            )
        `);
        
        // Inserir dados de exemplo se a tabela estiver vazia
        const result = await pool.query('SELECT COUNT(*) FROM short_urls');
        if (parseInt(result.rows[0].count) === 0) {
            await pool.query(`
                INSERT INTO short_urls (original_url, short_code, click_count, created_at, is_active) VALUES 
                ('https://www.google.com', 'abc123', 15, NOW() - INTERVAL '1 day', true),
                ('https://github.com', 'def456', 8, NOW() - INTERVAL '2 days', true),
                ('https://stackoverflow.com', 'ghi789', 23, NOW() - INTERVAL '3 days', true)
            `);
        }
        
        console.log('✅ Banco de dados inicializado com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error);
    }
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Servir arquivo HTML principal
    if (pathname === '/' || pathname === '/index.html') {
        serveFile(res, 'index.html', 'text/html');
        return;
    }

    // API para encurtar URL
    if (pathname === '/api/shorten' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const result = await shortenUrl(data.originalUrl, data.customCode);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    data: result
                }));
            } catch (error) {
                console.error('Erro ao encurtar URL:', error);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: false,
                    message: error.message || 'Dados inválidos'
                }));
            }
        });
        return;
    }

    // API para listar URLs recentes
    if (pathname === '/api/urls' && method === 'GET') {
        try {
            const result = await pool.query(
                'SELECT * FROM short_urls ORDER BY created_at DESC LIMIT 10'
            );
            
            const urls = result.rows.map(row => ({
                id: row.id,
                originalUrl: row.original_url,
                shortCode: row.short_code,
                clickCount: row.click_count,
                createdAt: row.created_at.toISOString(),
                isActive: row.is_active
            }));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                data: urls
            }));
        } catch (error) {
            console.error('Erro ao buscar URLs:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: 'Erro interno do servidor'
            }));
        }
        return;
    }

    // Redirecionamento de URLs encurtadas
    if (pathname.length > 1 && method === 'GET') {
        const shortCode = pathname.substring(1);
        
        try {
            const result = await pool.query(
                'SELECT * FROM short_urls WHERE short_code = $1 AND is_active = true',
                [shortCode]
            );
            
            if (result.rows.length > 0) {
                const urlData = result.rows[0];
                
                // Incrementar contador de cliques
                await pool.query(
                    'UPDATE short_urls SET click_count = click_count + 1, updated_at = NOW() WHERE short_code = $1',
                    [shortCode]
                );
                
                // Log do clique
                console.log(`🔗 Redirecionamento: ${shortCode} -> ${urlData.original_url} (${urlData.click_count + 1} cliques)`);
                
                // Redirecionar
                res.writeHead(302, { 'Location': urlData.original_url });
                res.end();
                return;
            } else {
                // URL não encontrada
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Link não encontrado</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #e74c3c; font-size: 24px; margin-bottom: 20px; }
                            .message { color: #666; font-size: 16px; }
                            .back-link { margin-top: 30px; }
                            .back-link a { color: #3498db; text-decoration: none; }
                        </style>
                    </head>
                    <body>
                        <div class="error">🔗 Link não encontrado</div>
                        <div class="message">O link que você está tentando acessar não existe ou foi removido.</div>
                        <div class="back-link">
                            <a href="/">← Voltar ao encurtador</a>
                        </div>
                    </body>
                    </html>
                `);
                return;
            }
        } catch (error) {
            console.error('Erro no redirecionamento:', error);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Erro interno</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #e74c3c; font-size: 24px; margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div class="error">Erro interno do servidor</div>
                    <a href="/">Voltar ao início</a>
                </body>
                </html>
            `);
            return;
        }
    }

    // Página não encontrada
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Página não encontrada</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .error { color: #e74c3c; font-size: 24px; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="error">404 - Página não encontrada</div>
            <a href="/">Voltar ao início</a>
        </body>
        </html>
    `);
});

function serveFile(res, filename, contentType) {
    const filePath = path.join(__dirname, filename);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Arquivo não encontrado');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

async function shortenUrl(originalUrl, customCode = '') {
    // Validar URL
    try {
        new URL(originalUrl);
    } catch {
        throw new Error('URL inválida');
    }

    // Gerar código curto
    let shortCode = customCode;
    if (!shortCode) {
        shortCode = await generateShortCode();
    }

    // Verificar se o código já existe
    const existingResult = await pool.query(
        'SELECT id FROM short_urls WHERE short_code = $1',
        [shortCode]
    );
    
    if (existingResult.rows.length > 0) {
        throw new Error('Código personalizado já existe');
    }

    // Criar nova URL no banco
    const result = await pool.query(
        'INSERT INTO short_urls (original_url, short_code, click_count, created_at, is_active) VALUES ($1, $2, 0, NOW(), true) RETURNING *',
        [originalUrl, shortCode]
    );
    
    const newUrl = {
        id: result.rows[0].id,
        originalUrl: result.rows[0].original_url,
        shortCode: result.rows[0].short_code,
        clickCount: result.rows[0].click_count,
        createdAt: result.rows[0].created_at.toISOString(),
        isActive: result.rows[0].is_active
    };
    
    console.log(`✅ Nova URL criada: ${shortCode} -> ${originalUrl}`);
    
    return newUrl;
}

async function generateShortCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Verificar se já existe no banco
    const existingResult = await pool.query(
        'SELECT id FROM short_urls WHERE short_code = $1',
        [result]
    );
    
    if (existingResult.rows.length > 0) {
        return await generateShortCode(); // Tentar novamente
    }
    
    return result;
}

// Inicializar servidor
async function startServer() {
    await initDatabase();
    
    server.listen(PORT, () => {
        console.log(`
🚀 URL Shortener rodando!

📱 Interface Web: http://localhost:${PORT}
🔗 Domínio personalizado: ${BASE_URL}
🔗 Exemplo de link encurtado: ${BASE_URL}/abc123

✨ Funcionalidades:
   • Encurtar URLs com domínio personalizado
   • Códigos personalizados
   • Rastreamento de cliques em tempo real
   • Redirecionamento automático
   • Interface responsiva
   • Banco de dados PostgreSQL

🎯 Para testar:
   1. Acesse http://localhost:${PORT}
   2. Cole uma URL longa
   3. Clique em "Encurtar URL"
   4. Receba um link ${BASE_URL}/codigo!

📊 Banco de dados: PostgreSQL conectado!
        `);
    });
}

startServer().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Encerrando servidor...');
    server.close(() => {
        console.log('✅ Servidor encerrado com sucesso!');
        process.exit(0);
    });
});