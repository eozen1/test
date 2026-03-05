import { createInterface } from 'readline';
import { readFileSync } from 'fs';

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
