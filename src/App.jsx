import React, { Fragment, useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";

/* ─────────────── CONSTANTS ─────────────── */
const METRICS = [
  { key: "general", label: "General Wellness", color: "#7C9A82", darkColor: "#8fb896" },
  { key: "energy", label: "Energy Level", color: "#D4A574", darkColor: "#e0b98a" },
  { key: "concentration", label: "Concentration", color: "#7B8FB2", darkColor: "#94a7c8" },
  { key: "sleep", label: "Sleep Quality", color: "#9B8BA0", darkColor: "#b3a3b8" },
];
const SEVERITY_LABELS = ["", "Low", "Mild", "Moderate", "Uncomfortable", "Severe"];
const SEVERITY_COLORS = ["", "#7C9A82", "#D4A574", "#D4944C", "#C67A4A", "#B94A3D"];
const TABS = ["Dashboard", "Medications", "History"];

const today = () => new Date().toISOString().split("T")[0];

const DEFAULT_STATE = {
  dailyAssessments: {},
  medications: [],
  sideEffectSeverities: {},
  journal: {},
  notes: "",
  theme: "light",
};

/* ─────────────── SERVER PERSISTENCE ─────────────── */
const API_BASE = import.meta.env.VITE_API_URL || "";
const API_KEY = import.meta.env.VITE_API_KEY || "";

function apiHeaders(extra = {}) {
  return { "Content-Type": "application/json", "x-api-key": API_KEY, ...extra };
}

async function loadFromServer() {
  try {
    const resp = await fetch(`${API_BASE}/api/data`, { headers: apiHeaders() });
    if (resp.ok) {
      const data = await resp.json();
      if (data && typeof data === "object" && data.dailyAssessments) return data;
    }
  } catch { /* server unreachable */ }
  // Fallback: check localStorage for migration
  try {
    const raw = localStorage.getItem("wellness-tracker-data");
    if (raw) {
      const parsed = JSON.parse(raw);
      saveToServer(parsed).catch(() => {});
      localStorage.removeItem("wellness-tracker-data");
      return parsed;
    }
  } catch { /* ignore */ }
  return null;
}

async function saveToServer(data) {
  try {
    await fetch(`${API_BASE}/api/data`, {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.warn("Server save failed:", e);
  }
}

/* ─────────────── SIDE EFFECTS — openFDA + built-in fallback ─────────────── */

// Terms from openFDA that aren't actual side effects
const EXCLUDED_TERMS = new Set([
  "drug ineffective", "off label use", "product substitution issue",
  "therapeutic response unexpected", "drug interaction", "drug exposure during pregnancy",
  "intentional product misuse", "product use issue", "no adverse event",
  "condition aggravated", "death", "completed suicide", "self injury",
  "drug dependence", "drug abuse", "intentional overdose", "accidental overdose",
  "product quality issue", "product complaint", "therapeutic response decreased",
  "therapeutic response increased", "medication error", "wrong drug administered",
  "drug dose omission", "inappropriate schedule of drug administration",
]);

// Patient-friendly descriptions for common MedDRA terms
const DESCRIPTIONS = {
  nausea: "A queasy feeling in the stomach that may cause an urge to vomit.",
  headache: "Pain or pressure in the head, ranging from mild to severe.",
  dizziness: "A sensation of lightheadedness or feeling unsteady on your feet.",
  fatigue: "Persistent tiredness or exhaustion that doesn't improve with rest.",
  diarrhoea: "Frequent loose or watery bowel movements.",
  diarrhea: "Frequent loose or watery bowel movements.",
  vomiting: "Forceful emptying of the stomach contents through the mouth.",
  insomnia: "Difficulty falling asleep, staying asleep, or waking too early.",
  somnolence: "Excessive drowsiness or sleepiness during the day.",
  "dry mouth": "Reduced saliva production causing a parched feeling in the mouth.",
  constipation: "Infrequent or difficult bowel movements.",
  "abdominal pain": "Discomfort or cramping felt between the chest and pelvis.",
  rash: "A noticeable change in the color or texture of the skin.",
  anxiety: "Feelings of worry, nervousness, or unease.",
  "weight increased": "Noticeable gain in body weight since starting medication.",
  "weight decreased": "Noticeable loss in body weight since starting medication.",
  tremor: "Involuntary shaking or trembling, often in the hands.",
  "decreased appetite": "Reduced desire to eat or feeling full very quickly.",
  "increased appetite": "Stronger or more frequent urges to eat.",
  "blood pressure increased": "Higher than normal force of blood against artery walls.",
  palpitations: "Awareness of your heartbeat, which may feel fast or fluttering.",
  "blurred vision": "Difficulty seeing clearly, as though looking through fog.",
  "muscle pain": "Aching or soreness in the muscles.",
  arthralgia: "Pain in one or more joints without visible swelling.",
  myalgia: "Muscle aches or soreness, often felt as a dull pain.",
  dyspepsia: "Indigestion — discomfort or burning in the upper stomach area.",
  "back pain": "Aching or stiffness felt in the lower, middle, or upper back.",
  "upper respiratory tract infection": "Common cold-like symptoms: sore throat, runny nose, cough.",
  cough: "Repeated reflex to clear the airways, may be dry or productive.",
  pruritus: "Persistent itching of the skin that causes an urge to scratch.",
  hyperhidrosis: "Excessive sweating beyond what is needed to cool the body.",
  oedema: "Swelling caused by fluid buildup, often in feet, ankles, or hands.",
  edema: "Swelling caused by fluid buildup, often in feet, ankles, or hands.",
  "peripheral edema": "Swelling in the lower legs, ankles, or feet due to fluid retention.",
  depression: "Persistent feelings of sadness, hopelessness, or loss of interest.",
  "sexual dysfunction": "Changes in sexual desire, arousal, or ability to reach climax.",
  "erectile dysfunction": "Difficulty achieving or maintaining an erection.",
  "libido decreased": "Reduced interest in or desire for sexual activity.",
  flatulence: "Excess gas in the digestive tract causing bloating or passing gas.",
  "nasal congestion": "Stuffy or blocked nose making it difficult to breathe through the nostrils.",
  rhinitis: "Inflammation of the nasal passages causing congestion or runny nose.",
  "urinary tract infection": "Infection in the bladder or urethra causing painful or frequent urination.",
  alopecia: "Thinning or loss of hair from the scalp or body.",
  "feeling abnormal": "A general sense that something feels off or different in your body.",
  malaise: "A general feeling of discomfort, unease, or being unwell.",
  asthenia: "Overall weakness or lack of energy making daily activities harder.",
  "pain in extremity": "Aching or discomfort in the arms, legs, hands, or feet.",
  paraesthesia: "Tingling, numbness, or a 'pins and needles' sensation in the skin.",
  hypoaesthesia: "Reduced sensitivity to touch or sensation in part of the body.",
  tachycardia: "Resting heart rate faster than normal, above ~100 beats per minute.",
  "hot flush": "Sudden feeling of warmth spreading through the body, often with redness.",
  dyspnoea: "Shortness of breath or difficulty breathing.",
  "chest pain": "Discomfort, pressure, or sharp pain felt in the chest area.",
  irritability: "Feeling easily annoyed, frustrated, or agitated.",
  "mood swings": "Rapid or unpredictable changes in emotional state.",
  "drug hypersensitivity": "An allergic-type reaction to a medication.",
  urticaria: "Raised, itchy welts on the skin, commonly called hives.",
  fall: "Loss of balance leading to an unintended drop to the ground.",
  amnesia: "Partial or total memory loss, often short-term.",
  "confusional state": "Difficulty thinking clearly, feeling disoriented or muddled.",
};

// Built-in fallback for common medications (used when API is unreachable)
const FALLBACK_SIDE_EFFECTS = {
  sertraline: ["nausea", "diarrhea", "insomnia", "dry mouth", "fatigue", "dizziness", "headache", "decreased appetite", "hyperhidrosis", "tremor", "sexual dysfunction", "somnolence"],
  zoloft: ["nausea", "diarrhea", "insomnia", "dry mouth", "fatigue", "dizziness", "headache", "decreased appetite", "hyperhidrosis", "tremor", "sexual dysfunction", "somnolence"],
  fluoxetine: ["nausea", "headache", "insomnia", "anxiety", "somnolence", "diarrhea", "decreased appetite", "dry mouth", "tremor", "dizziness", "asthenia", "hyperhidrosis"],
  prozac: ["nausea", "headache", "insomnia", "anxiety", "somnolence", "diarrhea", "decreased appetite", "dry mouth", "tremor", "dizziness", "asthenia", "hyperhidrosis"],
  escitalopram: ["nausea", "headache", "insomnia", "somnolence", "diarrhea", "dry mouth", "dizziness", "fatigue", "constipation", "hyperhidrosis", "libido decreased", "sexual dysfunction"],
  lexapro: ["nausea", "headache", "insomnia", "somnolence", "diarrhea", "dry mouth", "dizziness", "fatigue", "constipation", "hyperhidrosis", "libido decreased", "sexual dysfunction"],
  citalopram: ["nausea", "dry mouth", "somnolence", "insomnia", "diarrhea", "headache", "dizziness", "tremor", "hyperhidrosis", "fatigue", "decreased appetite", "constipation"],
  celexa: ["nausea", "dry mouth", "somnolence", "insomnia", "diarrhea", "headache", "dizziness", "tremor", "hyperhidrosis", "fatigue", "decreased appetite", "constipation"],
  paroxetine: ["nausea", "somnolence", "dry mouth", "headache", "constipation", "dizziness", "insomnia", "diarrhea", "asthenia", "tremor", "hyperhidrosis", "sexual dysfunction"],
  paxil: ["nausea", "somnolence", "dry mouth", "headache", "constipation", "dizziness", "insomnia", "diarrhea", "asthenia", "tremor", "hyperhidrosis", "sexual dysfunction"],
  venlafaxine: ["nausea", "headache", "dizziness", "somnolence", "dry mouth", "insomnia", "constipation", "hyperhidrosis", "asthenia", "anxiety", "blurred vision", "tremor"],
  effexor: ["nausea", "headache", "dizziness", "somnolence", "dry mouth", "insomnia", "constipation", "hyperhidrosis", "asthenia", "anxiety", "blurred vision", "tremor"],
  duloxetine: ["nausea", "headache", "dry mouth", "fatigue", "somnolence", "constipation", "dizziness", "insomnia", "diarrhea", "decreased appetite", "hyperhidrosis", "abdominal pain"],
  cymbalta: ["nausea", "headache", "dry mouth", "fatigue", "somnolence", "constipation", "dizziness", "insomnia", "diarrhea", "decreased appetite", "hyperhidrosis", "abdominal pain"],
  bupropion: ["headache", "dry mouth", "nausea", "insomnia", "dizziness", "constipation", "tremor", "anxiety", "tachycardia", "hyperhidrosis", "rash", "abdominal pain"],
  wellbutrin: ["headache", "dry mouth", "nausea", "insomnia", "dizziness", "constipation", "tremor", "anxiety", "tachycardia", "hyperhidrosis", "rash", "abdominal pain"],
  mirtazapine: ["somnolence", "increased appetite", "weight increased", "dry mouth", "dizziness", "constipation", "asthenia", "fatigue", "peripheral edema", "headache", "abnormal dreams", "confusional state"],
  remeron: ["somnolence", "increased appetite", "weight increased", "dry mouth", "dizziness", "constipation", "asthenia", "fatigue", "peripheral edema", "headache", "abnormal dreams", "confusional state"],
  trazodone: ["somnolence", "headache", "dry mouth", "dizziness", "nausea", "fatigue", "constipation", "blurred vision", "nasal congestion", "hyperhidrosis", "confusion", "palpitations"],
  amitriptyline: ["somnolence", "dry mouth", "constipation", "dizziness", "weight increased", "blurred vision", "headache", "nausea", "fatigue", "urinary retention", "tachycardia", "tremor"],
  alprazolam: ["somnolence", "dizziness", "fatigue", "headache", "dry mouth", "constipation", "nausea", "irritability", "decreased appetite", "confusional state", "insomnia", "blurred vision"],
  xanax: ["somnolence", "dizziness", "fatigue", "headache", "dry mouth", "constipation", "nausea", "irritability", "decreased appetite", "confusional state", "insomnia", "blurred vision"],
  lorazepam: ["somnolence", "dizziness", "fatigue", "headache", "confusional state", "nausea", "amnesia", "depression", "constipation", "blurred vision", "asthenia", "irritability"],
  ativan: ["somnolence", "dizziness", "fatigue", "headache", "confusional state", "nausea", "amnesia", "depression", "constipation", "blurred vision", "asthenia", "irritability"],
  clonazepam: ["somnolence", "dizziness", "fatigue", "depression", "headache", "confusional state", "nausea", "amnesia", "constipation", "decreased appetite", "irritability", "insomnia"],
  klonopin: ["somnolence", "dizziness", "fatigue", "depression", "headache", "confusional state", "nausea", "amnesia", "constipation", "decreased appetite", "irritability", "insomnia"],
  diazepam: ["somnolence", "fatigue", "dizziness", "headache", "confusional state", "amnesia", "nausea", "constipation", "depression", "blurred vision", "asthenia", "tremor"],
  valium: ["somnolence", "fatigue", "dizziness", "headache", "confusional state", "amnesia", "nausea", "constipation", "depression", "blurred vision", "asthenia", "tremor"],
  quetiapine: ["somnolence", "dizziness", "headache", "dry mouth", "weight increased", "constipation", "fatigue", "dyspepsia", "tachycardia", "peripheral edema", "blurred vision", "increased appetite"],
  seroquel: ["somnolence", "dizziness", "headache", "dry mouth", "weight increased", "constipation", "fatigue", "dyspepsia", "tachycardia", "peripheral edema", "blurred vision", "increased appetite"],
  aripiprazole: ["headache", "nausea", "insomnia", "anxiety", "somnolence", "constipation", "dizziness", "vomiting", "fatigue", "blurred vision", "weight increased", "tremor"],
  abilify: ["headache", "nausea", "insomnia", "anxiety", "somnolence", "constipation", "dizziness", "vomiting", "fatigue", "blurred vision", "weight increased", "tremor"],
  lamotrigine: ["headache", "nausea", "rash", "dizziness", "insomnia", "somnolence", "fatigue", "blurred vision", "vomiting", "tremor", "back pain", "rhinitis"],
  lamictal: ["headache", "nausea", "rash", "dizziness", "insomnia", "somnolence", "fatigue", "blurred vision", "vomiting", "tremor", "back pain", "rhinitis"],
  lithium: ["nausea", "tremor", "diarrhea", "vomiting", "dizziness", "fatigue", "headache", "weight increased", "dry mouth", "tachycardia", "polyuria", "thirst"],
  gabapentin: ["somnolence", "dizziness", "fatigue", "headache", "nausea", "peripheral edema", "weight increased", "blurred vision", "dry mouth", "constipation", "tremor", "ataxia"],
  neurontin: ["somnolence", "dizziness", "fatigue", "headache", "nausea", "peripheral edema", "weight increased", "blurred vision", "dry mouth", "constipation", "tremor", "ataxia"],
  pregabalin: ["dizziness", "somnolence", "headache", "peripheral edema", "dry mouth", "weight increased", "blurred vision", "fatigue", "constipation", "nausea", "tremor", "back pain"],
  lyrica: ["dizziness", "somnolence", "headache", "peripheral edema", "dry mouth", "weight increased", "blurred vision", "fatigue", "constipation", "nausea", "tremor", "back pain"],
  metformin: ["diarrhea", "nausea", "vomiting", "abdominal pain", "flatulence", "decreased appetite", "headache", "dyspepsia", "asthenia", "fatigue", "dizziness", "constipation"],
  lisinopril: ["headache", "dizziness", "cough", "fatigue", "nausea", "diarrhea", "hypotension", "rash", "chest pain", "dyspnoea", "back pain", "asthenia"],
  amlodipine: ["peripheral edema", "headache", "dizziness", "fatigue", "nausea", "flushing", "palpitations", "somnolence", "abdominal pain", "dyspnoea", "chest pain", "back pain"],
  atorvastatin: ["headache", "myalgia", "arthralgia", "diarrhea", "nausea", "back pain", "pain in extremity", "insomnia", "urinary tract infection", "dyspepsia", "nasopharyngitis", "fatigue"],
  lipitor: ["headache", "myalgia", "arthralgia", "diarrhea", "nausea", "back pain", "pain in extremity", "insomnia", "urinary tract infection", "dyspepsia", "nasopharyngitis", "fatigue"],
  omeprazole: ["headache", "diarrhea", "nausea", "abdominal pain", "flatulence", "constipation", "vomiting", "dizziness", "rash", "cough", "back pain", "fatigue"],
  prilosec: ["headache", "diarrhea", "nausea", "abdominal pain", "flatulence", "constipation", "vomiting", "dizziness", "rash", "cough", "back pain", "fatigue"],
  pantoprazole: ["headache", "diarrhea", "nausea", "abdominal pain", "flatulence", "constipation", "vomiting", "dizziness", "arthralgia", "insomnia", "rash", "fatigue"],
  levothyroxine: ["headache", "fatigue", "palpitations", "insomnia", "tremor", "anxiety", "diarrhea", "weight decreased", "hyperhidrosis", "hot flush", "alopecia", "nausea"],
  synthroid: ["headache", "fatigue", "palpitations", "insomnia", "tremor", "anxiety", "diarrhea", "weight decreased", "hyperhidrosis", "hot flush", "alopecia", "nausea"],
  metoprolol: ["fatigue", "dizziness", "headache", "diarrhea", "nausea", "bradycardia", "dyspnoea", "depression", "insomnia", "peripheral edema", "chest pain", "back pain"],
  losartan: ["dizziness", "headache", "fatigue", "back pain", "diarrhea", "cough", "nausea", "chest pain", "dyspnoea", "peripheral edema", "insomnia", "arthralgia"],
  hydrochlorothiazide: ["dizziness", "headache", "fatigue", "nausea", "muscle cramps", "hypokalaemia", "hyperuricaemia", "dyspepsia", "diarrhea", "back pain", "blurred vision", "rash"],
  montelukast: ["headache", "upper respiratory tract infection", "cough", "abdominal pain", "diarrhea", "nausea", "fatigue", "rash", "insomnia", "dizziness", "fever", "irritability"],
  singulair: ["headache", "upper respiratory tract infection", "cough", "abdominal pain", "diarrhea", "nausea", "fatigue", "rash", "insomnia", "dizziness", "fever", "irritability"],
  ibuprofen: ["nausea", "headache", "dizziness", "dyspepsia", "abdominal pain", "diarrhea", "constipation", "vomiting", "rash", "flatulence", "edema", "fatigue"],
  advil: ["nausea", "headache", "dizziness", "dyspepsia", "abdominal pain", "diarrhea", "constipation", "vomiting", "rash", "flatulence", "edema", "fatigue"],
  acetaminophen: ["nausea", "headache", "rash", "vomiting", "abdominal pain", "diarrhea", "fatigue", "dizziness", "pruritus", "constipation", "insomnia", "dyspepsia"],
  tylenol: ["nausea", "headache", "rash", "vomiting", "abdominal pain", "diarrhea", "fatigue", "dizziness", "pruritus", "constipation", "insomnia", "dyspepsia"],
  aspirin: ["nausea", "dyspepsia", "abdominal pain", "diarrhea", "headache", "dizziness", "vomiting", "rash", "fatigue", "pruritus", "tinnitus", "constipation"],
  adderall: ["decreased appetite", "insomnia", "headache", "dry mouth", "nausea", "anxiety", "dizziness", "tachycardia", "irritability", "abdominal pain", "weight decreased", "palpitations"],
  methylphenidate: ["decreased appetite", "insomnia", "headache", "nausea", "abdominal pain", "anxiety", "dizziness", "irritability", "tachycardia", "weight decreased", "dry mouth", "vomiting"],
  ritalin: ["decreased appetite", "insomnia", "headache", "nausea", "abdominal pain", "anxiety", "dizziness", "irritability", "tachycardia", "weight decreased", "dry mouth", "vomiting"],
  concerta: ["decreased appetite", "insomnia", "headache", "nausea", "abdominal pain", "anxiety", "dizziness", "irritability", "tachycardia", "weight decreased", "dry mouth", "vomiting"],
  lisdexamfetamine: ["decreased appetite", "insomnia", "dry mouth", "headache", "nausea", "irritability", "anxiety", "dizziness", "weight decreased", "diarrhea", "tachycardia", "vomiting"],
  vyvanse: ["decreased appetite", "insomnia", "dry mouth", "headache", "nausea", "irritability", "anxiety", "dizziness", "weight decreased", "diarrhea", "tachycardia", "vomiting"],
  atomoxetine: ["nausea", "decreased appetite", "headache", "dry mouth", "insomnia", "dizziness", "constipation", "fatigue", "vomiting", "abdominal pain", "somnolence", "irritability"],
  strattera: ["nausea", "decreased appetite", "headache", "dry mouth", "insomnia", "dizziness", "constipation", "fatigue", "vomiting", "abdominal pain", "somnolence", "irritability"],
  prednisone: ["weight increased", "insomnia", "mood swings", "increased appetite", "headache", "nausea", "edema", "fatigue", "dizziness", "dyspepsia", "muscle pain", "hyperhidrosis"],
  amoxicillin: ["diarrhea", "nausea", "rash", "vomiting", "headache", "abdominal pain", "pruritus", "urticaria", "fatigue", "dizziness", "dyspepsia", "flatulence"],
  azithromycin: ["diarrhea", "nausea", "abdominal pain", "vomiting", "headache", "rash", "fatigue", "dizziness", "pruritus", "flatulence", "dyspepsia", "constipation"],
  zithromax: ["diarrhea", "nausea", "abdominal pain", "vomiting", "headache", "rash", "fatigue", "dizziness", "pruritus", "flatulence", "dyspepsia", "constipation"],
  ciprofloxacin: ["nausea", "diarrhea", "headache", "rash", "vomiting", "abdominal pain", "dizziness", "arthralgia", "insomnia", "dyspepsia", "fatigue", "myalgia"],
  warfarin: ["haemorrhage", "nausea", "rash", "fatigue", "headache", "dizziness", "abdominal pain", "pruritus", "alopecia", "vomiting", "diarrhea", "chest pain"],
  coumadin: ["haemorrhage", "nausea", "rash", "fatigue", "headache", "dizziness", "abdominal pain", "pruritus", "alopecia", "vomiting", "diarrhea", "chest pain"],
};

function toTitleCase(str) {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
}

function buildFromFallback(medName) {
  const key = medName.toLowerCase().trim();
  const terms = FALLBACK_SIDE_EFFECTS[key];
  if (!terms) return null;
  return terms.map(term => ({
    name: toTitleCase(term),
    description: DESCRIPTIONS[term] || "",
  }));
}

async function fetchSideEffectsFromFDA(medName) {
  const search = encodeURIComponent(`patient.drug.medicinalproduct:"${medName.toUpperCase()}"`);
  const url = `https://api.fda.gov/drug/event.json?search=${search}&count=patient.reaction.reactionmeddrapt.exact&limit=30`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`FDA API ${resp.status}`);
  const data = await resp.json();

  if (!data.results || data.results.length === 0) {
    throw new Error("No results");
  }

  return data.results
    .map(r => r.term.toLowerCase())
    .filter(term => !EXCLUDED_TERMS.has(term))
    .slice(0, 12)
    .map(term => ({
      name: toTitleCase(term),
      description: DESCRIPTIONS[term] || DESCRIPTIONS[term.replace(/s$/, "")] || "",
    }));
}

async function fetchSideEffects(medName) {
  // Try server proxy first (deployed)
  try {
    const proxyResp = await fetch(`${API_BASE}/api/side-effects`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ medication: medName }),
    });
    if (proxyResp.ok) {
      const data = await proxyResp.json();
      if (data.sideEffects?.length > 0) return normalizeSideEffects(data.sideEffects);
    }
  } catch { /* proxy unavailable */ }

  // Direct openFDA call (CORS enabled)
  try {
    return await fetchSideEffectsFromFDA(medName);
  } catch (e) {
    console.warn("openFDA direct fetch failed:", e.message);
  }

  // Try without common suffixes
  const simplified = medName.replace(/\s*(hcl|hydrochloride|sulfate|sodium|er|xr|cr|sr)\s*/gi, "").trim();
  if (simplified !== medName) {
    try {
      return await fetchSideEffectsFromFDA(simplified);
    } catch { /* fall through */ }
  }

  // Built-in fallback for common medications
  const fallback = buildFromFallback(medName) || buildFromFallback(simplified);
  if (fallback) return fallback;

  return [{ name: "No data found", description: `Could not find side effects for "${medName}". Try the generic drug name.` }];
}

// Handle both old (string[]) and new ({name,description}[]) formats
function normalizeSideEffects(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => {
    if (typeof item === "string") {
      const lower = item.toLowerCase();
      return { name: toTitleCase(item), description: DESCRIPTIONS[lower] || "" };
    }
    if (item && typeof item === "object" && item.name) return { name: item.name, description: item.description || "" };
    return { name: String(item), description: "" };
  }).filter(item => item.name && item.name !== "undefined" && item.name !== "null");
}

/* ─────────────── ICONS ─────────────── */
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const PillIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}>
    <path d="M10.5 1.5L3 9a4.24 4.24 0 0 0 6 6l7.5-7.5a4.24 4.24 0 0 0-6-6z"/><line x1="10" y1="8" x2="16" y2="14"/>
  </svg>
);
const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

/* ─────────────── MAIN APP ─────────────── */
export default function WellnessTracker() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedDate, setSelectedDate] = useState(today());
  const saveTimer = useRef(null);
  const initialLoad = useRef(true);

  const theme = state.theme;
  const dark = theme === "dark";

  // Load from server on mount
  useEffect(() => {
    loadFromServer().then(data => {
      if (data) setState(data);
      setLoaded(true);
    });
  }, []);

  // Auto-save to server with debounce (skip initial load)
  useEffect(() => {
    if (!loaded) return;
    if (initialLoad.current) { initialLoad.current = false; return; }
    clearTimeout(saveTimer.current);
    setSyncing(true);
    saveTimer.current = setTimeout(() => {
      saveToServer(state).then(() => {
        setTimeout(() => setSyncing(false), 300);
      });
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [state, loaded]);

  const update = useCallback((fn) => setState(prev => ({ ...prev, ...fn(prev) })), []);

  const todayAssessment = state.dailyAssessments[selectedDate] || { general: 5, energy: 5, concentration: 5, sleep: 5 };

  const setAssessment = (key, val) => {
    update(p => ({
      dailyAssessments: {
        ...p.dailyAssessments,
        [selectedDate]: { ...todayAssessment, [key]: val }
      }
    }));
  };

  const activeMeds = useMemo(() =>
    state.medications.filter(m => !m.endDate || m.endDate >= selectedDate),
    [state.medications, selectedDate]
  );

  // Build weighted, sorted side effects array: [[name, {meds, count, description}], ...]
  const allSideEffects = useMemo(() => {
    const map = {};
    activeMeds.forEach(m => {
      (m.sideEffects || []).forEach(se => {
        // Handle both old string format and new {name, description} format
        const name = typeof se === "string" ? se : (se && se.name ? se.name : String(se));
        const desc = typeof se === "object" && se !== null ? (se.description || "") : "";
        if (!name || name === "undefined") return; // skip invalid entries
        if (!map[name]) map[name] = { meds: [], count: 0, description: desc };
        map[name].meds.push(m.name);
        map[name].count += 1;
        // Keep the longest description found
        if (desc && desc.length > (map[name].description || "").length) {
          map[name].description = desc;
        }
      });
    });
    // Sort by count descending (most likely first), then alphabetically
    return Object.entries(map).sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return a[0].localeCompare(b[0]);
    });
  }, [activeMeds]);

  const setSeverity = (effect, val) => {
    update(p => ({
      sideEffectSeverities: {
        ...p.sideEffectSeverities,
        [selectedDate]: { ...(p.sideEffectSeverities[selectedDate] || {}), [effect]: val }
      }
    }));
  };

  const toggleTheme = () => update(() => ({ theme: dark ? "light" : "dark" }));

  const T = {
    bg: dark ? "#12151e" : "#f7f5f0",
    card: dark ? "#1a1f2e" : "#ffffff",
    cardAlt: dark ? "#222839" : "#f0ede6",
    text: dark ? "#e0ddd6" : "#2c2c2c",
    textMuted: dark ? "#8a8780" : "#8a8780",
    accent: dark ? "#8fb896" : "#7C9A82",
    accentSoft: dark ? "rgba(143,184,150,0.12)" : "rgba(124,154,130,0.08)",
    border: dark ? "#2a3040" : "#e8e4dc",
    input: dark ? "#222839" : "#f7f5f0",
    danger: "#B94A3D",
    shadow: dark ? "0 2px 12px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.06)",
  };

  const baseStyles = {
    fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
    background: T.bg, color: T.text, minHeight: "100vh",
    transition: "background 0.3s, color 0.3s",
  };

  if (!loaded) {
    return (
      <div style={{ ...baseStyles, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap" rel="stylesheet" />
        <p style={{ color: T.textMuted, fontSize: 14, marginTop: 120 }}>Loading patient data...</p>
      </div>
    );
  }

  return (
    <div style={baseStyles}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600;9..144,700&display=swap" rel="stylesheet" />

      {/* ─── HEADER ─── */}
      <header style={{
        padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${T.border}`, background: T.card,
        position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: T.accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 16, fontFamily: "'Fraunces', serif",
          }}>W</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, fontFamily: "'Fraunces', serif", letterSpacing: "-0.02em" }}>
              Wellness Tracker
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: T.textMuted, fontWeight: 400 }}>Daily Health Monitor</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 10, color: syncing ? T.accent : T.textMuted,
            transition: "color 0.3s", fontWeight: 500,
          }}>
            {syncing ? "● Saving..." : "✓ Saved to server"}
          </span>
          <button onClick={toggleTheme} style={{
            background: T.accentSoft, border: "none", borderRadius: 8, padding: "8px 10px",
            cursor: "pointer", color: T.text, display: "flex", alignItems: "center", transition: "all 0.2s",
          }} title={dark ? "Switch to light mode" : "Switch to dark mode"}>
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {/* ─── TAB BAR ─── */}
      <nav style={{
        display: "flex", gap: 4, padding: "12px 24px 0",
        borderBottom: `1px solid ${T.border}`, background: T.card,
      }}>
        {TABS.map((tab, i) => (
          <button key={tab} onClick={() => setActiveTab(i)} style={{
            padding: "10px 20px", border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif", borderRadius: "8px 8px 0 0", transition: "all 0.2s",
            background: activeTab === i ? T.bg : "transparent",
            color: activeTab === i ? T.accent : T.textMuted,
            borderBottom: activeTab === i ? `2px solid ${T.accent}` : "2px solid transparent",
          }}>
            {tab}
          </button>
        ))}
      </nav>

      <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 60px" }}>
        {activeTab === 0 && (
          <DashboardTab T={T} dark={dark} selectedDate={selectedDate} setSelectedDate={setSelectedDate}
            assessment={todayAssessment} setAssessment={setAssessment}
            allSideEffects={allSideEffects}
            severities={state.sideEffectSeverities[selectedDate] || {}}
            setSeverity={setSeverity}
            journal={state.journal[selectedDate] || ""}
            setJournal={(val) => update(p => ({ journal: { ...p.journal, [selectedDate]: val } }))}
            notes={state.notes} setNotes={(val) => update(() => ({ notes: val }))}
          />
        )}
        {activeTab === 1 && (
          <MedicationsTab T={T} dark={dark} medications={state.medications}
            setMedications={(meds) => update(() => ({ medications: meds }))} />
        )}
        {activeTab === 2 && (
          <HistoryTab T={T} dark={dark} state={state} />
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DASHBOARD TAB
   ═══════════════════════════════════════════════ */
function DashboardTab({ T, dark, selectedDate, setSelectedDate, assessment, setAssessment, allSideEffects, severities, setSeverity, journal, setJournal, notes, setNotes }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Date Picker */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <CalendarIcon />
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          style={{
            background: T.input, color: T.text, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: "8px 14px", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
            cursor: "pointer", outline: "none",
          }} />
        <button onClick={() => setSelectedDate(today())} style={{
          background: T.accentSoft, color: T.accent, border: "none", borderRadius: 6,
          padding: "7px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}>Today</button>
        <span style={{ fontSize: 12, color: T.textMuted, marginLeft: "auto" }}>
          {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </span>
      </div>

      {/* Daily Assessment */}
      <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
        <h2 style={{ margin: "0 0 20px", fontSize: 16, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>
          Daily Assessment
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {METRICS.map(m => (
            <MetricSlider key={m.key} T={T} dark={dark} metric={m}
              value={assessment[m.key]} onChange={(v) => setAssessment(m.key, v)} />
          ))}
        </div>
      </div>

      {/* Side Effects — Compact Buttons */}
      {allSideEffects.length > 0 && (
        <SideEffectsPanel T={T} dark={dark} allSideEffects={allSideEffects}
          severities={severities} setSeverity={setSeverity} />
      )}

      {/* Journal + Notes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: T.card, borderRadius: 14, padding: 20, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Daily Journal</h3>
          <textarea value={journal} onChange={e => setJournal(e.target.value)}
            placeholder="How are you feeling today? Any symptoms, improvements, or observations..."
            style={{
              width: "100%", minHeight: 180, background: T.input, color: T.text,
              border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, fontSize: 13.5,
              fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none",
              lineHeight: 1.6, boxSizing: "border-box", transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />
        </div>
        <div style={{ background: T.card, borderRadius: 14, padding: 20, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>General Notes</h3>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Persistent notes: allergies, doctor instructions, questions for next visit..."
            style={{
              width: "100%", minHeight: 180, background: T.input, color: T.text,
              border: `1px solid ${T.border}`, borderRadius: 8, padding: 14, fontSize: 13.5,
              fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none",
              lineHeight: 1.6, boxSizing: "border-box", transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Metric Slider ─── */
function MetricSlider({ T, dark, metric, value, onChange }) {
  const color = dark ? metric.darkColor : metric.color;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{metric.label}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'Fraunces', serif" }}>{value}</span>
      </div>
      <input type="range" min="1" max="10" value={value} onChange={e => onChange(+e.target.value)}
        style={{ width: "100%", accentColor: color, cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.textMuted }}>
        <span>Poor</span><span>Excellent</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SIDE EFFECTS — Weighted Buttons + Inline Expand Below Button
   ═══════════════════════════════════════════════ */
function SideEffectsPanel({ T, dark, allSideEffects, severities, setSeverity }) {
  const [expanded, setExpanded] = useState(null);
  // allSideEffects is now sorted array: [[name, {meds, count, description}], ...]

  return (
    <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 16, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>
        Side Effects Monitor
      </h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
        {allSideEffects.map(([effect, data]) => {
          const sev = severities[effect] || 0;
          const isOpen = expanded === effect;
          const sevColor = sev > 0 ? SEVERITY_COLORS[sev] : null;

          return (
            <Fragment key={effect}>
              {/* ─── Pill Button ─── */}
              <button
                onClick={() => setExpanded(prev => prev === effect ? null : effect)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "7px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 500,
                  fontFamily: "'DM Sans', sans-serif", cursor: "pointer",
                  textTransform: "capitalize", whiteSpace: "nowrap",
                  transition: "all 0.2s ease",
                  background: isOpen
                    ? (sevColor ? sevColor + "18" : T.accent + "15")
                    : (sevColor ? sevColor + "10" : T.cardAlt),
                  color: isOpen
                    ? (sevColor || T.accent)
                    : (sevColor || T.text),
                  border: isOpen
                    ? `1.5px solid ${sevColor || T.accent}`
                    : `1px solid ${sevColor ? sevColor + "40" : T.border}`,
                  boxShadow: isOpen ? `0 0 0 3px ${(sevColor || T.accent) + "15"}` : "none",
                }}>
                {effect}
                {data.count > 1 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 10,
                    background: T.accent + "20", color: T.accent, lineHeight: "13px",
                    minWidth: 16, textAlign: "center",
                  }}>×{data.count}</span>
                )}
                {sev > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                    background: SEVERITY_COLORS[sev] + "25", color: SEVERITY_COLORS[sev],
                    lineHeight: "14px",
                  }}>{SEVERITY_LABELS[sev]}</span>
                )}
              </button>

              {/* ─── Inline Expansion (directly below this button's row) ─── */}
              {isOpen && (
                <div style={{
                  flexBasis: "100%", minWidth: 0,
                  padding: 18, marginTop: 4, borderRadius: 12,
                  background: T.cardAlt, border: `1px solid ${T.border}`,
                  animation: "fadeIn 0.2s ease",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>
                          {effect}
                        </h4>
                        {data.count > 1 && (
                          <span style={{ fontSize: 10, color: T.accent, fontWeight: 600 }}>
                            {data.count} medications share this side effect
                          </span>
                        )}
                      </div>
                      {data.description && (
                        <p style={{
                          margin: "6px 0 0", fontSize: 12, color: T.textMuted,
                          lineHeight: 1.5, fontStyle: "italic",
                        }}>
                          {data.description}
                        </p>
                      )}
                      <p style={{ margin: "8px 0 0", fontSize: 11, color: T.textMuted }}>
                        <PillIcon />
                        Likely from: <strong style={{ color: T.text }}>{data.meds.join(", ")}</strong>
                      </p>
                    </div>
                    <button onClick={() => setExpanded(null)} style={{
                      background: "none", border: "none", cursor: "pointer", color: T.textMuted,
                      fontSize: 20, lineHeight: 1, padding: "0 0 0 12px", fontWeight: 300, flexShrink: 0,
                    }}>×</button>
                  </div>

                  {/* Severity Slider */}
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      {SEVERITY_LABELS.slice(1).map((label, i) => {
                        const active = (severities[effect] || 0) === i + 1;
                        return (
                          <span key={label} style={{
                            fontSize: 10, fontWeight: active ? 700 : 400, textAlign: "center", flex: 1,
                            color: active ? SEVERITY_COLORS[i + 1] : T.textMuted, transition: "all 0.15s",
                          }}>{label}</span>
                        );
                      })}
                    </div>
                    <input type="range" min="0" max="5"
                      value={severities[effect] || 0}
                      onChange={e => setSeverity(effect, +e.target.value)}
                      style={{
                        width: "100%", cursor: "pointer",
                        accentColor: SEVERITY_COLORS[severities[effect] || 0] || T.accent,
                      }} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: T.textMuted }}>Not experiencing</span>
                      <span style={{ fontSize: 10, color: T.textMuted }}>Severe</span>
                    </div>
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MEDICATIONS TAB
   ═══════════════════════════════════════════════ */
function MedicationsTab({ T, dark, medications, setMedications }) {
  const [form, setForm] = useState({ name: "", dosage: "", startDate: today(), endDate: "" });
  const [loading, setLoading] = useState(false);

  const addMedication = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    const sideEffects = await fetchSideEffects(form.name.trim());
    const med = {
      id: Date.now().toString(),
      name: form.name.trim(),
      dosage: form.dosage.trim(),
      startDate: form.startDate,
      endDate: form.endDate || "",
      sideEffects,
    };
    setMedications([...medications, med]);
    setForm({ name: "", dosage: "", startDate: today(), endDate: "" });
    setLoading(false);
  };

  const removeMed = (id) => setMedications(medications.filter(m => m.id !== id));
  const updateMed = (id, updates) => setMedications(medications.map(m => m.id === id ? { ...m, ...updates } : m));

  const active = medications.filter(m => !m.endDate);
  const past = medications.filter(m => m.endDate);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
        <h2 style={{ margin: "0 0 18px", fontSize: 16, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Add Medication</h2>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
          <InputField T={T} label="Medication Name" value={form.name}
            onChange={v => setForm({ ...form, name: v })} placeholder="e.g., Sertraline" />
          <InputField T={T} label="Dosage (optional)" value={form.dosage}
            onChange={v => setForm({ ...form, dosage: v })} placeholder="e.g., 50mg" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
          <InputField T={T} label="Start Date" type="date" value={form.startDate}
            onChange={v => setForm({ ...form, startDate: v })} />
          <InputField T={T} label="End Date (blank = current)" type="date" value={form.endDate}
            onChange={v => setForm({ ...form, endDate: v })} />
          <button onClick={addMedication} disabled={loading || !form.name.trim()} style={{
            background: T.accent, color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 20px", fontSize: 13.5, fontWeight: 600, cursor: loading ? "wait" : "pointer",
            fontFamily: "'DM Sans', sans-serif", opacity: loading || !form.name.trim() ? 0.5 : 1,
            height: 40, transition: "opacity 0.2s",
          }}>
            {loading ? "Fetching side effects..." : "Add Medication"}
          </button>
        </div>
      </div>

      {active.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontFamily: "'Fraunces', serif", fontWeight: 600, margin: "0 0 12px", color: T.accent }}>
            Currently Taking ({active.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map(med => (
              <MedCard key={med.id} T={T} med={med} onRemove={() => removeMed(med.id)}
                onEnd={() => updateMed(med.id, { endDate: today() })} />
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontFamily: "'Fraunces', serif", fontWeight: 600, margin: "0 0 12px", color: T.textMuted }}>
            Past Medications ({past.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {past.map(med => (
              <MedCard key={med.id} T={T} med={med} onRemove={() => removeMed(med.id)} past />
            ))}
          </div>
        </div>
      )}

      {medications.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.textMuted, fontSize: 14 }}>
          No medications added yet. Use the form above to add your first medication.
        </div>
      )}
    </div>
  );
}

function MedCard({ T, med, onRemove, onEnd, past }) {
  return (
    <div style={{
      background: T.card, borderRadius: 12, padding: 16, boxShadow: T.shadow,
      border: `1px solid ${T.border}`, opacity: past ? 0.7 : 1,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{med.name}</span>
            {med.dosage && <span style={{ fontSize: 12, color: T.textMuted, background: T.cardAlt, padding: "2px 8px", borderRadius: 4 }}>{med.dosage}</span>}
            {!past && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: T.accent + "20", color: T.accent, fontWeight: 600 }}>Active</span>}
          </div>
          <div style={{ fontSize: 12, color: T.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
            <CalendarIcon /> {med.startDate}{med.endDate ? ` → ${med.endDate}` : " → present"}
          </div>
          {med.sideEffects?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
              {med.sideEffects.map((se, i) => {
                const name = typeof se === "string" ? se : se.name;
                return (
                  <span key={name + i} style={{
                    fontSize: 10, padding: "2px 8px", borderRadius: 4,
                    background: T.cardAlt, color: T.textMuted, border: `1px solid ${T.border}`,
                  }}>{name}</span>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {!past && onEnd && (
            <button onClick={onEnd} style={{
              background: T.cardAlt, color: T.textMuted, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}>End</button>
          )}
          <button onClick={onRemove} style={{
            background: "none", color: T.danger, border: `1px solid ${T.danger}40`,
            borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer",
            fontFamily: "'DM Sans', sans-serif",
          }}>Remove</button>
        </div>
      </div>
    </div>
  );
}

function InputField({ T, label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: T.textMuted }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          background: T.input, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: "9px 12px", fontSize: 13.5, fontFamily: "'DM Sans', sans-serif", outline: "none",
          transition: "border-color 0.2s", height: 40, boxSizing: "border-box",
        }}
        onFocus={e => e.target.style.borderColor = T.accent}
        onBlur={e => e.target.style.borderColor = T.border}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   HISTORY TAB
   ═══════════════════════════════════════════════ */
function HistoryTab({ T, dark, state }) {
  const [range, setRange] = useState(30);

  const chartData = useMemo(() => {
    const dates = Object.keys(state.dailyAssessments).sort();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    return dates.filter(d => d >= cutoffStr).map(date => {
      const a = state.dailyAssessments[date];
      const sevs = state.sideEffectSeverities[date] || {};
      const avgSev = Object.values(sevs).length
        ? (Object.values(sevs).reduce((s, v) => s + v, 0) / Object.values(sevs).length).toFixed(1) : 0;
      return {
        date: new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        rawDate: date, general: a.general, energy: a.energy,
        concentration: a.concentration, sleep: a.sleep,
        avgSeverity: +avgSev,
        overall: +((a.general + a.energy + a.concentration + a.sleep) / 4).toFixed(1),
      };
    });
  }, [state, range]);

  const radarData = useMemo(() => {
    if (chartData.length === 0) return [];
    const last7 = chartData.slice(-7);
    return METRICS.map(m => ({
      metric: m.label,
      value: +(last7.reduce((s, d) => s + d[m.key], 0) / last7.length).toFixed(1),
    }));
  }, [chartData]);

  const medTimeline = useMemo(() => {
    return state.medications.map(m => ({
      name: m.name + (m.dosage ? ` (${m.dosage})` : ""),
      start: m.startDate, end: m.endDate || today(), active: !m.endDate,
    }));
  }, [state.medications]);

  if (chartData.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 60, color: T.textMuted }}>
        <p style={{ fontSize: 16, fontFamily: "'Fraunces', serif" }}>No data recorded yet</p>
        <p style={{ fontSize: 13 }}>Start logging daily assessments on the Dashboard to see your history here.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: T.textMuted, marginRight: 4 }}>Show:</span>
        {[7, 14, 30, 90].map(d => (
          <button key={d} onClick={() => setRange(d)} style={{
            background: range === d ? T.accent : T.cardAlt,
            color: range === d ? "#fff" : T.textMuted,
            border: `1px solid ${range === d ? T.accent : T.border}`,
            borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
          }}>{d}d</button>
        ))}
      </div>

      <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Wellness Overview</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <defs><linearGradient id="gradOverall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.accent} stopOpacity={0.3}/><stop offset="95%" stopColor={T.accent} stopOpacity={0}/>
            </linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textMuted }} />
            <YAxis domain={[1, 10]} tick={{ fontSize: 11, fill: T.textMuted }} />
            <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
            <Area type="monotone" dataKey="overall" stroke={T.accent} fill="url(#gradOverall)" strokeWidth={2} name="Overall" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Metric Breakdown</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textMuted }} />
            <YAxis domain={[1, 10]} tick={{ fontSize: 11, fill: T.textMuted }} />
            <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {METRICS.map(m => (
              <Line key={m.key} type="monotone" dataKey={m.key} stroke={dark ? m.darkColor : m.color}
                strokeWidth={2} dot={{ r: 3 }} name={m.label} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {radarData.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>7-Day Balance</h3>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={T.border} />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10.5, fill: T.textMuted }} />
                <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 9, fill: T.textMuted }} />
                <Radar dataKey="value" stroke={T.accent} fill={T.accent} fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Avg. Side Effect Severity</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData.filter(d => d.avgSeverity > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textMuted }} />
                <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: T.textMuted }} />
                <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="avgSeverity" fill="#D4944C" radius={[4, 4, 0, 0]} name="Avg Severity" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {medTimeline.length > 0 && (
        <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Medication Timeline</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {medTimeline.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 500, width: 160, flexShrink: 0, textAlign: "right" }}>{m.name}</span>
                <div style={{ flex: 1, height: 24, background: T.cardAlt, borderRadius: 6, position: "relative", overflow: "hidden", border: `1px solid ${T.border}` }}>
                  <div style={{
                    position: "absolute", top: 0, bottom: 0, borderRadius: 6,
                    background: m.active ? T.accent + "50" : T.textMuted + "30",
                    border: `1px solid ${m.active ? T.accent : T.textMuted}40`,
                    left: "0%", right: m.active ? "0%" : "20%",
                  }}>
                    <span style={{ position: "absolute", left: 8, top: 4, fontSize: 10, color: T.text }}>{m.start}</span>
                    {!m.active && <span style={{ position: "absolute", right: 8, top: 4, fontSize: 10, color: T.textMuted }}>{m.end}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: T.card, borderRadius: 14, padding: 24, boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontFamily: "'Fraunces', serif", fontWeight: 600 }}>Wellness vs. Side Effect Severity</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.textMuted }} />
            <YAxis yAxisId="left" domain={[1, 10]} tick={{ fontSize: 11, fill: T.textMuted }} label={{ value: "Wellness", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: T.textMuted } }} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 11, fill: T.textMuted }} label={{ value: "Severity", angle: 90, position: "insideRight", style: { fontSize: 11, fill: T.textMuted } }} />
            <Tooltip contentStyle={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line yAxisId="left" type="monotone" dataKey="overall" stroke={T.accent} strokeWidth={2} name="Overall Wellness" dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="avgSeverity" stroke="#D4944C" strokeWidth={2} name="Avg Side Effect Severity" dot={{ r: 3 }} strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 11, color: T.textMuted, margin: "12px 0 0", fontStyle: "italic" }}>
          This chart overlays your overall wellness score against average side-effect severity to identify potential correlations.
        </p>
      </div>

      {/* ─── Discreet Export / Import ─── */}
      <DataPortability T={T} state={state} />
    </div>
  );
}

/* ─── Export / Import (discreet) ─── */
function DataPortability({ T, state }) {
  const [open, setOpen] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const fileRef = useRef(null);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wellness-data-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus("Reading...");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || !data.dailyAssessments) {
        setImportStatus("Invalid file format.");
        return;
      }
      // Save to server
      await fetch(`${API_BASE}/api/data`, {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify(data),
      });
      setImportStatus("Imported. Reload the page to see your data.");
    } catch (err) {
      setImportStatus("Import failed: " + err.message);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "none", border: "none", cursor: "pointer",
        color: T.textMuted, fontSize: 11, fontFamily: "'DM Sans', sans-serif",
        padding: "4px 0", opacity: 0.6, transition: "opacity 0.2s",
      }}
        onMouseEnter={e => e.currentTarget.style.opacity = 1}
        onMouseLeave={e => e.currentTarget.style.opacity = 0.6}
      >
        {open ? "▾" : "▸"} Data management
      </button>

      {open && (
        <div style={{
          marginTop: 8, padding: 16, borderRadius: 10,
          background: T.cardAlt, border: `1px solid ${T.border}`,
          animation: "fadeIn 0.15s ease",
        }}>
          <p style={{ margin: "0 0 12px", fontSize: 11, color: T.textMuted, lineHeight: 1.5 }}>
            Export your data before redeployment. Import to restore.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={handleExport} style={{
              background: T.card, color: T.text, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 500,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              transition: "border-color 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
            >
              ↓ Export JSON
            </button>
            <label style={{
              background: T.card, color: T.text, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: "6px 14px", fontSize: 11, fontWeight: 500,
              cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              transition: "border-color 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
              onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
            >
              ↑ Import JSON
              <input ref={fileRef} type="file" accept=".json" onChange={handleImport}
                style={{ display: "none" }} />
            </label>
            {importStatus && (
              <span style={{ fontSize: 11, color: importStatus.includes("fail") || importStatus.includes("Invalid") ? T.danger : T.accent }}>
                {importStatus}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
