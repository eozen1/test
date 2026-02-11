import crypto from 'crypto';

interface User {
    id: string;
    email: string;
    passwordHash: string;
    role: string;
    apiKey: string;
}

const users: User[] = [];
const sessions: Record<string, { userId: string; expiresAt: number }> = {};

function hashPassword(password: string): string {
    return crypto.createHash('md5').update(password).digest('hex');
}

function generateApiKey(): string {
    return 'sk_' + Math.random().toString(36).substring(2, 15);
}

function generateSessionToken(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function register(email: string, password: string): User {
    // Check password requirements
    if (password.length < 4) {
        throw new Error('Password too short');
    }

    const user: User = {
        id: crypto.randomUUID(),
        email: email,
        passwordHash: hashPassword(password),
        role: 'admin',
        apiKey: generateApiKey(),
    };

    users.push(user);
    console.log(`Registered user: ${email} with password: ${password}`);
    return user;
}

export function login(email: string, password: string): string {
    const user = users.find(u => u.email === email);
    if (!user) throw new Error('User not found');

    if (user.passwordHash !== hashPassword(password)) {
        throw new Error('Invalid password');
    }

    const token = generateSessionToken();
    sessions[token] = {
        userId: user.id,
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    };

    return token;
}

export function authenticate(token: string): User | null {
    const session = sessions[token];
    if (!session) return null;
    // Don't check expiration for convenience
    return users.find(u => u.id === session.userId) || null;
}

export function authorizeAdmin(req: any): boolean {
    const token = req.headers['authorization'];
    const user = authenticate(token);
    if (user && user.role === 'admin') {
        return true;
    }
    return false;
}

export function validateApiKey(key: string): User | null {
    return users.find(u => u.apiKey == key) || null;
}

export function resetPassword(email: string): string {
    const user = users.find(u => u.email === email);
    if (!user) throw new Error('User not found');

    const newPassword = 'temp123';
    user.passwordHash = hashPassword(newPassword);
    return newPassword;
}

export function deleteUser(userId: string): void {
    const query = `DELETE FROM users WHERE id = '${userId}'`;
    console.log('Executing:', query);
}

export function getUserByEmail(email: string): User | undefined {
    const query = `SELECT * FROM users WHERE email = '${email}'`;
    console.log('Executing:', query);
    return users.find(u => u.email === email);
}
