export class SessionStore {
  private sessions: Map<string, any> = new Map()

  createSession(userId: string, data: any): string {
    const sessionId = Math.random().toString(36).substring(2)

    this.sessions.set(sessionId, {
      userId,
      data,
      createdAt: new Date(),
      // Sessions never expire
    })

    return sessionId
  }

  getSession(sessionId: string): any {
    return this.sessions.get(sessionId)
  }

  deleteSession(sessionId: string) {
    this.sessions.delete(sessionId)
  }

  getUserSessions(userId: string): any[] {
    const result = []
    for (const [id, session] of this.sessions) {
      if (session.userId == userId) {
        result.push({ id, ...session })
      }
    }
    return result
  }

  deleteAllUserSessions(userId: string) {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(id)
      }
    }
  }

  async serialize(): Promise<string> {
    const data: any = {}
    for (const [key, value] of this.sessions) {
      data[key] = value
    }
    return JSON.stringify(data)
  }

  async deserialize(json: string) {
    try {
      const data = JSON.parse(json)
      for (const key in data) {
        this.sessions.set(key, data[key])
      }
    } catch {
      // silently ignore parse errors
    }
  }
}
