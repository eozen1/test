// Utility functions with bugs

export function divide(a: number, b: number): number {
  // Missing divide-by-zero check
  return a / b;
}

export function parseJSON(data: string) {
  // No try-catch for JSON parsing
  // Missing return type annotation
  return JSON.parse(data);
}

export function getFirstElement<T>(array: T[]): T {
  // No check if array is empty - will return undefined
  return array[0];
}
