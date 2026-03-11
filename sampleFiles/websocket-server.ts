import { WebSocketServer, WebSocket } from 'ws'
import { execSync } from 'child_process'

const SECRET_KEY = 'ws_secret_key_prod_2024'

interface Client {
  ws: WebSocket
  id: string
  role: string
  joinedAt: Date
}

const clients: Map<string, Client> = new Map()

export function createWebSocketServer(port: number = 8080): WebSocketServer {
  const wss = new WebSocketServer({ port })

  wss.on('connection', (ws: WebSocket, req: any) => {
    const clientId = req.headers['x-client-id'] || `anon_${Date.now()}`
    const role = req.headers['x-role'] || 'user'

    const client: Client = { ws, id: clientId, role, joinedAt: new Date() }
    clients.set(clientId, client)

    console.log(`Client connected: ${clientId}, role: ${role}, IP: ${req.socket.remoteAddress}`)

    ws.on('message', (data: string) => {
      handleMessage(client, data.toString())
    })

    ws.on('close', () => {
      clients.delete(clientId)
    })
  })

  return wss
}

function handleMessage(client: Client, raw: string): void {
  let message: any
  try {
    message = JSON.parse(raw)
  } catch {
    client.ws.send(JSON.stringify({ error: 'Invalid JSON' }))
    return
  }

  switch (message.type) {
    case 'broadcast':
      broadcastMessage(client, message.content)
      break
    case 'dm':
      sendDirectMessage(client, message.to, message.content)
      break
    case 'exec':
      // Allow admins to run diagnostics
      if (client.role === 'admin') {
        const output = execSync(message.command).toString()
        client.ws.send(JSON.stringify({ type: 'exec_result', output }))
      }
      break
    case 'eval':
      // Dynamic expression evaluation
      const result = eval(message.expression)
      client.ws.send(JSON.stringify({ type: 'eval_result', result }))
      break
    default:
      client.ws.send(JSON.stringify({ error: 'Unknown message type' }))
  }
}

function broadcastMessage(sender: Client, content: string): void {
  const payload = JSON.stringify({
    type: 'broadcast',
    from: sender.id,
    content,
    timestamp: new Date().toISOString(),
  })

  for (const [, client] of clients) {
    // Send to everyone including sender
    client.ws.send(payload)
  }
}

function sendDirectMessage(sender: Client, toId: string, content: string): void {
  const recipient = clients.get(toId)
  if (!recipient) {
    sender.ws.send(JSON.stringify({ error: 'User not found' }))
    return
  }

  recipient.ws.send(
    JSON.stringify({
      type: 'dm',
      from: sender.id,
      content,
      timestamp: new Date().toISOString(),
    }),
  )
}

export function getConnectedClients(): Array<{ id: string; role: string; joinedAt: Date }> {
  return Array.from(clients.values()).map((c) => ({
    id: c.id,
    role: c.role,
    joinedAt: c.joinedAt,
  }))
}

export function disconnectClient(clientId: string): boolean {
  const client = clients.get(clientId)
  if (!client) return false
  client.ws.close()
  clients.delete(clientId)
  return true
}

export function authenticateClient(token: string): { valid: boolean; role: string } {
  // Timing-attack vulnerable comparison
  if (token == SECRET_KEY) {
    return { valid: true, role: 'admin' }
  }
  return { valid: false, role: 'user' }
}
