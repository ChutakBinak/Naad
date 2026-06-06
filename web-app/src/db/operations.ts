import {
  getDB,
  type StoredRecording,
  type StoredSample,
  type StoredPadSetting,
  type StoredProject,
} from './naadDB';

// ── Recordings ────────────────────────────────────────────────────────────────

export async function saveRecording(r: StoredRecording): Promise<void> {
  await (await getDB()).put('recordings', r);
}

export async function loadRecording(): Promise<StoredRecording | undefined> {
  return (await getDB()).get('recordings', 'current');
}

export async function deleteRecording(): Promise<void> {
  await (await getDB()).delete('recordings', 'current');
}

// ── Samples ───────────────────────────────────────────────────────────────────

export async function saveSamples(rows: StoredSample[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('samples', 'readwrite');
  await tx.store.clear();
  await Promise.all(rows.map((r) => tx.store.add(r)));
  await tx.done;
}

export async function loadSamples(): Promise<StoredSample[]> {
  return (await getDB()).getAllFromIndex('samples', 'by-order');
}

export async function deleteSamples(): Promise<void> {
  await (await getDB()).clear('samples');
}

// ── Pad settings ──────────────────────────────────────────────────────────────

export async function savePadSettings(rows: StoredPadSetting[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('padSettings', 'readwrite');
  await tx.store.clear();
  await Promise.all(rows.map((r) => tx.store.put(r)));
  await tx.done;
}

export async function loadPadSettings(): Promise<StoredPadSetting[]> {
  return (await getDB()).getAll('padSettings');
}

export async function deletePadSettings(): Promise<void> {
  await (await getDB()).clear('padSettings');
}

// ── Sequencer project ─────────────────────────────────────────────────────────

export async function saveProject(p: StoredProject): Promise<void> {
  await (await getDB()).put('sequencerProject', p);
}

export async function loadProject(): Promise<StoredProject | undefined> {
  return (await getDB()).get('sequencerProject', 'current');
}

export async function deleteProject(): Promise<void> {
  await (await getDB()).delete('sequencerProject', 'current');
}

// ── Wipe everything ───────────────────────────────────────────────────────────

export async function clearAllDB(): Promise<void> {
  await Promise.all([
    deleteRecording(),
    deleteSamples(),
    deletePadSettings(),
    deleteProject(),
  ]);
}
