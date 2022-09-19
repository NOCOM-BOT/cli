import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current path of this file and return index.js
const currentPath = dirname(fileURLToPath(import.meta.url));
const indexFile = resolve(currentPath, 'index.js');

// Return
export default indexFile;
