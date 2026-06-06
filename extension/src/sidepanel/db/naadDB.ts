import { openDB } from 'idb';
import type { IDBPDatabase, DBSchema } from 'idb';
import type { PadSettings } from '../store/padSettingsStore';

const DB_NAME = 'naad-ext';
const DB_VER  = 1;

export interface StoredSample {
  id?:        number;
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
  id:          string;
  bpm:         number;
  bars:        number;
  steps:       boolean[][];
  isLooping:   boolean;
  metronomeOn: boolean;
  quantize:    boolean;
}

interface NaadExtSchema extends DBSchema {
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

let _dbPromise: Promise<IDBPDatabase<NaadExtSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<NaadExtSchema>> {
  if (!_dbPromise) {
    _dbPromise = openDB<NaadExtSchema>(DB_NAME, DB_VER, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('samples')) {
          const s = db.createObjectStore('samples', { keyPath: 'id', autoIncrement: true });
          s.createIndex('by-order', 'order');
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
