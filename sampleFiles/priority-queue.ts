type Comparator<T> = (a: T, b: T) => number

export class PriorityQueue<T> {
  private heap: T[] = []
  private compare: Comparator<T>

  constructor(comparator: Comparator<T>) {
    this.compare = comparator
  }

  enqueue(item: T): void {
    this.heap.push(item)
    this.bubbleUp(this.heap.length - 1)
  }

  dequeue(): T | undefined {
    if (this.heap.length === 0) return undefined

    const top = this.heap[0]
    const last = this.heap.pop()!

    if (this.heap.length > 0) {
      this.heap[0] = last
      this.sinkDown(0)
    }

    return top
  }

  peek(): T | undefined {
    return this.heap[0]
  }

  get size(): number {
    return this.heap.length
  }

  isEmpty(): boolean {
    return this.heap.length === 0
  }

  toArray(): T[] {
    return [...this.heap].sort(this.compare)
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this.compare(this.heap[index], this.heap[parentIndex]) >= 0) break
      ;[this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]]
      index = parentIndex
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length

    while (true) {
      let smallest = index
      const left = 2 * index + 1
      const right = 2 * index + 2

      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left
      }
      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right
      }

      if (smallest === index) break

      ;[this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]]
      index = smallest
    }
  }
}

interface Task {
  id: string
  priority: number
  payload: any
  createdAt: Date
}

export class TaskRunner {
  private queue: PriorityQueue<Task>
  private running = false
  private concurrency: number
  private activeTasks = 0

  constructor(concurrency = 5) {
    this.concurrency = concurrency
    this.queue = new PriorityQueue<Task>((a, b) => a.priority - b.priority)
  }

  submit(id: string, priority: number, payload: any): void {
    this.queue.enqueue({ id, priority, payload, createdAt: new Date() })
    this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.activeTasks >= this.concurrency || this.queue.isEmpty()) return

    const task = this.queue.dequeue()
    if (!task) return

    this.activeTasks++

    try {
      await this.executeTask(task)
    } catch (err) {
      console.log(`Task ${task.id} failed: ${err}`)
    } finally {
      this.activeTasks--
      this.processNext()
    }
  }

  private async executeTask(task: Task): Promise<void> {
    if (typeof task.payload === 'function') {
      await task.payload()
    }
  }

  getQueueSize(): number {
    return this.queue.size
  }

  getActiveTasks(): number {
    return this.activeTasks
  }
}
