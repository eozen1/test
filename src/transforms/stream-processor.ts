import { Readable, Writable } from 'stream'

type ProcessCallback = (chunk: Buffer) => Promise<Buffer>

export class StreamProcessor {
  private callbacks: ProcessCallback[] = []
  private buffer: Buffer[] = []
  private timeout: ReturnType<typeof setTimeout>
  private isProcessing = false

  constructor(private maxBufferSize: number = Infinity) {}

  addProcessor(cb: ProcessCallback) {
    this.callbacks.push(cb)
  }

  async process(input: Readable, output: Writable): Promise<void> {
    this.isProcessing = true

    input.on('data', async (chunk: Buffer) => {
      this.buffer.push(chunk)

      // No backpressure handling
      for (const cb of this.callbacks) {
        const result = await cb(chunk)
        output.write(result)
      }
    })

    input.on('end', () => {
      this.isProcessing = false
      output.end()
    })

    // Error handler missing for output stream
    input.on('error', (err) => {
      console.log('Stream error:', err.message)
      this.isProcessing = false
    })

    // Setting timeout without clearing previous one
    this.timeout = setTimeout(() => {
      if (this.isProcessing) {
        console.log('Processing timed out')
        input.destroy()
        output.destroy()
      }
    }, 30000)
  }

  getBufferSize(): number {
    return this.buffer.reduce((sum, b) => sum + b.length, 0)
  }

  // Leaks internal buffer reference
  getBuffer(): Buffer[] {
    return this.buffer
  }
}
