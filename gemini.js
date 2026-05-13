// ============================================
// NEXUS AI — Gemini API Integration
// ============================================

const GEMINI_MODELS = {
  fast: 'gemini-2.0-flash',
  think: 'gemini-2.0-flash-thinking-exp',
  deep: 'gemini-2.5-pro-preview-05-06',
};

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ============================================
// SYSTEM PROMPTS PER MODEL
// ============================================
function getSystemPrompt(model) {
  const base = buildBaseContext();

  const prompts = {
    aura: `You are Aura, an advanced AI assistant within the NEXUS AI platform. You are warm, highly intelligent, and adaptive.

${base}

Guidelines:
- Respond in the same language the user uses (Arabic, English, French, etc.)
- For Arabic: use formal Modern Standard Arabic or the user's dialect if detected
- Be conversational yet intelligent
- Format responses clearly with markdown when helpful
- Remember context from this conversation
- Never say you are Google's Gemini — you are Aura by NEXUS AI`,

    scriptor: `You are Scriptor, an elite coding AI within the NEXUS AI platform. You are a senior software engineer with deep expertise in all programming languages.

${base}

Guidelines:
- Write clean, production-ready, well-commented code
- Always explain what the code does
- Use best practices and modern syntax
- When fixing bugs, explain the root cause
- Structure complex projects with multiple files when needed
- Add error handling and edge case coverage
- Respond in the user's language (Arabic/English/etc.)
- Format ALL code in proper \`\`\`language\`\`\` blocks
- You can run HTML, JS, Python (simulated), and CSS directly
- Never say you are Google's Gemini — you are Scriptor by NEXUS AI`,

    visualex: `You are Visualex, an image generation and design AI within NEXUS AI. You help craft perfect image prompts and provide design guidance.

${base}

Guidelines:
- When asked to generate an image, respond with:
  1. A brief description of what you'll create
  2. An optimized prompt in this exact format: [GENERATE_IMAGE: your detailed English prompt here]
  3. If the user asked in Arabic, include Arabic text as: [ARABIC_TEXT: text] within the prompt block
- Make prompts highly detailed: lighting, style, mood, composition, camera settings
- For Arabic text in images: specify it clearly so rendering uses proper Arabic fonts
- Never say you are Google's Gemini — you are Visualex by NEXUS AI`,
  };

  return prompts[model] || prompts.aura;
}

function buildBaseContext() {
  const training = NEXUS.training;
  let ctx = '';

  if (training.knowledgeBase.length > 0) {
    ctx += `\n\nKnowledge Base (from user-uploaded documents):\n`;
    ctx += training.knowledgeBase.slice(-5).map(k => `- ${k.slice(0, 300)}`).join('\n');
  }

  if (training.chatSamples.length > 0) {
    ctx += `\n\nUser's Writing Style (learned from their chat exports):\n`;
    ctx += `The user tends to write: ${training.userStyle || 'casually and directly'}. `;
    if (training.wordFreq) {
      const topWords = Object.entries(training.wordFreq)
        .sort((a,b) => b[1]-a[1]).slice(0,10).map(w=>w[0]).join(', ');
      ctx += `Frequently used words: ${topWords}`;
    }
  }

  if (training.imageStyle) {
    ctx += `\n\nUser's preferred image style: ${training.imageStyle}`;
  }

  return ctx;
}

// ============================================
// GEMINI API CALL
// ============================================
async function callGemini(messages, model, mode) {
  const key = NEXUS.geminiKey;
  if (!key) {
    return '⚠️ No API key set. Go to ⚙ Settings and add your Gemini API key from [aistudio.google.com](https://aistudio.google.com).';
  }

  const geminiModel = GEMINI_MODELS[mode] || GEMINI_MODELS.think;
  const systemPrompt = getSystemPrompt(model);

  // Build conversation for Gemini format
  const contents = [];

  // Inject system as first user message (Gemini doesn't have system role in all versions)
  const historyMsgs = messages.slice(0, -1); // all but last
  const lastMsg = messages[messages.length - 1];

  // Add history
  for (const msg of historyMsgs) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  }

  // Last message with system context prepended if it's the first
  const userText = contents.length === 0
    ? `[System Instructions]\n${systemPrompt}\n\n[User Message]\n${lastMsg.content}`
    : lastMsg.content;

  contents.push({ role: 'user', parts: [{ text: userText }] });

  const config = {
    temperature: mode === 'fast' ? 0.7 : mode === 'think' ? 0.8 : 0.9,
    maxOutputTokens: mode === 'fast' ? 2048 : mode === 'think' ? 4096 : 8192,
    topP: 0.95,
    topK: 40,
  };

  const url = `${GEMINI_BASE}/${geminiModel}:generateContent?key=${key}`;

  const body = {
    contents,
    generationConfig: config,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ]
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errMsg = err?.error?.message || res.statusText;
      if (res.status === 400 && errMsg.includes('API_KEY')) {
        return '⚠️ Invalid API key. Please check your Gemini key in Settings.';
      }
      if (res.status === 429) {
        return '⚠️ Rate limit reached. Please wait a moment and try again, or switch to Fast mode.';
      }
      if (res.status === 404) {
        // Model might not be available, fallback to flash
        return await callGeminiFallback(contents, config, key);
      }
      return `⚠️ API Error: ${errMsg}`;
    }

    const data = await res.json();

    // Extract text from response
    const candidate = data.candidates?.[0];
    if (!candidate) return '⚠️ No response from model.';
    if (candidate.finishReason === 'SAFETY') return '⚠️ Response blocked by safety filter.';

    const parts = candidate.content?.parts || [];
    let text = '';
    for (const part of parts) {
      if (part.text) text += part.text;
    }

    // Auto-learn from this exchange
    learnFromExchange(lastMsg.content, text);

    return text || '⚠️ Empty response from model.';
  } catch (e) {
    if (e.name === 'TypeError' && e.message.includes('fetch')) {
      return '⚠️ Network error. Check your internet connection.';
    }
    return `⚠️ Error: ${e.message}`;
  }
}

async function callGeminiFallback(contents, config, key) {
  const url = `${GEMINI_BASE}/gemini-2.0-flash:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig: config }),
  });
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('') || '⚠️ No response.';
}

// ============================================
// AUTO-LEARNING FROM EXCHANGES
// ============================================
function learnFromExchange(userMsg, aiResponse) {
  // Track what topics user asks about
  const words = userMsg.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  words.forEach(w => {
    NEXUS.training.wordFreq[w] = (NEXUS.training.wordFreq[w] || 0) + 1;
  });

  // Detect Arabic usage
  if (isArabic(userMsg)) {
    NEXUS.training.userStyle = (NEXUS.training.userStyle || '') + '; prefers Arabic communication';
  }

  saveTraining();
}
