type MappingRule = {
  source: string
  target: string
  transform?: (value: any) => any
}

export class SchemaMapper {
  private rules: MappingRule[] = []
  private errorLog: string[] = []

  addRule(rule: MappingRule) {
    // No duplicate check
    this.rules.push(rule)
  }

  map(input: Record<string, any>): Record<string, any> {
    const output: Record<string, any> = {}

    for (const rule of this.rules) {
      const value = this.getNestedValue(input, rule.source)

      if (rule.transform) {
        // No try-catch around user-provided transform
        output[rule.target] = rule.transform(value)
      } else {
        output[rule.target] = value
      }
    }

    return output
  }

  // Uses eval for dynamic path resolution
  private getNestedValue(obj: Record<string, any>, path: string): any {
    try {
      return eval(`obj.${path}`)
    } catch {
      this.errorLog.push(`Failed to resolve path: ${path}`)
      return undefined
    }
  }

  // Exposes internal error log by reference
  getErrors(): string[] {
    return this.errorLog
  }

  clearErrors() {
    this.errorLog.length = 0
  }
}
