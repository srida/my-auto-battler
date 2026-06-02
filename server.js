const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(express.json({ limit: '20mb' }));

// --- Config (env vars for production, local defaults for dev) ---
const IS_PROD = process.env.NODE_ENV === 'production';
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const DATA_DIR       = process.env.DATA_DIR  || path.join(PROJECT_ROOT, 'data');
const ILLUS_DIR      = process.env.ILLUS_DIR || path.join(PROJECT_ROOT, 'resources', 'card_illustrations');
const INITIAL_DIR    = path.join(__dirname, 'initial-data');

const CARDS_FILE     = path.join(DATA_DIR, 'cards.json');
const ARCHETYPES_FILE = path.join(DATA_DIR, 'archetypes.json');
const POWERS_FILE    = path.join(DATA_DIR, 'powers.json');

// --- Bootstrap: copy initial data to volume on first run ---
function bootstrap() {
  fs.mkdirSync(DATA_DIR,  { recursive: true });
  fs.mkdirSync(ILLUS_DIR, { recursive: true });
  for (const f of ['cards.json', 'archetypes.json', 'powers.json']) {
    const dest = path.join(DATA_DIR, f);
    const src  = path.join(INITIAL_DIR, f);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`[bootstrap] ${f} copied to volume`);
    }
  }
}
bootstrap();

// --- Basic auth (set ADMIN_USER + ADMIN_PASS in env to enable) ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

if (ADMIN_PASS) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Basic ')) {
      res.set('WWW-Authenticate', 'Basic realm="YGO Card Manager"');
      return res.status(401).send('Authentification requise');
    }
    const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
      res.set('WWW-Authenticate', 'Basic realm="YGO Card Manager"');
      return res.status(401).send('Identifiants incorrects');
    }
    next();
  });
}

// Serve frontend
app.use(express.static(__dirname));

// --- Helpers ---
function readJson(file) {
  const raw = fs.readFileSync(file, 'utf-8');
  return JSON.parse(raw.replace(/,\s*([\]}])/g, '$1'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, '\t'), 'utf-8');
}

function illustrationExists(id) {
  return fs.existsSync(path.join(ILLUS_DIR, `${id}.png`));
}

// --- Cards API ---
app.get('/api/cards', (req, res) => {
  try {
    const cards = readJson(CARDS_FILE);
    res.json(cards.map(c => ({ ...c, _has_illustration: illustrationExists(c.id) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cards', (req, res) => {
  try {
    const cards = readJson(CARDS_FILE);
    const card = req.body;
    if (!card.id) return res.status(400).json({ error: 'id required' });
    if (cards.find(c => c.id === card.id)) return res.status(400).json({ error: `ID ${card.id} already exists` });
    delete card._has_illustration;
    cards.push(card);
    writeJson(CARDS_FILE, cards);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/cards/:id', (req, res) => {
  try {
    const cards = readJson(CARDS_FILE);
    const idx = cards.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    const updated = req.body;
    delete updated._has_illustration;
    cards[idx] = updated;
    writeJson(CARDS_FILE, cards);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cards/:id', (req, res) => {
  try {
    let cards = readJson(CARDS_FILE);
    const idx = cards.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    cards.splice(idx, 1);
    writeJson(CARDS_FILE, cards);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Illustration import ---
app.post('/api/cards/:id/illustration', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  const destPath = path.join(ILLUS_DIR, `${req.params.id}.png`);
  try {
    const imageBuffer = await downloadUrl(url);
    let sharp;
    try { sharp = require('sharp'); } catch (_) {}
    if (sharp) {
      await sharp(imageBuffer).png().toFile(destPath);
    } else {
      fs.writeFileSync(destPath, imageBuffer);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cards/:id/illustration', (req, res) => {
  const filePath = path.join(ILLUS_DIR, `${req.params.id}.png`);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/illustrations/:id', (req, res) => {
  const filePath = path.join(ILLUS_DIR, `${req.params.id}.png`);
  if (fs.existsSync(filePath)) res.sendFile(filePath);
  else res.status(404).end();
});

// --- Archetypes API ---
app.get('/api/archetypes', (req, res) => {
  try { res.json(readJson(ARCHETYPES_FILE)); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/archetypes', (req, res) => {
  try {
    const archetypes = readJson(ARCHETYPES_FILE);
    const arch = req.body;
    if (!arch.id) return res.status(400).json({ error: 'id required' });
    if (archetypes.find(a => a.id === arch.id)) return res.status(400).json({ error: `ID ${arch.id} already exists` });
    archetypes.push(arch);
    writeJson(ARCHETYPES_FILE, archetypes);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/archetypes/:id', (req, res) => {
  try {
    const archetypes = readJson(ARCHETYPES_FILE);
    const idx = archetypes.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    archetypes[idx] = req.body;
    writeJson(ARCHETYPES_FILE, archetypes);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/archetypes/:id', (req, res) => {
  try {
    let archetypes = readJson(ARCHETYPES_FILE);
    const idx = archetypes.findIndex(a => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    archetypes.splice(idx, 1);
    writeJson(ARCHETYPES_FILE, archetypes);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Powers API ---
app.get('/api/powers', (req, res) => {
  try { res.json(readJson(POWERS_FILE)); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/powers', (req, res) => {
  try {
    const powers = readJson(POWERS_FILE);
    const power = req.body;
    if (!power.id) return res.status(400).json({ error: 'id required' });
    if (powers.find(p => p.id === power.id)) return res.status(400).json({ error: `ID ${power.id} already exists` });
    powers.push(power);
    writeJson(POWERS_FILE, powers);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/powers/:id', (req, res) => {
  try {
    const powers = readJson(POWERS_FILE);
    const idx = powers.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    powers[idx] = req.body;
    writeJson(POWERS_FILE, powers);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/powers/:id', (req, res) => {
  try {
    let powers = readJson(POWERS_FILE);
    const idx = powers.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    powers.splice(idx, 1);
    writeJson(POWERS_FILE, powers);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Export API (pour la future sync locale) ---
app.get('/api/export', (req, res) => {
  try {
    const cards      = readJson(CARDS_FILE);
    const archetypes = readJson(ARCHETYPES_FILE);
    const powers     = readJson(POWERS_FILE);
    const illustrations = fs.readdirSync(ILLUS_DIR)
      .filter(f => f.endsWith('.png'))
      .map(f => f.replace('.png', ''));
    res.json({ cards, archetypes, powers, illustrations });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/export/illustration/:id', (req, res) => {
  const filePath = path.join(ILLUS_DIR, `${req.params.id}.png`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.json({ id: req.params.id, data: fs.readFileSync(filePath).toString('base64') });
});

// --- Download helper ---
function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302)
        return downloadUrl(res.headers.location).then(resolve).catch(reject);
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const PORT = process.env.PORT || 3742;
app.listen(PORT, () => console.log(`Card Manager running at http://localhost:${PORT}`));
