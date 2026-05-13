# NEXUS AI Platform
## Aura · Scriptor · Visualex

A full-featured AI platform running entirely from local HTML files.

---

## 🚀 Quick Start

1. Open `index.html` in **Google Chrome** (required for voice features)
2. Go to ⚙️ **Settings** → paste your **Gemini API key**
3. Get a free key at: https://aistudio.google.com/app/apikey

---

## 🤖 Three AI Models

### ◈ Aura — Universal Chat
- Unlimited chat in any language (Arabic, English, French...)
- Egyptian Arabic dialect support
- Memory within each session
- Learns from your uploaded files

### ⟨/⟩ Scriptor — Code Engine
- **200 code runs per day** (resets midnight)
- Runs: HTML, JavaScript, CSS, Python (via Skulpt)
- Live output preview in-app
- Debugging, refactoring, architecture

### ◉ Visualex — Image Generation
- **150 image credits per day** (resets midnight)
- Powered by Pollinations.ai (free, no extra key needed)
- **Arabic text inside images** — fully supported with proper fonts
- 10+ styles: Photorealistic, Cinematic, Anime, Oil Painting...
- Download, regenerate, refine any image

---

## 🧠 Thinking Modes

| Mode | Speed | Best For |
|------|-------|----------|
| ⚡ Fast | Instant | Quick answers, simple questions |
| 🧠 Think | ~3-5s | Most tasks, balanced |
| 🔬 Deep | ~10-15s | Complex analysis, research |

---

## 🧬 Training System

Upload files to train all three models:

- **WhatsApp exports** (.txt) — learns your writing style, vocabulary
- **Images** — trains Visualex style preferences  
- **Voice samples** (.mp3/.wav) — improves dialect recognition
- **Documents** (.txt/.pdf) — adds to Aura's knowledge base

Training data is stored in your browser (localStorage) and persists across sessions.

---

## 🎤 Voice Features

- **Voice Chat**: Click 🎤 → speak → auto-sends message
- **Wake Word**: Say "Hey Aura" → activates automatically
- **TTS**: Responses spoken aloud (when voice mode is on)
- **10 dialects**: Egyptian Arabic 🇪🇬, Saudi 🇸🇦, Lebanese 🇱🇧, Moroccan 🇲🇦, English, French, German, Spanish, Turkish

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` | Switch to Aura |
| `Ctrl+2` | Switch to Scriptor |
| `Ctrl+3` | Switch to Visualex |
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Escape` | Close modals |

---

## 📁 File Structure

```
nexus-ai/
├── index.html      ← Open this in Chrome
├── styles.css      ← All styling
├── core.js         ← State management, utilities
├── gemini.js       ← Gemini API integration
├── visualex.js     ← Image generation (Pollinations.ai)
├── scriptor.js     ← Code runner
├── voice.js        ← Speech recognition/synthesis
├── training.js     ← File-based training system
└── app.js          ← Main app controller
```

---

## ⚠️ Notes

- Voice features require **Google Chrome** or **Edge**
- Python code runs via Skulpt (browser-based Python interpreter)
- Image generation uses Pollinations.ai — quality varies, regenerate if needed
- All data stored locally — nothing uploaded to any server except Gemini API calls
- Credits reset daily at midnight (local time)
