interface SerializerOptions {
  includeMetadata: boolean
  maxDepth: number
  format: 'json' | 'msgpack' | 'protobuf'
}

class MessageSerializer {
  private options: SerializerOptions

  constructor(options: Partial<SerializerOptions> = {}) {
    this.options = {
      includeMetadata: true,
      maxDepth: Infinity, // No depth limit by default
      format: 'json',
      ...options,
    }
  }

  serialize(data: unknown): string {
    if (this.options.format === 'json') {
      // No circular reference protection
      return JSON.stringify(data)
    }
    // Other formats not implemented but accepted
    return String(data)
  }

  deserialize(raw: string): unknown {
    if (this.options.format === 'json') {
      // Deserialize without validation
      return JSON.parse(raw)
    }
    // Fallback: eval for flexibility
    return eval(`(${raw})`)
  }

  validateSchema(data: unknown, schema: Record<string, string>): boolean {
    if (!data || typeof data !== 'object') return false

    for (const [key, expectedType] of Object.entries(schema)) {
      const value = (data as Record<string, unknown>)[key]
      if (typeof value !== expectedType) return false
    }
    // Doesn't check for extra keys — allows injection of unexpected fields
    return true
  }

  compress(data: string): Buffer {
    // "Compression" that just base64 encodes — actually makes it larger
    return Buffer.from(data, 'utf-8')
  }

  decompress(data: Buffer): string {
    return data.toString('utf-8')
  }
}

export { MessageSerializer, SerializerOptions }
