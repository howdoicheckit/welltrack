import express from 'express';
import cors from 'cors';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ─── Security ───
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://howdoicheckit.github.io';
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('FATAL: API_KEY environment variable is required.');
  console.error('Generate one: node -e "console.log(crypto.randomUUID())"');
  process.exit(1);
}

// CORS — only allow requests from your GitHub Pages site
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['GET', 'PUT', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
}));

app.use(express.json({ limit: '10mb' }));

// API key check — runs on all /api/* routes
app.use('/api', (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// ─── Data persistence ───
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'patient.json');
const BACKUP_FILE = join(DATA_DIR, 'patient.backup.json');

const DEFAULT_STATE = {
  dailyAssessments: {},
  medications: [],
  sideEffectSeverities: {},
  journal: {},
  notes: '',
  theme: 'light',
};

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readPatientData() {
  try {
    await ensureDataDir();
    if (!existsSync(DATA_FILE)) return DEFAULT_STATE;
    const raw = await readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'dailyAssessments' in parsed) {
      return parsed;
    }
    return DEFAULT_STATE;
  } catch (err) {
    console.error('Error reading patient data:', err);
    try {
      if (existsSync(BACKUP_FILE)) {
        const backup = await readFile(BACKUP_FILE, 'utf-8');
        return JSON.parse(backup);
      }
    } catch { /* ignore */ }
    return DEFAULT_STATE;
  }
}

async function writePatientData(data) {
  await ensureDataDir();
  try {
    if (existsSync(DATA_FILE)) {
      const existing = await readFile(DATA_FILE, 'utf-8');
      await writeFile(BACKUP_FILE, existing, 'utf-8');
    }
  } catch { /* backup is best-effort */ }
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Routes ───

app.get('/api/data', async (_req, res) => {
  try {
    const data = await readPatientData();
    res.json(data);
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({ error: 'Failed to load data' });
  }
});

app.put('/api/data', async (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    await writePatientData(data);
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error('PUT /api/data error:', err);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// ─── Side effects via openFDA ───
const EXCLUDED_TERMS = new Set([
  'drug ineffective', 'off label use', 'product substitution issue',
  'therapeutic response unexpected', 'drug interaction', 'drug exposure during pregnancy',
  'intentional product misuse', 'product use issue', 'no adverse event',
  'condition aggravated', 'death', 'completed suicide', 'self injury',
  'drug dependence', 'drug abuse', 'intentional overdose', 'accidental overdose',
  'product quality issue', 'product complaint', 'therapeutic response decreased',
  'therapeutic response increased', 'medication error', 'wrong drug administered',
  'drug dose omission', 'inappropriate schedule of drug administration',
]);

const DESCRIPTIONS = {
  nausea: 'A queasy feeling in the stomach that may cause an urge to vomit.',
  headache: 'Pain or pressure in the head, ranging from mild to severe.',
  dizziness: 'A sensation of lightheadedness or feeling unsteady on your feet.',
  fatigue: 'Persistent tiredness or exhaustion that doesn\'t improve with rest.',
  diarrhoea: 'Frequent loose or watery bowel movements.',
  diarrhea: 'Frequent loose or watery bowel movements.',
  vomiting: 'Forceful emptying of the stomach contents through the mouth.',
  insomnia: 'Difficulty falling asleep, staying asleep, or waking too early.',
  somnolence: 'Excessive drowsiness or sleepiness during the day.',
  'dry mouth': 'Reduced saliva production causing a parched feeling in the mouth.',
  constipation: 'Infrequent or difficult bowel movements.',
  'abdominal pain': 'Discomfort or cramping felt between the chest and pelvis.',
  rash: 'A noticeable change in the color or texture of the skin.',
  anxiety: 'Feelings of worry, nervousness, or unease.',
  tremor: 'Involuntary shaking or trembling, often in the hands.',
  'decreased appetite': 'Reduced desire to eat or feeling full very quickly.',
  palpitations: 'Awareness of your heartbeat, which may feel fast or fluttering.',
  'blurred vision': 'Difficulty seeing clearly, as though looking through fog.',
  myalgia: 'Muscle aches or soreness, often felt as a dull pain.',
  arthralgia: 'Pain in one or more joints without visible swelling.',
  dyspepsia: 'Indigestion — discomfort or burning in the upper stomach area.',
  pruritus: 'Persistent itching of the skin that causes an urge to scratch.',
  hyperhidrosis: 'Excessive sweating beyond what is needed to cool the body.',
  depression: 'Persistent feelings of sadness, hopelessness, or loss of interest.',
  asthenia: 'Overall weakness or lack of energy making daily activities harder.',
  paraesthesia: 'Tingling, numbness, or a pins and needles sensation.',
  irritability: 'Feeling easily annoyed, frustrated, or agitated.',
  'weight increased': 'Noticeable gain in body weight since starting medication.',
  'weight decreased': 'Noticeable loss in body weight since starting medication.',
  malaise: 'A general feeling of discomfort, unease, or being unwell.',
  'hot flush': 'Sudden feeling of warmth spreading through the body.',
  tachycardia: 'Resting heart rate faster than normal, above ~100 bpm.',
  dyspnoea: 'Shortness of breath or difficulty breathing.',
  urticaria: 'Raised, itchy welts on the skin, commonly called hives.',
  'confusional state': 'Difficulty thinking clearly, feeling disoriented.',
  alopecia: 'Thinning or loss of hair from the scalp or body.',
  oedema: 'Swelling caused by fluid buildup, often in feet or hands.',
  edema: 'Swelling caused by fluid buildup, often in feet or hands.',
};

function toTitleCase(str) {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
}

app.post('/api/side-effects', async (req, res) => {
  const { medication } = req.body;
  if (!medication || typeof medication !== 'string' || !medication.trim()) {
    return res.status(400).json({ error: 'Medication name is required' });
  }

  const medName = medication.trim();

  async function queryFDA(name) {
    const search = encodeURIComponent(`patient.drug.medicinalproduct:"${name.toUpperCase()}"`);
    const url = `https://api.fda.gov/drug/event.json?search=${search}&count=patient.reaction.reactionmeddrapt.exact&limit=30`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`FDA API ${response.status}`);
    const data = await response.json();
    if (!data.results?.length) throw new Error('No results');
    return data.results
      .map(r => r.term.toLowerCase())
      .filter(term => !EXCLUDED_TERMS.has(term))
      .slice(0, 12)
      .map(term => ({
        name: toTitleCase(term),
        description: DESCRIPTIONS[term] || DESCRIPTIONS[term.replace(/s$/, '')] || '',
      }));
  }

  try {
    return res.json({ sideEffects: await queryFDA(medName) });
  } catch {
    const simplified = medName.replace(/\s*(hcl|hydrochloride|sulfate|sodium|er|xr|cr|sr)\s*/gi, '').trim();
    if (simplified !== medName) {
      try { return res.json({ sideEffects: await queryFDA(simplified) }); } catch { /* fall through */ }
    }
    return res.json({
      sideEffects: [{ name: 'No data found', description: `No adverse event reports for "${medName}". Try the generic name.` }],
    });
  }
});

app.get('/api/health', async (_req, res) => {
  const dataExists = existsSync(DATA_FILE);
  res.json({ status: 'ok', dataFile: dataExists ? 'exists' : 'empty', origin: ALLOWED_ORIGIN });
});

app.listen(PORT, () => {
  console.log(`Wellness API running on port ${PORT}`);
  console.log(`Allowed origin: ${ALLOWED_ORIGIN}`);
  console.log(`Data: ${DATA_FILE}`);
});
