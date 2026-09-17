import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve('dist');
if (fs.existsSync(dist)) fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist,{recursive:true});
console.log('dist cleaned');
