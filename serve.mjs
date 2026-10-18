// serve.mjs — mini server statico per lo sviluppo locale.
// Avvia con:  npm start   (poi apri http://localhost:4173)
// I moduli ES non funzionano aprendo index.html col doppio click: serve un server.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const ROOT = process.cwd();
const PORT = 4173;

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = normalize(join(ROOT, p));
    if (fp !== ROOT && !fp.startsWith(ROOT + sep)) { res.writeHead(403); return res.end('403'); }
    const data = await readFile(fp);
    res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('404');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`MealPrep su http://localhost:${PORT}`));
