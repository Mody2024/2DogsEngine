// ============================================
// NEXUS AI — Core State & Utilities
// ============================================

const NEXUS = {
  model: 'aura',       // aura | scriptor | visualex
  mode: 'think',       // fast | think | deep
  dialect: 'en-US',
  wakeActive: false,
  voiceActive: false,
  isGenerating: false,
  attachments: [],

  // Credits
  credits: {
    img: 150,
    code: 200,
    imgMax: 150,
    codeMax: 200,
  },

  // Training memory
  training: {
    chatSamples: [],
    knowledgeBase: [],
    voiceSamples: [],
    imageStyle: null,
    userStyle: null,
    wordFreq: {},
  },

  // Conversation history per model
  history: {
    aura: [],
    scriptor: [],
    visualex: [],
  },

  // Gemini key
  get geminiKey() { return localStorage.getItem('nexus_gemini_key') || ''; },
};

// ============================================
// PERSISTENCE
// ============================================
function loadState() {
  try {
    const credits = JSON.parse(localStorage.getItem('nexus_credits') || '{}');
    const today = new Date().toDateString();
    const savedDay = localStorage.getItem('nexus_credit_day');
    if (savedDay !== today) {
      // Reset daily credits
      NEXUS.credits.img = 150;
      NEXUS.credits.code = 200;
      localStorage.setItem('nexus_credit_day', today);
      saveCredits();
    } else {
      NEXUS.credits.img = credits.img ?? 150;
      NEXUS.credits.code = credits.code ?? 200;
    }

    const training = localStorage.getItem('nexus_training');
    if (training) NEXUS.training = { ...NEXUS.training, ...JSON.parse(training) };

    const dialect = localStorage.getItem('nexus_dialect');
    if (dialect) NEXUS.dialect = dialect;

    const history = localStorage.getItem('nexus_history');
    if (history) NEXUS.history = JSON.parse(history);
  } catch(e) { console.warn('State load error', e); }
}

function saveCredits() {
  localStorage.setItem('nexus_credits', JSON.stringify({
    img: NEXUS.credits.img,
    code: NEXUS.credits.code,
  }));
}

function saveTraining() {
  localStorage.setItem('nexus_training', JSON.stringify(NEXUS.training));
}

function saveHistory() {
  try {
    localStorage.setItem('nexus_history', JSON.stringify(NEXUS.history));
  } catch(e) { /* quota exceeded — trim old */ }
}

function saveDialect() {
  NEXUS.dialect = document.getElementById('dialectSelect').value;
  localStorage.setItem('nexus_dialect', NEXUS.dialect);
  updateDialectLabel();
}

// ============================================
// UTILITIES
// ============================================
function toast(msg, dur = 2500) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), dur);
}

function isArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function detectDir(text) {
  return isArabic(text) ? 'rtl' : 'ltr';
}

function updateDialectLabel() {
  const labels = {
    'en-US': '🇺🇸 English (US)', 'en-GB': '🇬🇧 English (UK)',
    'ar-EG': '🇪🇬 Arabic (Egyptian)', 'ar-SA': '🇸🇦 Arabic (Saudi)',
    'ar-MA': '🇲🇦 Arabic (Moroccan)', 'ar-LB': '🇱🇧 Arabic (Lebanese)',
    'fr-FR': '🇫🇷 French', 'de-DE': '🇩🇪 German',
    'es-ES': '🇪🇸 Spanish', 'tr-TR': '🇹🇷 Turkish',
  };
  const lbl = labels[NEXUS.dialect] || NEXUS.dialect;
  const el = document.getElementById('dialectLabel');
  if (el) el.textContent = lbl;
  const ad = document.getElementById('activeDialect');
  if (ad) ad.textContent = lbl;
}

function cycleDialect() {
  const dialects = ['en-US','en-GB','ar-EG','ar-SA','ar-MA','ar-LB','fr-FR','de-DE','es-ES','tr-TR'];
  const i = dialects.indexOf(NEXUS.dialect);
  NEXUS.dialect = dialects[(i + 1) % dialects.length];
  localStorage.setItem('nexus_dialect', NEXUS.dialect);
  updateDialectLabel();
  toast('Dialect: ' + document.getElementById('dialectLabel').textContent);
}

// ============================================
// MARKDOWN PARSER (lightweight)
// ============================================
function parseMarkdown(text) {
  if (!text) return '';
  let html = text;

  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const highlighted = highlightCode(escaped, lang);
    const id = 'cb_' + Math.random().toString(36).slice(2,8);
    const isRunnable = ['html','javascript','js','python','py','css'].includes(lang.toLowerCase());
    return `<div class="code-block">
      <div class="code-header">
        <span>${lang || 'code'}</span>
        <button onclick="copyCode('${id}')">Copy</button>
      </div>
      <pre class="code-body" id="${id}">${highlighted}</pre>
      <div class="code-actions">
        <button class="copy-btn" onclick="copyCode('${id}')">📋 Copy</button>
        ${isRunnable ? `<button class="run-btn" onclick="runCode('${id}','${lang}')">▶ Run</button>` : ''}
      </div>
    </div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Lists
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>');

  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up p tags around block elements
  html = html.replace(/<p>\s*(<(?:div|h[1-6]|ul|ol|pre)[^>]*>)/g, '$1');
  html = html.replace(/(<\/(?:div|h[1-6]|ul|ol|pre)>)\s*<\/p>/g, '$1');

  return html;
}

function highlightCode(code, lang) {
  // Basic keyword highlighting
  const keywords = {
    python: /\b(def|class|import|from|return|if|elif|else|for|while|try|except|with|as|in|not|and|or|True|False|None|print|len|range|self)\b/g,
    javascript: /\b(const|let|var|function|return|if|else|for|while|async|await|import|export|default|class|new|this|typeof|null|undefined|true|false)\b/g,
    js: /\b(const|let|var|function|return|if|else|for|while|async|await|import|export|default|class|new|this|typeof|null|undefined|true|false)\b/g,
  };
  const kws = keywords[lang?.toLowerCase()] || keywords.javascript;
  let h = code.replace(kws, '<span class="kw">$1</span>');
  h = h.replace(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g, '<span class="str">$1$2$1</span>');
  h = h.replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
  h = h.replace(/(\/\/[^\n]*|#[^\n]*)/g, '<span class="cm">$1</span>');
  return h;
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  updateDialectLabel();
  updateCreditUI();
  renderTrainingStats();
  // Sync dialect select
  const ds = document.getElementById('dialectSelect');
  if (ds) ds.value = NEXUS.dialect;
  // Sync gemini key
  const gk = document.getElementById('geminiKey');
  if (gk) gk.value = NEXUS.geminiKey;
});
