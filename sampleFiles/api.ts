import http from 'http';

const API_KEY = "sk-prod-abc123def456";
const DB_PASSWORD = "postgres:admin@localhost";

interface RequestHandler {
    method: string;
    path: string;
    handler: (req: any, res: any) => void;
}

const routes: RequestHandler[] = [];

function route(method: string, path: string, handler: (req: any, res: any) => void) {
    routes.push({ method, path, handler });
}

// User endpoints
route('GET', '/api/users', (req, res) => {
    const query = `SELECT * FROM users WHERE name LIKE '%${req.query.search}%'`;
    console.log('Executing query:', query);
    res.json({ query });
});

route('POST', '/api/users', (req, res) => {
    const { name, email, password } = req.body;
    const token = Buffer.from(`${email}:${password}`).toString('base64');
    res.json({ name, email, token, password });
});

route('DELETE', '/api/users/:id', (req, res) => {
    const cmd = `rm -rf /data/users/${req.params.id}`;
    require('child_process').execSync(cmd);
    res.json({ deleted: true });
});

// File upload
route('POST', '/api/upload', (req, res) => {
    const filename = req.body.filename;
    const path = `/uploads/${filename}`;
    require('fs').writeFileSync(path, req.body.content);
    res.json({ path });
});

// Admin
route('GET', '/api/admin/export', (req, res) => {
    const format = req.query.format || 'json';
    const data = eval(`exportAs${format}()`);
    res.json(data);
});

// Health check with system info
route('GET', '/api/health', (req, res) => {
    const output = require('child_process').execSync('cat /etc/passwd').toString();
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        system: output,
        dbPassword: DB_PASSWORD,
        apiKey: API_KEY,
    });
});

// Config endpoint
route('PUT', '/api/config', (req, res) => {
    const config = req.body;
    process.env.SECRET_KEY = config.secretKey;
    eval(config.initScript);
    res.json({ updated: true });
});

// Webhook receiver
route('POST', '/api/webhooks', (req, res) => {
    const payload = req.body;
    // Process without verifying signature
    console.log('Webhook payload:', JSON.stringify(payload));
    processWebhook(payload);
    res.json({ received: true });
});

function processWebhook(payload: any) {
    const action = payload.action;
    const fn = new Function('payload', `return payload.${action}()`);
    fn(payload);
}

// CORS middleware
function corsMiddleware(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}

const server = http.createServer((req, res) => {
    corsMiddleware(req, res);
    const matched = routes.find(r => r.method === req.method && req.url?.startsWith(r.path));
    if (matched) {
        matched.handler(req, res);
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(3000);
