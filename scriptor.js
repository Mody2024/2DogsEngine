// ============================================
// NEXUS AI — Scriptor Code Runner
// ============================================

// ============================================
// CODE COPY & RUN
// ============================================
function copyCode(blockId) {
  const el = document.getElementById(blockId);
  if (!el) return;
  const text = el.innerText || el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    toast('✅ Code copied!');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('✅ Code copied!');
  });
}

function runCode(blockId, lang) {
  if (NEXUS.credits.code <= 0) {
    toast('⚠️ Daily code run credits exhausted!');
    return;
  }

  const el = document.getElementById(blockId);
  if (!el) return;
  const code = el.innerText || el.textContent;

  NEXUS.credits.code--;
  saveCredits();
  updateCreditUI();

  const runner = document.getElementById('codeRunner');
  const frame = document.getElementById('runnerFrame');
  runner.classList.remove('hidden');

  lang = (lang || '').toLowerCase();

  if (lang === 'html') {
    runHTML(code, frame);
  } else if (lang === 'javascript' || lang === 'js') {
    runJavaScript(code, frame);
  } else if (lang === 'css') {
    runCSS(code, frame);
  } else if (lang === 'python' || lang === 'py') {
    runPython(code, frame);
  } else {
    // Try to detect and run
    if (code.trim().startsWith('<')) {
      runHTML(code, frame);
    } else {
      runJavaScript(code, frame);
    }
  }
}

function runHTML(code, frame) {
  const blob = new Blob([code], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  frame.src = url;
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function runJavaScript(code, frame) {
  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: 'JetBrains Mono', monospace; background: #0a0a18; color: #c8d3f5; padding: 16px; margin: 0; font-size: 13px; }
  .output { white-space: pre-wrap; line-height: 1.6; }
  .error { color: #ef4444; }
  .log { color: #86efac; }
</style>
</head>
<body>
<div class="output" id="out"></div>
<script>
  const out = document.getElementById('out');
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;

  console.log = (...args) => {
    const line = document.createElement('div');
    line.className = 'log';
    line.textContent = '▶ ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
    out.appendChild(line);
    origLog(...args);
  };
  console.error = (...args) => {
    const line = document.createElement('div');
    line.className = 'error';
    line.textContent = '✗ ' + args.join(' ');
    out.appendChild(line);
  };
  console.warn = (...args) => {
    const line = document.createElement('div');
    line.style.color = '#fbbf24';
    line.textContent = '⚠ ' + args.join(' ');
    out.appendChild(line);
  };

  window.onerror = (msg, src, line) => {
    const el = document.createElement('div');
    el.className = 'error';
    el.textContent = '✗ Error at line ' + line + ': ' + msg;
    out.appendChild(el);
    return true;
  };

  try {
    ${code}
  } catch(e) {
    const el = document.createElement('div');
    el.className = 'error';
    el.textContent = '✗ ' + e.message;
    out.appendChild(el);
  }
<\/script>
</body>
</html>`;
  runHTML(html, frame);
}

function runCSS(code, frame) {
  const html = `<!DOCTYPE html>
<html>
<head>
<style>
body { background: #f0f0f0; padding: 20px; font-family: sans-serif; }
.demo { background: white; padding: 30px; border-radius: 12px; }
${code}
</style>
</head>
<body>
<div class="demo">
  <h1 class="title">CSS Preview</h1>
  <p class="text">This is a paragraph for CSS testing.</p>
  <button class="btn">Button Element</button>
  <div class="box" style="width:100px;height:100px;background:#7c6fff;margin:10px 0;border-radius:8px;"></div>
  <ul class="list"><li>Item One</li><li>Item Two</li><li>Item Three</li></ul>
</div>
</body>
</html>`;
  runHTML(html, frame);
}

function runPython(code, frame) {
  // Simulate Python output with Skulpt-like display
  const html = `<!DOCTYPE html>
<html>
<head>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css"/>
<style>
  body { font-family: 'Courier New', monospace; background: #0a0a18; color: #c8d3f5; margin:0; padding:16px; font-size:13px; }
  .header { color: #7c6fff; margin-bottom: 12px; font-weight: bold; }
  .output { white-space: pre-wrap; line-height: 1.7; }
  .error { color: #ef4444; }
  .info { color: #94a3b8; font-size: 11px; margin-bottom: 8px; }
</style>
</head>
<body>
<div class="header">Python Runner (via Skulpt)</div>
<div class="info">Loading Python interpreter...</div>
<div class="output" id="output"></div>
<script src="https://skulpt.org/js/skulpt.min.js"></script>
<script src="https://skulpt.org/js/skulpt-stdlib.js"></script>
<script>
const out = document.getElementById('output');
const info = document.querySelector('.info');

function outfn(text) {
  out.textContent += text;
}
function errofn(text) {
  const el = document.createElement('span');
  el.className = 'error';
  el.textContent = text;
  out.appendChild(el);
}

Sk.configure({ output: outfn, read: (x) => {
  if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined)
    throw "File not found: '" + x + "'";
  return Sk.builtinFiles["files"][x];
}});

const code = ${JSON.stringify(code)};

info.textContent = 'Running...';
(Sk.importMainWithBody("<stdin>", false, code, true))
  .then(() => { info.textContent = '✅ Finished'; })
  .catch(e => {
    info.textContent = '⚠️ Error';
    errofn('\\n✗ ' + (e.toString()));
  });
<\/script>
</body>
</html>`;
  runHTML(html, frame);
}

function closeRunner() {
  document.getElementById('codeRunner').classList.add('hidden');
}

// ============================================
// SCRIPTOR ENHANCED RESPONSE PROCESSING
// ============================================
function processScriptorResponse(text) {
  // Auto-detect and enhance code blocks
  // Add run buttons to any code
  return text;
}

// ============================================
// CODE CREDIT UI UPDATE
// ============================================
function updateCreditUI() {
  // Chat (unlimited)
  const ci = document.getElementById('chatCredits');
  if (ci) ci.textContent = '∞';

  // Images
  const imgEl = document.getElementById('imgCredits');
  const imgBar = document.getElementById('imgBar');
  if (imgEl) imgEl.textContent = NEXUS.credits.img;
  if (imgBar) imgBar.style.width = (NEXUS.credits.img / NEXUS.credits.imgMax * 100) + '%';

  // Code
  const codeEl = document.getElementById('codeCredits');
  const codeBar = document.getElementById('codeBar');
  if (codeEl) codeEl.textContent = NEXUS.credits.code;
  if (codeBar) codeBar.style.width = (NEXUS.credits.code / NEXUS.credits.codeMax * 100) + '%';
}
