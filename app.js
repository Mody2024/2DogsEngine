// ============================================
// NEXUS AI — Main App Controller
// ============================================

// ============================================
// MODEL & MODE SWITCHING
// ============================================
function switchModel(model) {
  NEXUS.model = model;

  // Update sidebar buttons
  document.querySelectorAll('.model-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.model === model);
  });

  // Update topbar
  const icons = { aura: '◈', scriptor: '⟨/⟩', visualex: '◉' };
  const names = { aura: 'Aura', scriptor: 'Scriptor', visualex: 'Visualex' };
  document.getElementById('topModelIcon').textContent = icons[model];
  document.getElementById('topModelName').textContent = names[model];

  // Update input placeholder
  const placeholders = {
    aura: 'Message Aura... (any language)',
    scriptor: 'Describe what to code...',
    visualex: 'Describe an image... (Arabic supported)',
  };
  const input = document.getElementById('msgInput');
  if (input) input.placeholder = placeholders[model];

  // Show/hide panels
  if (model === 'visualex') {
    showVisualexPanel();
  } else {
    showChatPanel();
  }

  // Render style picker for Visualex
  renderStylePicker();

  // Restore chat history for this model
  renderHistory();
}

function setMode(mode) {
  NEXUS.mode = mode;

  document.querySelectorAll('.mode-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.mode === mode);
  });

  const labels = { fast: '⚡ Fast Mode', think: '🧠 Think Mode', deep: '🔬 Deep Mode' };
  document.getElementById('topMode').textContent = labels[mode];
}

// ============================================
// MESSAGE HANDLING
// ============================================
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';

  // Auto-detect Arabic for RTL
  const text = el.value;
  el.dir = isArabic(text) ? 'rtl' : 'ltr';
}

let attachedFiles = [];

function handleAttach(event) {
  const files = Array.from(event.target.files);
  attachedFiles.push(...files);
  renderAttachPreview();
  event.target.value = '';
}

function renderAttachPreview() {
  let preview = document.querySelector('.attach-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.className = 'attach-preview';
    document.getElementById('inputExtras').prepend(preview);
  }
  preview.innerHTML = attachedFiles.map((f, i) => `
    <div class="attach-item">
      ${getFileIcon(f)} ${f.name.slice(0,20)}
      <button onclick="removeAttach(${i})">✕</button>
    </div>
  `).join('');
}

function removeAttach(i) {
  attachedFiles.splice(i, 1);
  renderAttachPreview();
}

function getFileIcon(file) {
  if (file.type.startsWith('image/')) return '🖼';
  if (file.type.startsWith('audio/')) return '🎙';
  if (file.name.endsWith('.py')) return '🐍';
  if (file.name.endsWith('.js')) return '⚡';
  if (file.name.endsWith('.html')) return '🌐';
  if (file.name.endsWith('.pdf')) return '📄';
  return '📎';
}

async function sendMessage() {
  if (NEXUS.isGenerating) return;

  const input = document.getElementById('msgInput');
  const text = input.value.trim();

  if (!text && !attachedFiles.length) return;

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  input.dir = 'ltr';

  // Clear attach preview
  document.querySelector('.attach-preview')?.remove();
  const filesForMsg = [...attachedFiles];
  attachedFiles = [];

  // Hide welcome screen
  document.getElementById('welcomeScreen')?.remove();

  // Add user message
  addMessage('user', text || '[File attached]', filesForMsg);

  // Add to history
  NEXUS.history[NEXUS.model].push({ role: 'user', content: buildMessageContent(text, filesForMsg) });

  // Generate response
  await generateResponse(text, filesForMsg);
}

function buildMessageContent(text, files) {
  let content = text;
  if (files.length) {
    const fileDescs = files.map(f => `[Attached: ${f.name}]`).join(', ');
    content = content ? `${content}\n${fileDescs}` : fileDescs;
  }
  return content;
}

async function generateResponse(userText, files = []) {
  NEXUS.isGenerating = true;
  document.getElementById('sendBtn').disabled = true;

  // Show typing indicator
  const typingId = showTyping();

  try {
    let response;

    if (NEXUS.model === 'visualex') {
      // Visualex: generate image via Gemini + Pollinations
      response = await callGemini(
        buildHistoryForAPI(NEXUS.model),
        NEXUS.model,
        NEXUS.mode
      );

      removeTyping(typingId);

      // Process image generation commands
      const cleanedResponse = await processVisualexResponse(response, userText);

      if (cleanedResponse) {
        addMessage('ai', cleanedResponse);
        NEXUS.history[NEXUS.model].push({ role: 'assistant', content: cleanedResponse });
      }

    } else {
      // Aura / Scriptor: standard chat
      response = await callGemini(
        buildHistoryForAPI(NEXUS.model),
        NEXUS.model,
        NEXUS.mode
      );

      removeTyping(typingId);
      addMessage('ai', response);
      NEXUS.history[NEXUS.model].push({ role: 'assistant', content: response });

      // Auto-speak if voice was recently active
      if (NEXUS.voiceActive) {
        speak(response, NEXUS.dialect);
      }
    }

    saveHistory();

  } catch (e) {
    removeTyping(typingId);
    addMessage('ai', `⚠️ Something went wrong: ${e.message}`);
  } finally {
    NEXUS.isGenerating = false;
    document.getElementById('sendBtn').disabled = false;
  }
}

function buildHistoryForAPI(model) {
  // Return last 20 messages (10 exchanges) for context
  return NEXUS.history[model].slice(-20);
}

// ============================================
// MESSAGE RENDERING
// ============================================
function addMessage(role, content, files = []) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `msg ${role === 'user' ? 'user' : 'ai'}`;

  const avatarIcon = role === 'user' ? '👤' : getModelIcon();

  const dir = isArabic(content) ? 'rtl' : 'ltr';

  let fileHTML = '';
  if (files && files.length) {
    fileHTML = `<div style="margin-bottom:8px;display:flex;flex-wrap:wrap;gap:6px;">
      ${files.map(f => `<span style="font-size:12px;background:rgba(255,255,255,0.1);padding:3px 8px;border-radius:6px;">${getFileIcon(f)} ${f.name.slice(0,25)}</span>`).join('')}
    </div>`;
  }

  const bubbleContent = role === 'user'
    ? `${fileHTML}<div>${content.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</div>`
    : parseMarkdown(content);

  div.innerHTML = `
    <div class="msg-avatar">${avatarIcon}</div>
    <div class="msg-content">
      <div class="msg-bubble" dir="${dir}">${bubbleContent}</div>
    </div>
  `;

  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function getModelIcon() {
  const icons = { aura: '◈', scriptor: '⟨/⟩', visualex: '◉' };
  return icons[NEXUS.model] || '◈';
}

function showTyping() {
  const msgs = document.getElementById('messages');
  const id = 'typing_' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'msg ai';
  div.innerHTML = `
    <div class="msg-avatar">${getModelIcon()}</div>
    <div class="msg-content">
      <div class="msg-bubble">
        <div class="typing-indicator">
          ${getThinkingLabel()}
          <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>
      </div>
    </div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function getThinkingLabel() {
  const labels = {
    fast: '⚡ Processing...',
    think: '🧠 Thinking...',
    deep: '🔬 Deep analysis...',
  };
  return `<span style="font-size:12px;color:var(--text3);">${labels[NEXUS.mode]}</span>`;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function renderHistory() {
  const msgs = document.getElementById('messages');
  // Remove all messages except welcome screen
  Array.from(msgs.children).forEach(c => {
    if (!c.classList.contains('welcome-screen')) c.remove();
  });

  const history = NEXUS.history[NEXUS.model];
  if (history.length > 0) {
    document.getElementById('welcomeScreen')?.remove();
    history.slice(-30).forEach(msg => {
      addMessage(msg.role === 'assistant' ? 'ai' : 'user', msg.content);
    });
  }
}

// ============================================
// QUICK SEND
// ============================================
function sendQuick(text) {
  document.getElementById('welcomeScreen')?.remove();
  const input = document.getElementById('msgInput');
  input.value = text;
  input.dir = isArabic(text) ? 'rtl' : 'ltr';
  sendMessage();
}

// ============================================
// CLEAR CHAT
// ============================================
function clearChat() {
  NEXUS.history[NEXUS.model] = [];
  saveHistory();

  const msgs = document.getElementById('messages');
  msgs.innerHTML = `
    <div class="welcome-screen" id="welcomeScreen">
      <div class="welcome-glyph">◈</div>
      <h1 class="welcome-title">NEXUS AI</h1>
      <p class="welcome-sub">Aura · Scriptor · Visualex — Three minds, one platform</p>
      <div class="welcome-chips">
        <button class="chip" onclick="sendQuick('اشرح لي الذكاء الاصطناعي')">🇸🇦 اشرح لي الذكاء الاصطناعي</button>
        <button class="chip" onclick="sendQuick('Write a Python web scraper')">⟨/⟩ Python Web Scraper</button>
        <button class="chip" onclick="switchModel(\'visualex\');sendQuick(\'Generate a futuristic city at sunset\')">◉ Futuristic City</button>
        <button class="chip" onclick="sendQuick('What can you do?')">◈ What can you do?</button>
      </div>
    </div>
  `;

  // Clear Visualex grid too if on that model
  if (NEXUS.model === 'visualex') {
    document.getElementById('vxGrid').innerHTML = `
      <div class="vx-empty">
        <div class="vx-empty-icon">◉</div>
        <p>Describe an image in any language</p>
        <p class="vx-hint">Arabic text inside images is fully supported</p>
      </div>`;
  }

  toast('Chat cleared');
}

// ============================================
// SETTINGS
// ============================================
function openSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('geminiKey').value = NEXUS.geminiKey;
  document.getElementById('dialectSelect').value = NEXUS.dialect;
}

function saveSettings() {
  const key = document.getElementById('geminiKey').value.trim();
  if (key) localStorage.setItem('nexus_gemini_key', key);

  NEXUS.dialect = document.getElementById('dialectSelect').value;
  localStorage.setItem('nexus_dialect', NEXUS.dialect);
  updateDialectLabel();

  const ww = document.getElementById('wakeWordInput').value.trim();
  if (ww) wakeWord = ww.toLowerCase();

  const style = document.getElementById('imgStyleDefault').value;
  currentStyle = style;

  closeModal('settingsModal');
  toast('✅ Settings saved!');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ============================================
// SIDEBAR TOGGLE (mobile)
// ============================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================
document.addEventListener('keydown', (e) => {
  // Escape closes modals
  if (e.key === 'Escape') {
    ['settingsModal','trainingModal','voiceModal'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });
    closeRunner();
    stopListening();
  }

  // Ctrl+1/2/3 to switch models
  if (e.ctrlKey && e.key === '1') switchModel('aura');
  if (e.ctrlKey && e.key === '2') switchModel('scriptor');
  if (e.ctrlKey && e.key === '3') switchModel('visualex');
});

// ============================================
// CLOSE MODALS ON BACKDROP CLICK
// ============================================
document.querySelectorAll('.modal-overlay')?.forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
    }
  });
});

// ============================================
// STARTUP
// ============================================
window.addEventListener('DOMContentLoaded', () => {
  // Initialize
  switchModel('aura');
  setMode('think');

  // Close sidebar on mobile by default
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('open');
  }

  // Welcome message
  setTimeout(() => {
    if (!NEXUS.geminiKey) {
      // Show a hint about API key
      const msgs = document.getElementById('messages');
      if (msgs && document.getElementById('welcomeScreen')) {
        const hint = document.createElement('div');
        hint.style.cssText = 'text-align:center;padding:12px 24px;';
        hint.innerHTML = `<span style="font-size:13px;color:var(--text3);">⚙️ Add your <a href="#" onclick="openSettings()" style="color:var(--accent2)">Gemini API key</a> in Settings to get started</span>`;
        msgs.appendChild(hint);
      }
    }
  }, 1000);
});
