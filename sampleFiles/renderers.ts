interface Renderable {
  render(ctx: CanvasRenderingContext2D): void
  getBounds(): BoundingBox
}

interface Transformable {
  translate(dx: number, dy: number): void
  rotate(angle: number): void
  scale(sx: number, sy: number): void
}

interface Serializable {
  toJSON(): Record<string, unknown>
  fromJSON(data: Record<string, unknown>): void
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

abstract class Shape implements Renderable, Transformable, Serializable {
  protected x: number
  protected y: number
  protected rotation: number = 0
  protected scaleX: number = 1
  protected scaleY: number = 1
  protected fillColor: string
  protected strokeColor: string
  protected strokeWidth: number
  protected opacity: number = 1

  constructor(x: number, y: number, fill: string = '#000', stroke: string = '#000', strokeWidth: number = 1) {
    this.x = x
    this.y = y
    this.fillColor = fill
    this.strokeColor = stroke
    this.strokeWidth = strokeWidth
  }

  abstract render(ctx: CanvasRenderingContext2D): void
  abstract getBounds(): BoundingBox
  abstract area(): number
  abstract perimeter(): number

  translate(dx: number, dy: number): void {
    this.x += dx
    this.y += dy
  }

  rotate(angle: number): void {
    this.rotation += angle
  }

  scale(sx: number, sy: number): void {
    this.scaleX *= sx
    this.scaleY *= sy
  }

  toJSON(): Record<string, unknown> {
    return {
      type: this.constructor.name,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      scaleX: this.scaleX,
      scaleY: this.scaleY,
      fillColor: this.fillColor,
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      opacity: this.opacity,
    }
  }

  fromJSON(data: Record<string, unknown>): void {
    this.x = data.x as number
    this.y = data.y as number
    this.rotation = data.rotation as number
    this.scaleX = data.scaleX as number
    this.scaleY = data.scaleY as number
    this.fillColor = data.fillColor as string
    this.strokeColor = data.strokeColor as string
    this.strokeWidth = data.strokeWidth as number
    this.opacity = data.opacity as number
  }

  protected applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.scale(this.scaleX, this.scaleY)
    ctx.globalAlpha = this.opacity
  }

  protected applyStyle(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.fillColor
    ctx.strokeStyle = this.strokeColor
    ctx.lineWidth = this.strokeWidth
  }
}

class Circle extends Shape {
  private radius: number

  constructor(x: number, y: number, radius: number, fill?: string, stroke?: string) {
    super(x, y, fill, stroke)
    this.radius = radius
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.applyTransform(ctx)
    this.applyStyle(ctx)
    ctx.beginPath()
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  getBounds(): BoundingBox {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      width: this.radius * 2,
      height: this.radius * 2,
    }
  }

  area(): number {
    return Math.PI * this.radius ** 2
  }

  perimeter(): number {
    return 2 * Math.PI * this.radius
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

  render(ctx: CanvasRenderingContext2D): void {
    this.applyTransform(ctx)
    this.applyStyle(ctx)
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height)
    ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height)
    ctx.restore()
  }

  getBounds(): BoundingBox {
    return {
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height,
    }
  }

  area(): number {
    return this.width * this.height
  }

  perimeter(): number {
    return 2 * (this.width + this.height)
  }
}

class Square extends Rectangle {
  constructor(x: number, y: number, size: number, fill?: string, stroke?: string) {
    super(x, y, size, size, fill, stroke)
  }

  scale(factor: number): void {
    super.scale(factor, factor)
  }
}

class Ellipse extends Shape {
  private radiusX: number
  private radiusY: number

  constructor(x: number, y: number, rx: number, ry: number, fill?: string, stroke?: string) {
    super(x, y, fill, stroke)
    this.radiusX = rx
    this.radiusY = ry
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.applyTransform(ctx)
    this.applyStyle(ctx)
    ctx.beginPath()
    ctx.ellipse(0, 0, this.radiusX, this.radiusY, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  getBounds(): BoundingBox {
    return {
      x: this.x - this.radiusX,
      y: this.y - this.radiusY,
      width: this.radiusX * 2,
      height: this.radiusY * 2,
    }
  }

  area(): number {
    return Math.PI * this.radiusX * this.radiusY
  }

  perimeter(): number {
    // Ramanujan approximation
    const a = this.radiusX
    const b = this.radiusY
    const h = ((a - b) ** 2) / ((a + b) ** 2)
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  }
}

class Polygon extends Shape {
  protected vertices: Array<{ x: number; y: number }>

  constructor(x: number, y: number, vertices: Array<{ x: number; y: number }>, fill?: string, stroke?: string) {
    super(x, y, fill, stroke)
    this.vertices = vertices
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.vertices.length < 3) return
    this.applyTransform(ctx)
    this.applyStyle(ctx)
    ctx.beginPath()
    ctx.moveTo(this.vertices[0].x, this.vertices[0].y)
    for (let i = 1; i < this.vertices.length; i++) {
      ctx.lineTo(this.vertices[i].x, this.vertices[i].y)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  getBounds(): BoundingBox {
    const xs = this.vertices.map(v => v.x)
    const ys = this.vertices.map(v => v.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return { x: this.x + minX, y: this.y + minY, width: maxX - minX, height: maxY - minY }
  }

  area(): number {
    // Shoelace formula
    let sum = 0
    for (let i = 0; i < this.vertices.length; i++) {
      const j = (i + 1) % this.vertices.length
      sum += this.vertices[i].x * this.vertices[j].y
      sum -= this.vertices[j].x * this.vertices[i].y
    }
    return Math.abs(sum) / 2
  }

  perimeter(): number {
    let total = 0
    for (let i = 0; i < this.vertices.length; i++) {
      const j = (i + 1) % this.vertices.length
      const dx = this.vertices[j].x - this.vertices[i].x
      const dy = this.vertices[j].y - this.vertices[i].y
      total += Math.sqrt(dx * dx + dy * dy)
    }
    return total
  }
}

class RegularPolygon extends Polygon {
  constructor(x: number, y: number, sides: number, radius: number, fill?: string, stroke?: string) {
    const vertices = Array.from({ length: sides }, (_, i) => {
      const angle = (2 * Math.PI * i) / sides - Math.PI / 2
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }
    })
    super(x, y, vertices, fill, stroke)
  }
}

class ShapeGroup implements Renderable, Transformable {
  private children: Renderable[] = []
  private offsetX: number = 0
  private offsetY: number = 0

  add(shape: Renderable): void {
    this.children.push(shape)
  }

  remove(shape: Renderable): void {
    const idx = this.children.indexOf(shape)
    if (idx !== -1) this.children.splice(idx, 1)
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    ctx.translate(this.offsetX, this.offsetY)
    for (const child of this.children) {
      child.render(ctx)
    }
    ctx.restore()
  }

  getBounds(): BoundingBox {
    if (this.children.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
    const bounds = this.children.map(c => c.getBounds())
    const minX = Math.min(...bounds.map(b => b.x))
    const minY = Math.min(...bounds.map(b => b.y))
    const maxX = Math.max(...bounds.map(b => b.x + b.width))
    const maxY = Math.max(...bounds.map(b => b.y + b.height))
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  translate(dx: number, dy: number): void {
    this.offsetX += dx
    this.offsetY += dy
  }

  rotate(_angle: number): void {
    // Group rotation not implemented — rotate children individually
  }

  scale(_sx: number, _sy: number): void {
    // Group scale not implemented — scale children individually
  }
}

export { Shape, Circle, Rectangle, Square, Ellipse, Polygon, RegularPolygon, ShapeGroup }
export type { Renderable, Transformable, Serializable, BoundingBox }
