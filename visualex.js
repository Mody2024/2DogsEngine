// ============================================
// NEXUS AI — Visualex Image Generation
// Pollinations.ai (free, no key) + Arabic canvas
// ============================================

const IMAGE_STYLES = {
  photorealistic: 'photorealistic, 8k uhd, professional photography, sharp focus, cinematic lighting, RAW photo',
  cinematic: 'cinematic shot, movie still, dramatic lighting, anamorphic lens, film grain, color graded',
  anime: 'anime style, detailed illustration, vibrant colors, Studio Ghibli quality, manga art',
  'digital art': 'digital art, concept art, highly detailed, artstation quality, trending, vibrant',
  'oil painting': 'oil painting, traditional art, textured canvas, rich colors, museum quality, impasto',
  watercolor: 'watercolor painting, soft edges, translucent washes, delicate, artistic',
  '3d render': '3D render, octane render, ray tracing, physically based rendering, professional CGI',
  portrait: 'professional portrait photography, studio lighting, shallow depth of field, bokeh',
  landscape: 'landscape photography, golden hour, dramatic sky, wide angle, stunning vista',
  fantasy: 'fantasy art, magical, epic, detailed world-building, luminous, mystical atmosphere',
};

let currentStyle = 'photorealistic';
let generationQueue = [];
let isGenerating = false;

// ============================================
// STYLE PICKER FOR VISUALEX
// ============================================
function renderStylePicker() {
  const extras = document.getElementById('inputExtras');
  if (!extras) return;
  extras.innerHTML = '';

  if (NEXUS.model !== 'visualex') return;

  const label = document.createElement('span');
  label.style.cssText = 'font-size:11px;color:var(--text3);align-self:center;margin-right:4px;';
  label.textContent = 'Style:';
  extras.appendChild(label);

  Object.keys(IMAGE_STYLES).forEach(style => {
    const pill = document.createElement('button');
    pill.className = 'style-pill' + (style === currentStyle ? ' active' : '');
    pill.textContent = style.charAt(0).toUpperCase() + style.slice(1);
    pill.onclick = () => {
      currentStyle = style;
      document.querySelectorAll('.style-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    };
    extras.appendChild(pill);
  });
}

// ============================================
// CORE IMAGE GENERATION
// ============================================
async function generateImage(prompt, style, arabicText = null) {
  if (NEXUS.credits.img <= 0) {
    toast('⚠️ Daily image credits exhausted. Resets tomorrow!');
    return null;
  }

  NEXUS.credits.img--;
  saveCredits();
  updateCreditUI();

  // Build enhanced prompt
  let fullPrompt = buildImagePrompt(prompt, style, arabicText);

  // Add a card to the visualex grid immediately (loading state)
  const cardId = 'vx_' + Date.now();
  addLoadingCard(cardId, prompt);

  // Encode prompt
  const encoded = encodeURIComponent(fullPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  const width = 1024;
  const height = 1024;

  // Primary: Pollinations.ai
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true&model=flux`;

  try {
    // If Arabic text needed, we overlay it on canvas after image loads
    if (arabicText) {
      return await generateWithArabicOverlay(imageUrl, arabicText, cardId, prompt);
    }

    const img = await loadImage(imageUrl, cardId);
    updateCard(cardId, img.src, prompt, fullPrompt);
    return img.src;
  } catch (e) {
    // Fallback to alternate Pollinations model
    try {
      const fallbackUrl = `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&seed=${seed+1}&nologo=true&model=turbo`;
      const img = await loadImage(fallbackUrl, cardId);
      updateCard(cardId, img.src, prompt, fullPrompt);
      return img.src;
    } catch(e2) {
      removeCard(cardId);
      toast('⚠️ Image generation failed. Try again.');
      NEXUS.credits.img++; // Refund
      saveCredits();
      updateCreditUI();
      return null;
    }
  }
}

function buildImagePrompt(userPrompt, style, arabicText) {
  const styleDesc = IMAGE_STYLES[style] || IMAGE_STYLES.photorealistic;

  // Translate common Arabic concepts for better generation
  let basePrompt = userPrompt;

  // If the prompt is in Arabic, we need to describe it in English for Pollinations
  // The AI (Visualex/Gemini) handles translation; this handles the technical side
  let prompt = `${basePrompt}, ${styleDesc}`;

  // Add quality boosters
  prompt += ', masterpiece, best quality, ultra detailed, 8k resolution';

  // Arabic text rendering note (handled separately via canvas)
  if (arabicText) {
    prompt += `, with space for Arabic text overlay`;
  }

  return prompt;
}

function loadImage(url, cardId) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
    // Timeout after 30s
    setTimeout(() => reject(new Error('Timeout')), 30000);
  });
}

// ============================================
// ARABIC TEXT OVERLAY ON CANVAS
// ============================================
async function generateWithArabicOverlay(imageUrl, arabicText, cardId, prompt) {
  const img = await loadImage(imageUrl, cardId);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 1024;
  canvas.height = img.naturalHeight || 1024;
  const ctx = canvas.getContext('2d');

  // Draw base image
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Arabic text overlay with proper font
  const fontSize = Math.max(48, Math.floor(canvas.width / 12));
  ctx.font = `bold ${fontSize}px 'Noto Sans Arabic', 'Arial Unicode MS', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';

  // Background for readability
  const textWidth = ctx.measureText(arabicText).width;
  const textY = canvas.height * 0.85;
  const padding = 20;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.roundRect(
    canvas.width/2 - textWidth/2 - padding,
    textY - fontSize/2 - padding/2,
    textWidth + padding*2,
    fontSize + padding,
    12
  );
  ctx.fill();

  // White text with shadow
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(arabicText, canvas.width / 2, textY);

  const finalUrl = canvas.toDataURL('image/jpeg', 0.92);
  updateCard(cardId, finalUrl, prompt, prompt);
  return finalUrl;
}

// ============================================
// VISUALEX GRID MANAGEMENT
// ============================================
function addLoadingCard(id, prompt) {
  const grid = document.getElementById('vxGrid');
  if (!grid) return;

  // Remove empty state
  const empty = grid.querySelector('.vx-empty');
  if (empty) empty.remove();

  const card = document.createElement('div');
  card.className = 'vx-loading shimmer';
  card.id = id;
  card.style.borderRadius = 'var(--radius)';
  card.style.border = '1px solid var(--border)';
  card.style.minHeight = '280px';
  card.innerHTML = `
    <div class="vx-spinner"></div>
    <div style="font-size:12px;color:var(--text3);text-align:center;padding:0 16px;">${prompt.slice(0,60)}...</div>
  `;
  grid.prepend(card);
}

function updateCard(id, imgSrc, prompt, fullPrompt) {
  const card = document.getElementById(id);
  if (!card) return;
  card.className = 'vx-card';
  card.style.minHeight = '';
  card.innerHTML = `
    <img src="${imgSrc}" alt="${prompt}" loading="lazy"/>
    <div class="vx-card-info">
      <div class="vx-card-prompt">${prompt.slice(0,100)}${prompt.length>100?'...':''}</div>
      <div class="vx-card-actions">
        <button class="vx-btn" onclick="downloadImage('${id}','${encodeURIComponent(prompt.slice(0,30))}')">⬇ Download</button>
        <button class="vx-btn" onclick="regenerateImage('${id}','${encodeURIComponent(prompt)}')">↺ Regenerate</button>
        <button class="vx-btn" onclick="sendToChat('${encodeURIComponent(fullPrompt)}')">💬 Refine</button>
      </div>
    </div>
  `;
  // Store src for download
  card._imgSrc = imgSrc;
}

function removeCard(id) {
  document.getElementById(id)?.remove();
}

function downloadImage(cardId, name) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const img = card.querySelector('img');
  if (!img) return;
  const a = document.createElement('a');
  a.href = img.src;
  a.download = `nexus_${decodeURIComponent(name)}_${Date.now()}.jpg`;
  a.click();
}

function regenerateImage(cardId, encodedPrompt) {
  const prompt = decodeURIComponent(encodedPrompt);
  removeCard(cardId);
  generateImage(prompt, currentStyle);
}

function sendToChat(encodedPrompt) {
  switchModel('visualex');
  document.getElementById('msgInput').value = 'Refine this: ' + decodeURIComponent(encodedPrompt).slice(0,100);
  document.getElementById('msgInput').focus();
}

// ============================================
// PROCESS AI RESPONSE FOR IMAGE COMMANDS
// ============================================
async function processVisualexResponse(aiText, userPrompt) {
  const genMatch = aiText.match(/\[GENERATE_IMAGE:\s*([\s\S]+?)\]/);
  const arabicMatch = aiText.match(/\[ARABIC_TEXT:\s*(.+?)\]/);

  if (genMatch) {
    const imagePrompt = genMatch[1].trim();
    const arabicText = arabicMatch ? arabicMatch[1].trim() : null;

    // Switch to Visualex panel
    showVisualexPanel();

    await generateImage(imagePrompt, currentStyle, arabicText);
  }

  // Return cleaned text (remove the command tags)
  return aiText
    .replace(/\[GENERATE_IMAGE:[\s\S]+?\]/g, '')
    .replace(/\[ARABIC_TEXT:.+?\]/g, '')
    .trim();
}

function showVisualexPanel() {
  document.getElementById('visualexPanel').classList.remove('hidden');
  document.getElementById('chatPanel').classList.add('hidden');
}

function showChatPanel() {
  document.getElementById('chatPanel').classList.remove('hidden');
  document.getElementById('visualexPanel').classList.add('hidden');
}

// Batch generation support
async function generateBatch(prompts, style) {
  for (const prompt of prompts) {
    await generateImage(prompt, style);
    await new Promise(r => setTimeout(r, 500)); // Stagger requests
  }
}
