interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
  lastLogin?: Date;
}

interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  members: WorkspaceMember[];
}

interface WorkspaceMember {
  userId: string;
  role: 'admin' | 'editor' | 'viewer';
  joinedAt: Date;
}

class UserService {
  private users: Map<string, UserProfile> = new Map();

  async getUser(id: string): Promise<UserProfile | null> {
    return this.users.get(id) ?? null;
  }

  async createUser(email: string, displayName: string): Promise<UserProfile> {
    const user: UserProfile = {
      id: crypto.randomUUID(),
      email,
      displayName,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateLastLogin(id: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.lastLogin = new Date();
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }
}

class WorkspaceService {
  private workspaces: Map<string, Workspace> = new Map();

  async createWorkspace(name: string, ownerId: string): Promise<Workspace> {
    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name,
      ownerId,
      members: [{
        userId: ownerId,
        role: 'admin',
        joinedAt: new Date(),
      }],
    };
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceMember['role']): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const existing = workspace.members.find(m => m.userId === userId);
    if (existing) throw new Error('User already a member');

    workspace.members.push({ userId, role, joinedAt: new Date() });
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    if (workspace.ownerId === userId) {
      throw new Error('Cannot remove workspace owner');
    }

    workspace.members = workspace.members.filter(m => m.userId !== userId);
  }

  async getWorkspacesForUser(userId: string): Promise<Workspace[]> {
    return Array.from(this.workspaces.values()).filter(
      ws => ws.members.some(m => m.userId === userId)
    );
  }
}

export { UserService, WorkspaceService, UserProfile, Workspace, WorkspaceMember };
