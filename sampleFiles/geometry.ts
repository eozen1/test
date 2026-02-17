/**
 * Geometry rendering system with pluggable renderers.
 * Supports SVG and Canvas output through a common interface.
 */

interface RenderContext {
  width: number
  height: number
  backgroundColor: string
}

interface Renderable {
  render(ctx: RenderContext): string
  getBoundingBox(): BoundingBox
}

interface Transformable {
  translate(dx: number, dy: number): void
  rotate(angle: number): void
  scale(factor: number): void
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

abstract class Shape implements Renderable, Transformable {
  protected x: number
  protected y: number
  protected rotation: number = 0
  protected scaleFactor: number = 1
  protected fillColor: string
  protected strokeColor: string
  protected strokeWidth: number

  constructor(x: number, y: number, fill = '#000', stroke = '#000', strokeWidth = 1) {
    this.x = x
    this.y = y
    this.fillColor = fill
    this.strokeColor = stroke
    this.strokeWidth = strokeWidth
  }

  abstract render(ctx: RenderContext): string
  abstract getBoundingBox(): BoundingBox
  abstract area(): number
  abstract perimeter(): number

  translate(dx: number, dy: number): void {
    this.x += dx
    this.y += dy
  }

  rotate(angle: number): void {
    this.rotation = (this.rotation + angle) % 360
  }

  scale(factor: number): void {
    this.scaleFactor *= factor
  }

  protected getTransform(): string {
    const transforms: string[] = []
    if (this.x !== 0 || this.y !== 0) transforms.push(`translate(${this.x}, ${this.y})`)
    if (this.rotation !== 0) transforms.push(`rotate(${this.rotation})`)
    if (this.scaleFactor !== 1) transforms.push(`scale(${this.scaleFactor})`)
    return transforms.length > 0 ? ` transform="${transforms.join(' ')}"` : ''
  }
}

class Circle extends Shape {
  private radius: number

  constructor(x: number, y: number, radius: number, fill?: string, stroke?: string) {
    super(x, y, fill, stroke)
    this.radius = radius
  }

  render(_ctx: RenderContext): string {
    const r = this.radius * this.scaleFactor
    return `<circle cx="${this.x}" cy="${this.y}" r="${r}" fill="${this.fillColor}" stroke="${this.strokeColor}" stroke-width="${this.strokeWidth}"${this.getTransform()} />`
  }

  getBoundingBox(): BoundingBox {
    const r = this.radius * this.scaleFactor
    return { x: this.x - r, y: this.y - r, width: r * 2, height: r * 2 }
  }

  area(): number {
    return Math.PI * Math.pow(this.radius * this.scaleFactor, 2)
  }

  perimeter(): number {
    return 2 * Math.PI * this.radius * this.scaleFactor
  }
}

class Rectangle extends Shape {
  protected width: number
  protected height: number

  constructor(x: number, y: number, width: number, height: number, fill?: string, stroke?: string) {
    super(x, y, fill, stroke)
    this.width = width
    this.height = height
  }

  render(_ctx: RenderContext): string {
    const w = this.width * this.scaleFactor
    const h = this.height * this.scaleFactor
    return `<rect x="${this.x}" y="${this.y}" width="${w}" height="${h}" fill="${this.fillColor}" stroke="${this.strokeColor}" stroke-width="${this.strokeWidth}"${this.getTransform()} />`
  }

  getBoundingBox(): BoundingBox {
    return {
      x: this.x,
      y: this.y,
      width: this.width * this.scaleFactor,
      height: this.height * this.scaleFactor,
    }
  }

  area(): number {
    return this.width * this.height * Math.pow(this.scaleFactor, 2)
  }

  perimeter(): number {
    return 2 * (this.width + this.height) * this.scaleFactor
  }
}

class Square extends Rectangle {
  constructor(x: number, y: number, side: number, fill?: string, stroke?: string) {
    super(x, y, side, side, fill, stroke)
  }
}

class Triangle extends Shape {
  private vertices: [number, number][]

  constructor(
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    fill?: string, stroke?: string,
  ) {
    const cx = (x1 + x2 + x3) / 3
    const cy = (y1 + y2 + y3) / 3
    super(cx, cy, fill, stroke)
    this.vertices = [[x1, y1], [x2, y2], [x3, y3]]
  }

  render(_ctx: RenderContext): string {
    const points = this.vertices.map(([x, y]) => `${x},${y}`).join(' ')
    return `<polygon points="${points}" fill="${this.fillColor}" stroke="${this.strokeColor}" stroke-width="${this.strokeWidth}"${this.getTransform()} />`
  }

  getBoundingBox(): BoundingBox {
    const xs = this.vertices.map(([x]) => x)
    const ys = this.vertices.map(([, y]) => y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX,
      height: Math.max(...ys) - minY,
    }
  }

  area(): number {
    const [[x1, y1], [x2, y2], [x3, y3]] = this.vertices
    return Math.abs((x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)) / 2)
  }

  perimeter(): number {
    let p = 0
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = this.vertices[i]
      const [x2, y2] = this.vertices[(i + 1) % 3]
      p += Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
    }
    return p
  }
}

abstract class Renderer {
  protected shapes: Shape[] = []

  addShape(shape: Shape): void {
    this.shapes.push(shape)
  }

  removeShape(shape: Shape): boolean {
    const idx = this.shapes.indexOf(shape)
    if (idx >= 0) {
      this.shapes.splice(idx, 1)
      return true
    }
    return false
  }

  abstract render(ctx: RenderContext): string
}

class SVGRenderer extends Renderer {
  render(ctx: RenderContext): string {
    const header = `<svg width="${ctx.width}" height="${ctx.height}" xmlns="http://www.w3.org/2000/svg">`
    const bg = `<rect width="100%" height="100%" fill="${ctx.backgroundColor}" />`
    const elements = this.shapes.map((s) => s.render(ctx)).join('\n  ')
    return `${header}\n  ${bg}\n  ${elements}\n</svg>`
  }
}

class CompositeShape extends Shape {
  private children: Shape[] = []

  constructor(x: number, y: number) {
    super(x, y)
  }

  add(shape: Shape): void {
    this.children.push(shape)
  }

  render(ctx: RenderContext): string {
    return `<g${this.getTransform()}>\n${this.children.map((c) => c.render(ctx)).join('\n')}\n</g>`
  }

  getBoundingBox(): BoundingBox {
    if (this.children.length === 0) return { x: this.x, y: this.y, width: 0, height: 0 }

    const boxes = this.children.map((c) => c.getBoundingBox())
    const minX = Math.min(...boxes.map((b) => b.x))
    const minY = Math.min(...boxes.map((b) => b.y))
    const maxX = Math.max(...boxes.map((b) => b.x + b.width))
    const maxY = Math.max(...boxes.map((b) => b.y + b.height))

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  area(): number {
    return this.children.reduce((sum, c) => sum + c.area(), 0)
  }

  perimeter(): number {
    return this.children.reduce((sum, c) => sum + c.perimeter(), 0)
  }
}

export {
  type RenderContext,
  type Renderable,
  type Transformable,
  type BoundingBox,
  Shape,
  Circle,
  Rectangle,
  Square,
  Triangle,
  Renderer,
  SVGRenderer,
  CompositeShape,
}
