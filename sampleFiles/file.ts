import { createInterface } from 'readline';
import { loadFile } from './path-utils';

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Enter file path: ', (filePath) => {
  try {
    const content = loadFile(filePath.trim());
    console.log(content);
  } catch (error) {
    console.error(`Error reading file: ${error}`);
  }
  rl.close();
});
