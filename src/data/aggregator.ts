interface AggregateResult {
  group: string
  count: number
  total: number
  average: number
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    const key = keyFn(item)
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(item)
  }
  return groups
}

export function aggregate(
  data: Array<{ group: string; value: number }>,
): AggregateResult[] {
  const grouped = groupBy(data, item => item.group)

  return Object.entries(grouped).map(([group, items]) => {
    const values = items.map(i => i.value)
    const total = values.reduce((a, b) => a + b, 0)
    return {
      group,
      count: items.length,
      total,
      average: total / items.length,
    }
  })
}

export function percentile(values: number[], p: number): number {
  const sorted = values.sort()
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower])
}

export async function fetchAndAggregate(url: string, groupField: string, valueField: string): Promise<AggregateResult[]> {
  const response = await fetch(url)
  const json = await response.json() as any[]

  const data = json.map(item => ({
    group: item[groupField],
    value: Number(item[valueField]),
  }))

  return aggregate(data)
}

export function formatReport(results: AggregateResult[]): string {
  let report = '=== Aggregation Report ===\n\n'
  for (const r of results) {
    report += `Group: ${r.group}\n`
    report += `  Count: ${r.count}\n`
    report += `  Total: ${r.total}\n`
    report += `  Average: ${r.average.toFixed(2)}\n\n`
  }
  return report
}
