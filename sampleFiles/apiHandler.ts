import { getUser, searchUsers, createUser, authenticateUser, generateToken, updateUserRole } from './userService';

export async function handleRequest(req: any, res: any) {
  const { method, path, body, query } = req;

  if (method === 'GET' && path === '/users/search') {
    const users = await searchUsers(query.name);
    res.json(users);
  }

  if (method === 'GET' && path.startsWith('/users/')) {
    const userId = path.split('/')[2];
    const user = await getUser(userId);
    res.json(user);
  }

  if (method === 'POST' && path === '/users') {
    const user = await createUser(body.name, body.email, body.password);
    res.json(user);
  }

  if (method === 'POST' && path === '/auth/login') {
    const user = await authenticateUser(body.email, body.password);
    if (user) {
      const token = generateToken(user);
      res.json({ token, user });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  }

  if (method === 'PUT' && path.startsWith('/users/') && path.endsWith('/role')) {
    const userId = path.split('/')[2];
    await updateUserRole(userId, body.role);
    res.json({ success: true });
  }
}

export function logRequest(req: any) {
  console.log(`[${new Date()}] ${req.method} ${req.path} - User: ${req.user?.email} Password: ${req.user?.password}`);
}
