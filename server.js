const http       = require('http');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { execFile } = require('child_process');

const PORT      = process.env.PORT || 3000;
const ROOT      = __dirname;
const PHOTOS    = path.join(ROOT, 'photos');

// ── MIME by extension (fallback) ─────────────────────────────────────────────
const EXT_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'text/javascript',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.mp3':  'audio/mpeg',
  '.m4a':  'audio/mp4',
  '.ogg':  'audio/ogg',
};

// Detect real image MIME from first bytes so the browser always gets the right
// Content-Type regardless of the extension we saved with.
function sniffImageMime(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
  return null;
}

// ── Static file server ────────────────────────────────────────────────────────
function serveStatic(res, filePath) {
  // Prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(resolved, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }

    const ext  = path.extname(resolved).toLowerCase();
    const mime = EXT_MIME[ext] || 'application/octet-stream';

    // For images: read first 12 bytes to sniff real MIME, then stream the rest
    if (['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)) {
      const fd = fs.openSync(resolved, 'r');
      const header = Buffer.alloc(12);
      fs.readSync(fd, header, 0, 12, 0);
      fs.closeSync(fd);
      const realMime = sniffImageMime(header) || mime;
      res.writeHead(200, {
        'Content-Type': realMime,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(resolved).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(resolved).pipe(res);
  });
}

// ── Multipart parser (binary-safe, no deps) ───────────────────────────────────
function bufIndexOf(haystack, needle, start = 0) {
  outer: for (let i = start; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function parseMultipart(body, boundary) {
  const sep      = Buffer.from('\r\n--' + boundary);
  const sepFirst = Buffer.from('--' + boundary);
  const CRLF2    = Buffer.from('\r\n\r\n');

  const fields = {};
  let file     = null;
  let pos      = 0;

  // Skip opening boundary
  const first = bufIndexOf(body, sepFirst, 0);
  if (first === -1) return { fields, file };
  pos = first + sepFirst.length;
  if (body[pos] === 0x0D && body[pos + 1] === 0x0A) pos += 2;

  while (pos < body.length) {
    const headerEnd = bufIndexOf(body, CRLF2, pos);
    if (headerEnd === -1) break;
    const headerStr = body.slice(pos, headerEnd).toString('utf8');
    pos = headerEnd + 4;

    const nextSep = bufIndexOf(body, sep, pos);
    const dataEnd = nextSep === -1 ? body.length : nextSep;
    const data    = body.slice(pos, dataEnd);
    pos = dataEnd;

    const dispLine  = (headerStr.match(/Content-Disposition:[^\r\n]*/i) || [''])[0];
    const nameMatch = dispLine.match(/\bname="([^"]+)"/);
    const fnMatch   = dispLine.match(/\bfilename="([^"]+)"/);
    if (!nameMatch) { pos += sep.length + 2; continue; }

    if (fnMatch) {
      const ctLine  = (headerStr.match(/Content-Type:\s*([^\r\n]+)/i) || ['', ''])[1];
      file = { filename: fnMatch[1], contentType: ctLine.trim(), data };
    } else {
      fields[nameMatch[1]] = data.toString('utf8');
    }

    // Advance past separator + \r\n
    pos = dataEnd + sep.length;
    if (body[pos] === 0x2D && body[pos + 1] === 0x2D) break; // end boundary
    if (body[pos] === 0x0D && body[pos + 1] === 0x0A) pos += 2;
  }

  return { fields, file };
}

// ── Upload handler ────────────────────────────────────────────────────────────
function handleUpload(req, res) {
  const ct      = req.headers['content-type'] || '';
  const bMatch  = ct.match(/boundary=("?)(.+)\1/);
  if (!bMatch) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Missing boundary' }));
    return;
  }
  const boundary = bMatch[2].trim();

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('error', err => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
  });
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const { fields, file } = parseMultipart(body, boundary);

    // Sanitize slot name
    const slot = (fields.slot || '').replace(/[^a-z0-9\-_]/gi, '').slice(0, 64);
    if (!slot || !file || !file.data.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Missing slot or file data' }));
      return;
    }

    // Route to correct directory based on file type
    let ext = path.extname(file.filename || '').toLowerCase();
    const ct = (file.contentType || '').toLowerCase();

    const needsSipsConversion = ['.dng', '.heic', '.heif'].includes(ext);
    const isAudio = ct.startsWith('audio/') || ['.mp3','.m4a','.ogg'].includes(ext);
    const isVideo = !needsSipsConversion && (ct.startsWith('video/') || ['.mp4','.webm','.mov'].includes(ext));

    let destDir, urlBase;
    if (isAudio) {
      if (!['.mp3','.m4a','.ogg'].includes(ext)) ext = '.mp3';
      destDir = path.join(ROOT, 'audio');
      urlBase = '/audio/';
    } else if (isVideo) {
      if (!['.mp4','.webm','.mov'].includes(ext)) ext = '.mp4';
      destDir = PHOTOS;
      urlBase = '/photos/';
    } else {
      // Imagens normais + DNG/HEIC/HEIF (serão convertidos para .jpg via sips)
      if (needsSipsConversion) ext = '.jpg';
      else if (!['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)) ext = '.jpg';
      destDir = PHOTOS;
      urlBase = '/photos/';
    }

    const dest = path.join(destDir, slot + ext);

    fs.mkdir(destDir, { recursive: true }, mkErr => {
      if (mkErr) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: mkErr.message }));
        return;
      }

      if (needsSipsConversion) {
        // Salva DNG/HEIC/HEIF temporariamente e converte para JPEG via sips (macOS nativo)
        const origExt = path.extname(file.filename || '').toLowerCase() || '.heic';
        const tmp = path.join(os.tmpdir(), `convert_${Date.now()}_${slot}${origExt}`);
        fs.writeFile(tmp, file.data, tmpErr => {
          if (tmpErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: tmpErr.message }));
            return;
          }
          execFile('sips', ['-s', 'format', 'jpeg', tmp, '--out', dest],
            { timeout: 30000 },
            (sipErr) => {
              fs.unlink(tmp, () => {}); // limpa temp independente do resultado
              if (sipErr) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Falha ao converter DNG: ' + sipErr.message }));
                return;
              }
              const urlPath = urlBase + slot + ext;
              console.log(`  ✓ Convertido via sips: ${dest}`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, path: urlPath }));
            }
          );
        });
        return;
      }

      fs.writeFile(dest, file.data, writeErr => {
        if (writeErr) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: writeErr.message }));
          return;
        }
        const urlPath = urlBase + slot + ext;
        console.log(`  ✓ Arquivo salvo: ${dest}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, path: urlPath }));
      });
    });
  });
}

// ── /list — lista arquivos por prefixo ────────────────────────────────────────
function handleList(req, res) {
  const url    = new URL(req.url, 'http://localhost');
  const prefix = (url.searchParams.get('prefix') || '').replace(/[^a-z0-9\-_]/gi, '').slice(0, 80);
  if (!prefix) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing prefix' })); return;
  }
  fs.readdir(PHOTOS, (err, all) => {
    const files = (err ? [] : all)
      .filter(f => f.startsWith(prefix + '-'))
      .sort((a, b) => {
        const na = parseInt((a.match(/(\d+)(?:\.[^.]+)?$/) || [0, 0])[1]);
        const nb = parseInt((b.match(/(\d+)(?:\.[^.]+)?$/) || [0, 0])[1]);
        return na - nb;
      });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ files }));
  });
}

const TEXTS_PATH = path.join(ROOT, 'texts.json');

// ── /texts — lê textos customizados ──────────────────────────────────────────
function handleGetTexts(req, res) {
  fs.readFile(TEXTS_PATH, 'utf8', (err, data) => {
    const texts = err ? {} : (() => { try { return JSON.parse(data); } catch { return {}; } })();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(texts));
  });
}

// ── /save-text — salva um texto ───────────────────────────────────────────────
function handleSaveText(req, res) {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    let key, value;
    try { ({ key, value } = JSON.parse(Buffer.concat(chunks).toString())); }
    catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Invalid JSON'})); return; }
    if (!key || typeof value !== 'string') {
      res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Missing key/value'})); return;
    }
    const safeKey = key.replace(/[^a-z0-9\-_]/gi, '').slice(0, 120);
    fs.readFile(TEXTS_PATH, 'utf8', (err, data) => {
      const texts = err ? {} : (() => { try { return JSON.parse(data); } catch { return {}; } })();
      texts[safeKey] = value;
      fs.writeFile(TEXTS_PATH, JSON.stringify(texts, null, 2), writeErr => {
        res.writeHead(writeErr ? 500 : 200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ success: !writeErr }));
      });
    });
  });
}

// ── DELETE /photo — apaga arquivo de /photos/ ─────────────────────────────────
function handleDeletePhoto(req, res) {
  const url  = new URL(req.url, 'http://localhost');
  const file = (url.searchParams.get('file') || '').replace(/[^a-z0-9\-_.]/gi, '');
  if (!file) {
    res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Missing file'})); return;
  }
  const target = path.join(PHOTOS, file);
  if (!target.startsWith(PHOTOS + path.sep)) {
    res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:'Forbidden'})); return;
  }
  fs.unlink(target, err => {
    if (err && err.code !== 'ENOENT') {
      res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({success:false,error:err.message})); return;
    }
    console.log(`  ✓ Removido: ${target}`);
    res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({success:true}));
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url      = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === 'POST' && pathname === '/upload')     { handleUpload(req, res);    return; }
  if (req.method === 'POST' && pathname === '/save-text')  { handleSaveText(req, res);  return; }
  if (req.method === 'DELETE' && pathname === '/photo')    { handleDeletePhoto(req, res); return; }
  if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/list')  { handleList(req, res);     return; }
  if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/texts') { handleGetTexts(req, res); return; }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }

  const filePath = pathname === '/'
    ? path.join(ROOT, 'index.html')
    : path.join(ROOT, pathname.replace(/^\//, ''));

  if (req.method === 'GET' && (pathname.startsWith('/photos/') || pathname.startsWith('/audio/'))) {
    console.log(`  → GET ${pathname}`);
  }

  serveStatic(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  🌸  Miguel & Larissa');
  console.log(`  ➜   http://localhost:${PORT}`);
  console.log('');
});
