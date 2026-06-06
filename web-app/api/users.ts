/**
 * POST /api/users
 *
 * Saves / updates a user profile in the Google Sheet that acts as the Naad
 * user database.  Called by both the web app and the Chrome extension after
 * Google Sign-In.
 *
 * Body (JSON):
 *   { name, email, instagram?, youtube? }
 *
 * Environment variables required (set in Vercel project settings):
 *   GOOGLE_SHEET_ID              – the Sheet ID from the URL
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL – client_email from the service-account JSON
 *   GOOGLE_SERVICE_ACCOUNT_KEY   – private_key from the service-account JSON
 */

import { createSign } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile {
  name: string;
  email: string;
  instagram?: string;
  youtube?: string;
}

// ── Service-account JWT helpers ───────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

function makeServiceAccountJWT(clientEmail: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   clientEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));

  const signer = createSign('RSA-SHA256');
  signer.write(`${header}.${payload}`);
  signer.end();
  const sig = signer.sign(privateKey, 'base64url');

  return `${header}.${payload}.${sig}`;
}

async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const jwt = makeServiceAccountJWT(clientEmail, privateKey);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  const json = await res.json() as { access_token: string };
  return json.access_token;
}

// ── Sheets helpers ────────────────────────────────────────────────────────────

const SHEET_NAME = 'Users';
const COLUMNS    = ['Email', 'Name', 'Instagram', 'YouTube', 'First Seen', 'Last Seen'];

async function readSheet(token: string, sheetId: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${SHEET_NAME}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets read failed: ${res.status} ${text}`);
  }
  const json = await res.json() as { values?: string[][] };
  return json.values ?? [];
}

async function appendRow(token: string, sheetId: string, row: string[]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${SHEET_NAME}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets append failed: ${res.status} ${text}`);
  }
}

async function updateRow(token: string, sheetId: string, rowIndex: number, row: string[]): Promise<void> {
  // rowIndex is 0-based within the values array; row 1 in the sheet is the header
  const sheetRow = rowIndex + 1; // 0-based values index → 1-based sheet row (header is row 1, data from row 2)
  const range    = `${SHEET_NAME}!A${sheetRow}:${String.fromCharCode(65 + COLUMNS.length - 1)}${sheetRow}`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  const res = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ values: [row] }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets update failed: ${res.status} ${text}`);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  // CORS — allow web app origins and Chrome extensions
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, instagram = '', youtube = '' } = (req.body ?? {}) as UserProfile;
  if (!email || !name) return res.status(400).json({ error: 'name and email are required' });

  const sheetId      = process.env.GOOGLE_SHEET_ID;
  const saEmail      = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const saKey        = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '').replace(/\\n/g, '\n');

  if (!sheetId || !saEmail || !saKey) {
    return res.status(500).json({ error: 'Server misconfiguration: missing env vars' });
  }

  try {
    const token  = await getAccessToken(saEmail, saKey);
    const rows   = await readSheet(token, sheetId);
    const now    = new Date().toISOString();

    // rows[0] = header row; data rows start at index 1
    const dataRows = rows.slice(1);
    const existingIdx = dataRows.findIndex((r) => r[0]?.toLowerCase() === email.toLowerCase());

    if (existingIdx >= 0) {
      // User exists — update name / instagram / youtube / last_seen, keep first_seen
      const existing    = dataRows[existingIdx];
      const firstSeen   = existing[4] ?? now;
      const updatedRow  = [email, name, instagram, youtube, firstSeen, now];
      const sheetRowIdx = existingIdx + 2; // +1 for header, +1 because rows array is 0-based
      await updateRow(token, sheetId, sheetRowIdx, updatedRow);
    } else {
      // New user — append
      await appendRow(token, sheetId, [email, name, instagram, youtube, now, now]);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[naad/api/users]', err);
    return res.status(500).json({ error: String(err) });
  }
}
