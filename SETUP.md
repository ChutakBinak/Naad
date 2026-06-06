# Naad – Phase 1 Setup Guide

## Quick Start

### 1. Install dependencies + generate icons

```bash
cd ~/Downloads/Projects/Naad

# Generate extension icons (Node.js built-ins only — no npm needed)
node extension/scripts/generate-icons.js

# Install web app dependencies
cd web-app && npm install

# Install extension dependencies
cd ../extension && npm install
```

### 2. Run the web app (dev server)

```bash
cd web-app
npm run dev
# → Opens http://localhost:5173
```

### 3. Build & load the Chrome extension

```bash
cd extension
npm run build
# Output: extension/dist/
```

Then in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/dist/` folder
5. Click the Naad icon (or the puzzle piece) in the toolbar
6. The **Naad side panel** will open

---

## Usage

### Web App (`localhost:5173`)
- Click **Capture Tab Audio** → select a tab in Chrome's picker
  - ⚠️ You **must** check **"Share tab audio"** in the picker dialog
- Press **Space** or tap **Cue** to mark sample boundaries
- Click **Stop** when done
- Preview the recording, then **Export Audio + Cues**
  - Downloads: `naad-<timestamp>.webm` + `naad-cues-<timestamp>.json`

### Chrome Extension (Side Panel)
- Navigate to any tab playing audio
- Click the Naad icon → side panel opens
- Click **Start Recording** → tab audio captured immediately (no dialog needed)
- Press **Space** or **Cue** to mark boundaries
- Click **Stop**, preview, then **Export**

---

## Cue Point Format (JSON export)

```json
{
  "version": "1.0",
  "recordedAt": "2026-06-06T10:30:00.000Z",
  "durationMs": 21000,
  "cuePoints": [
    { "index": 1, "timestampMs": 10000, "label": "00:10.00" },
    { "index": 2, "timestampMs": 15000, "label": "00:15.00" },
    { "index": 3, "timestampMs": 21000, "label": "00:21.00" }
  ]
}
```

Sample slices derived from the example above:
- Sample 1: 0:00 → 0:10
- Sample 2: 0:10 → 0:15
- Sample 3: 0:15 → 0:21
- Sample 4: 0:21 → end

(Sample slicing is implemented in Phase 2.)

---

## Project Structure

```
Naad/
├── extension/            Chrome extension (Manifest V3)
│   ├── src/
│   │   ├── background/   Service worker (opens side panel)
│   │   └── sidepanel/    React UI (tabCapture recording)
│   ├── public/           manifest.json + icons
│   ├── dist/             Built output — load this in Chrome
│   └── scripts/          generate-icons.js
│
├── web-app/              Standalone React app
│   ├── src/
│   │   ├── components/   Timer, CueList
│   │   ├── hooks/        useAudioRecorder (getDisplayMedia)
│   │   ├── store/        Zustand recording state
│   │   └── utils/        Time formatting
│   └── public/           favicon.svg
│
└── SETUP.md              This file
```

---

## Keyboard Shortcuts

| Key   | Action              | Context       |
|-------|---------------------|---------------|
| Space | Mark cue point      | While recording |

---

## Phase Roadmap

- [x] **Phase 1** – Audio capture, cue recording, export
- [ ] **Phase 2** – Sample slicing + waveform visualization
- [ ] **Phase 3** – 9-pad sampler
- [ ] **Phase 4** – Per-pad ADSR + pitch control
- [ ] **Phase 5** – Sequencer + WAV export
