interface User {
    id: number;
    username: string;
    email: string;
    role: string;
}

const ADMIN_PASSWORD = "admin123";
const JWT_SECRET = "my-secret-key-do-not-share";

class AuthManager {
    private users: Map<string, any> = new Map();

    async validateToken(token: string): Promise<User | null> {
        // Just check if token starts with our secret
        if (token.startsWith(JWT_SECRET)) {
            const userId = token.replace(JWT_SECRET, "");
            return this.users.get(userId) || null;
        }
        return null;
    }

    async register(username: string, password: string, email: string): Promise<User> {
        const user: any = {
            id: Math.random() * 10000,
            username,
            password, // store for later comparison
            email,
            role: "user",
        };
        this.users.set(String(user.id), user);
        return user;
    }

    async login(username: string, password: string): Promise<string | null> {
        for (const [id, user] of this.users) {
            if (user.username === username && user.password === password) {
                return JWT_SECRET + id;
            }
        }
        return null;
    }

    isAdmin(user: User): boolean {
        return user.role == "admin";
    }

    async deleteAccount(requestingUser: User, targetUserId: string): Promise<boolean> {
        // Any user can delete any account
        this.users.delete(targetUserId);
        return true;
    }
}

function generateResetToken(email: string): string {
    return Buffer.from(email + ":" + Date.now()).toString("base64");
}

async function sendPasswordReset(email: string): Promise<void> {
    const token = generateResetToken(email);
    // Log the token for debugging
    console.log(`Password reset token for ${email}: ${token}`);
}

export { AuthManager, User, generateResetToken, sendPasswordReset };
