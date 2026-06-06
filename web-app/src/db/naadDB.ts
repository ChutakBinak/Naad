import { openDB } from 'idb';
import type { IDBPDatabase, DBSchema } from 'idb';
import type { PadSettings } from '../store/padSettingsStore';

const DB_NAME = 'naad';
const DB_VER  = 1;

// ── Stored record shapes ──────────────────────────────────────────────────────

export interface StoredRecording {
  id:             string;   // always 'current'
  blob:           Blob;
  elapsed:        number;   // ms
  cueTimestamps:  number[]; // ms each
  savedAt:        number;
}

export interface StoredSample {
  id?:        number;       // auto-increment key
  order:      number;
  index:      number;
  startMs:    number;
  endMs:      number;
  durationMs: number;
  blob:       Blob;
  label:      string;
  timeRange:  string;
}

export interface StoredPadSetting {
  padId:    string;
  settings: PadSettings;
}

export interface StoredProject {
  id:          string;      // always 'current'
  bpm:         number;
  bars:        number;
  steps:       boolean[][];
  isLooping:   boolean;
  metronomeOn: boolean;
  quantize:    boolean;
}

// ── Schema ────────────────────────────────────────────────────────────────────

interface NaadSchema extends DBSchema {
  recordings: {
    key:   string;
    value: StoredRecording;
  };
  samples: {
    key:     number;
    value:   StoredSample;
    indexes: { 'by-order': number };
  };
  padSettings: {
    key:   string;
    value: StoredPadSetting;
  };
  sequencerProject: {
    key:   string;
    value: StoredProject;
  };
}

// ── Singleton DB promise ──────────────────────────────────────────────────────

let _dbPromise: Promise<IDBPDatabase<NaadSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<NaadSchema>> {
  if (!_dbPromise) {
    _dbPromise = openDB<NaadSchema>(DB_NAME, DB_VER, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('recordings')) {
          db.createObjectStore('recordings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('samples')) {
          const store = db.createObjectStore('samples', {
            keyPath:       'id',
            autoIncrement: true,
          });
          store.createIndex('by-order', 'order');
        }
        if (!db.objectStoreNames.contains('padSettings')) {
          db.createObjectStore('padSettings', { keyPath: 'padId' });
        }
        if (!db.objectStoreNames.contains('sequencerProject')) {
          db.createObjectStore('sequencerProject', { keyPath: 'id' });
        }
      },
    });
  }
  return _dbPromise;
}
