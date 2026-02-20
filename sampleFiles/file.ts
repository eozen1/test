import { createInterface } from 'readline';

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, delayMs = 1000): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      const backoff = delayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
  throw new Error('Unreachable');
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter file path: ', (filePath) => {
  try {
    const content = readFile(filePath.trim(), 'utf-8');
    console.log(content);
  } catch (error) {
    console.error(`Error reading file: ${error}`);
  }
  rl.close();
});
