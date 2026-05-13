// ============================================
// NEXUS AI — Voice System
// Web Speech API with dialect support + wake word
// ============================================

let recognition = null;
let synthesis = window.speechSynthesis;
let wakeRecognition = null;
let wakeWordActive = false;
let isListening = false;
let availableVoices = [];
let wakeWord = 'hey aura';

// ============================================
// VOICE INITIALIZATION
// ============================================
function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech recognition not supported');
    return false;
  }
  return true;
}

function loadVoices() {
  availableVoices = synthesis.getVoices();
  if (availableVoices.length === 0) {
    synthesis.addEventListener('voiceschanged', () => {
      availableVoices = synthesis.getVoices();
    }, { once: true });
  }
}

// ============================================
// DIALECT → VOICE MAPPING
// ============================================
const DIALECT_VOICE_PREFS = {
  'ar-EG': ['ar-EG', 'ar_EG', 'Arabic', 'ar'],
  'ar-SA': ['ar-SA', 'ar_SA', 'Arabic', 'ar'],
  'ar-MA': ['ar-MA', 'ar_MA', 'Arabic', 'ar'],
  'ar-LB': ['ar-LB', 'ar_LB', 'Arabic', 'ar'],
  'en-US': ['en-US', 'en_US', 'English'],
  'en-GB': ['en-GB', 'en_GB', 'English'],
  'fr-FR': ['fr-FR', 'fr_FR', 'French', 'fr'],
  'de-DE': ['de-DE', 'de_DE', 'German', 'de'],
  'es-ES': ['es-ES', 'es_ES', 'Spanish', 'es'],
  'tr-TR': ['tr-TR', 'tr_TR', 'Turkish', 'tr'],
};

function getBestVoice(dialect) {
  if (!availableVoices.length) loadVoices();
  const prefs = DIALECT_VOICE_PREFS[dialect] || ['en-US'];

  for (const pref of prefs) {
    const voice = availableVoices.find(v =>
      v.lang.includes(pref) || v.name.toLowerCase().includes(pref.toLowerCase())
    );
    if (voice) return voice;
  }

  // Fallback to any voice
  return availableVoices[0] || null;
}

// ============================================
// TEXT TO SPEECH
// ============================================
function speak(text, dialect = null) {
  if (!synthesis) return;

  // Cancel current
  synthesis.cancel();

  // Clean text for TTS
  const cleanText = text
    .replace(/\[GENERATE_IMAGE:[\s\S]+?\]/g, 'Image generated.')
    .replace(/```[\s\S]+?```/g, 'Code block.')
    .replace(/[#*_`~]/g, '')
    .replace(/https?:\/\/\S+/g, 'link')
    .slice(0, 500); // Limit length for TTS

  if (!cleanText.trim()) return;

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const d = dialect || NEXUS.dialect;
  utterance.lang = d;
  utterance.rate = 0.95;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  const voice = getBestVoice(d);
  if (voice) utterance.voice = voice;

  synthesis.speak(utterance);
}

function stopSpeaking() {
  if (synthesis) synthesis.cancel();
}

// ============================================
// SPEECH TO TEXT
// ============================================
function startListening() {
  if (!initVoice()) {
    toast('⚠️ Speech recognition not supported in this browser. Use Chrome.');
    return;
  }
  if (isListening) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = NEXUS.dialect;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const status = document.getElementById('voiceStatus');
  const transcript = document.getElementById('voiceTranscript');
  const orb = document.getElementById('voiceOrb');

  recognition.onstart = () => {
    isListening = true;
    if (status) status.textContent = '🎙 Listening...';
    if (orb) orb.style.animation = 'orbPulse .5s infinite';
    if (transcript) transcript.textContent = '';
  };

  recognition.onresult = (e) => {
    const result = e.results[e.results.length - 1];
    const text = result[0].transcript;
    if (transcript) {
      transcript.textContent = text;
      transcript.dir = isArabic(text) ? 'rtl' : 'ltr';
    }
    if (result.isFinal) {
      finalizeSpeech(text);
    }
  };

  recognition.onerror = (e) => {
    isListening = false;
    if (status) status.textContent = '⚠️ Error: ' + e.error;
    if (e.error === 'not-allowed') {
      toast('⚠️ Microphone permission denied. Please allow mic access.');
    }
  };

  recognition.onend = () => {
    isListening = false;
    if (status) status.textContent = 'Tap to start speaking';
  };

  recognition.start();
}

function stopListening() {
  if (recognition && isListening) {
    recognition.stop();
    isListening = false;
  }
}

function finalizeSpeech(text) {
  if (!text.trim()) return;

  // Close voice modal and send message
  closeVoiceModal();
  const input = document.getElementById('msgInput');
  if (input) {
    input.value = text;
    input.dir = isArabic(text) ? 'rtl' : 'ltr';
    sendMessage();
  }
}

// ============================================
// VOICE MODAL
// ============================================
function toggleVoice() {
  const modal = document.getElementById('voiceModal');
  const btn = document.getElementById('voiceBtn');
  if (modal.classList.contains('hidden')) {
    modal.classList.remove('hidden');
    btn.classList.add('active');
    loadVoices();
    updateDialectLabel();
  } else {
    closeVoiceModal();
  }
}

function closeVoiceModal() {
  stopListening();
  document.getElementById('voiceModal').classList.add('hidden');
  document.getElementById('voiceBtn').classList.remove('active');
}

// ============================================
// WAKE WORD DETECTION
// ============================================
function toggleWake() {
  if (wakeWordActive) {
    stopWakeWord();
  } else {
    startWakeWord();
  }
}

function startWakeWord() {
  if (!initVoice()) {
    toast('⚠️ Wake word requires Chrome browser with mic access.');
    return;
  }

  wakeWord = (document.getElementById('wakeWordInput')?.value || 'hey aura').toLowerCase();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  wakeRecognition = new SpeechRecognition();
  wakeRecognition.continuous = true;
  wakeRecognition.interimResults = true;
  wakeRecognition.lang = 'en-US'; // Wake word always in English

  wakeRecognition.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript.toLowerCase().trim();
      if (text.includes(wakeWord)) {
        onWakeWordDetected();
      }
    }
  };

  wakeRecognition.onend = () => {
    if (wakeWordActive) {
      // Auto-restart
      setTimeout(() => { try { wakeRecognition.start(); } catch(e){} }, 500);
    }
  };

  wakeRecognition.onerror = (e) => {
    if (e.error !== 'no-speech') {
      console.warn('Wake recognition error:', e.error);
    }
  };

  try {
    wakeRecognition.start();
    wakeWordActive = true;
    document.getElementById('wakeBtn').classList.add('active');
    document.getElementById('wakeBtn').textContent = '🔴 Wake: Active';
    toast(`🎙 Wake word active: "${wakeWord}"`);
  } catch(e) {
    toast('⚠️ Could not start wake word detection.');
  }
}

function stopWakeWord() {
  if (wakeRecognition) {
    wakeRecognition.stop();
    wakeRecognition = null;
  }
  wakeWordActive = false;
  const btn = document.getElementById('wakeBtn');
  if (btn) {
    btn.classList.remove('active');
    btn.textContent = '🎙 Wake Word';
  }
  toast('Wake word deactivated');
}

function onWakeWordDetected() {
  // Visual feedback
  const overlay = document.getElementById('wakeOverlay');
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 2000);

  // Short beep feedback
  playBeep();

  // Open voice modal after brief delay
  setTimeout(() => {
    toggleVoice();
    startListening();
  }, 500);
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}

// ============================================
// VOICE LEARNING (tracks user speech patterns)
// ============================================
function learnFromVoice(transcript) {
  if (!transcript) return;
  // Track commonly spoken words/phrases for better recognition
  const words = transcript.toLowerCase().split(/\s+/);
  words.forEach(w => {
    if (w.length > 3) {
      NEXUS.training.wordFreq[w] = (NEXUS.training.wordFreq[w] || 0) + 1;
    }
  });

  // Detect dialect from Arabic speech
  if (isArabic(transcript)) {
    // Egyptian dialect markers
    const egyptianMarkers = ['انا', 'ايه', 'عايز', 'مش', 'بتاع', 'كده', 'يعني'];
    const hasEgyptian = egyptianMarkers.some(m => transcript.includes(m));
    if (hasEgyptian && NEXUS.dialect !== 'ar-EG') {
      toast('Detected Egyptian Arabic dialect 🇪🇬');
      NEXUS.dialect = 'ar-EG';
      localStorage.setItem('nexus_dialect', 'ar-EG');
      updateDialectLabel();
    }
  }

  saveTraining();
}

// Init voices on load
document.addEventListener('DOMContentLoaded', loadVoices);
