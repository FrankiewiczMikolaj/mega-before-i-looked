import { exportPreview } from '../src/export.js';

console.log(JSON.stringify(await exportPreview(), null, 2));
