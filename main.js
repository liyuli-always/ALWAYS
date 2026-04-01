import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

// ===== Provider Definitions =====
const PROVIDERS = {
  gemini: {
    name: 'Google Gemini',
    keyPlaceholder: 'AIza...',
    keyHint: 'Google AI StudioでAPIキーを取得できます。',
    keyLink: 'https://aistudio.google.com/apikey',
    models: [
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
      { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
    ],
    defaultModel: 'gemini-3-flash-preview',
    format: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  openai: {
    name: 'OpenAI',
    keyPlaceholder: 'sk-...',
    keyHint: 'OpenAIのダッシュボードでAPIキーを取得できます。',
    keyLink: 'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
      { value: 'gpt-5.4', label: 'GPT-5.4' },
      { value: 'gpt-4o', label: 'GPT-4o' },
    ],
    defaultModel: 'gpt-5.4-mini',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
  },
  xai: {
    name: 'xAI (Grok)',
    keyPlaceholder: 'xai-...',
    keyHint: 'xAIコンソールでAPIキーを取得できます。',
    keyLink: 'https://console.x.ai/',
    models: [
      { value: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast (Thinking)' },
      { value: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast (Standard)' },
      { value: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 (Thinking)' },
    ],
    defaultModel: 'grok-4-1-fast-reasoning',
    format: 'openai',
    baseUrl: 'https://api.x.ai/v1',
  },
};

// ===== Constants =====
const STORAGE_KEYS = {
  PROVIDER: 'chatroom_provider',
  API_KEY_PREFIX: 'chatroom_api_key_',  // per-provider: chatroom_api_key_gemini, etc.
  MODEL: 'chatroom_model',
  SYSTEM_PROMPT: 'chatroom_system_prompt',
  CONVERSATION: 'chatroom_conversation',
};

// ===== State =====
let conversationHistory = []; // Array of {role, parts: [{text}]}
let isStreaming = false;
let currentAbortController = null;

// ===== DOM Elements =====
const inputField = document.getElementById('inputField');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messages');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsClose = document.getElementById('settingsClose');
const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyLabel = document.getElementById('apiKeyLabel');
const apiKeyHint = document.getElementById('apiKeyHint');
const apiKeyToggle = document.getElementById('apiKeyToggle');
const modelSelect = document.getElementById('modelSelect');
const systemPromptInput = document.getElementById('systemPromptInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const connectionDot = document.getElementById('connectionDot');
const statusText = document.getElementById('statusText');
const toastEl = document.getElementById('toast');

// ===== Provider UI Helpers =====
function getCurrentProvider() {
  return localStorage.getItem(STORAGE_KEYS.PROVIDER) || 'gemini';
}

function getProviderConfig(providerId) {
  return PROVIDERS[providerId] || PROVIDERS.gemini;
}

function updateProviderUI(providerId) {
  const config = getProviderConfig(providerId);

  // Update API key field
  apiKeyInput.placeholder = config.keyPlaceholder;
  apiKeyLabel.textContent = config.name + ' API Key';
  apiKeyHint.innerHTML = config.keyHint + '<br>キーはこのブラウザのlocalStorageに保存されます。';

  // Load this provider's saved key
  apiKeyInput.value = localStorage.getItem(STORAGE_KEYS.API_KEY_PREFIX + providerId) || '';

  // Update model dropdown
  modelSelect.innerHTML = '';
  config.models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });

  // Restore saved model for this provider, or use default
  const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL);
  const savedProvider = localStorage.getItem(STORAGE_KEYS.PROVIDER);
  if (savedProvider === providerId && savedModel && config.models.some(m => m.value === savedModel)) {
    modelSelect.value = savedModel;
  } else {
    modelSelect.value = config.defaultModel;
  }
}

// Provider change handler
providerSelect.addEventListener('change', () => {
  updateProviderUI(providerSelect.value);
});

// ===== Floating Particles =====
(function createParticles() {
  const layer = document.getElementById('particleLayer');
  const count = 12;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 4 + 2;
    p.style.width = size + 'px';
    p.style.height = size + 'px';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (Math.random() * 20 + 15) + 's';
    p.style.animationDelay = (Math.random() * 20) + 's';
    layer.appendChild(p);
  }
})();

// ===== Date Display =====
(function setDate() {
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('dateDivider').textContent = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  document.getElementById('welcomeTime').textContent = formatTime(now);
})();

// ===== Utility Functions =====
function formatTime(date) {
  return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.className = 'toast ' + type;
  requestAnimationFrame(() => {
    toastEl.classList.add('show');
  });
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2500);
}

// ===== Settings Panel =====
function openSettings() {
  // Load saved values
  const savedProvider = getCurrentProvider();
  providerSelect.value = savedProvider;
  updateProviderUI(savedProvider);
  systemPromptInput.value = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) || '';

  settingsOverlay.classList.add('open');
  settingsPanel.classList.add('open');
}

function closeSettings() {
  settingsOverlay.classList.remove('open');
  settingsPanel.classList.remove('open');
}

function saveSettings() {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const systemPrompt = systemPromptInput.value;

  localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
  localStorage.setItem(STORAGE_KEYS.API_KEY_PREFIX + provider, apiKey);
  localStorage.setItem(STORAGE_KEYS.MODEL, model);
  localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, systemPrompt);

  updateConnectionStatus();
  closeSettings();
  showToast('設定を保存しました');
}

function updateConnectionStatus() {
  const provider = getCurrentProvider();
  const config = getProviderConfig(provider);
  const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY_PREFIX + provider);
  if (apiKey && apiKey.length > 0) {
    connectionDot.className = 'connection-status connected';
    const model = localStorage.getItem(STORAGE_KEYS.MODEL) || config.defaultModel;
    // Find model label
    const modelInfo = config.models.find(m => m.value === model);
    statusText.textContent = modelInfo ? modelInfo.label : model;
  } else {
    connectionDot.className = 'connection-status disconnected';
    statusText.textContent = 'API未接続';
  }
}

// Toggle API key visibility
apiKeyToggle.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  apiKeyToggle.textContent = isPassword ? '◉' : '👁';
});

settingsBtn.addEventListener('click', openSettings);
settingsOverlay.addEventListener('click', closeSettings);
settingsClose.addEventListener('click', closeSettings);
saveSettingsBtn.addEventListener('click', saveSettings);

// Auto-save system prompt on input
systemPromptInput.addEventListener('input', () => {
  localStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, systemPromptInput.value);
});

// ===== Conversation History Management =====
function saveConversation() {
  localStorage.setItem(STORAGE_KEYS.CONVERSATION, JSON.stringify(conversationHistory));
}

function loadConversation() {
  const saved = localStorage.getItem(STORAGE_KEYS.CONVERSATION);
  if (saved) {
    try {
      conversationHistory = JSON.parse(saved);
      // Re-render messages
      conversationHistory.forEach((msg, idx) => {
        const div = document.createElement('div');
        const isUser = msg.role === 'user';
        div.className = 'message ' + (isUser ? 'sent' : 'received');
        div.style.animationDelay = '0s';
        const text = msg._text || (msg.parts ? msg.parts[0].text : '');
        const timeStr = msg._time || '';
        div.innerHTML = `<p>${escapeHtml(text).replace(/\\n/g, '<br>')}</p><span class="time">${timeStr}</span>`;
        messagesContainer.appendChild(div);
      });
      scrollToBottom();
    } catch (e) {
      conversationHistory = [];
    }
  }
}

function clearConversation() {
  conversationHistory = [];
  localStorage.removeItem(STORAGE_KEYS.CONVERSATION);
  // Remove all messages except date divider and welcome
  const children = Array.from(messagesContainer.children);
  children.forEach((child, idx) => {
    if (idx > 1) child.remove(); // Keep date divider (0) and welcome (1)
  });
  showToast('会話履歴をクリアしました');
}

clearHistoryBtn.addEventListener('click', () => {
  clearConversation();
  closeSettings();
});

clearChatBtn.addEventListener('click', () => {
  if (conversationHistory.length === 0) return;
  clearConversation();
});

// ===== Typing Indicator =====
function showTypingIndicator() {
  const existing = document.querySelector('.typing-indicator');
  if (existing) return;
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  messagesContainer.appendChild(indicator);
  scrollToBottom();
}

function removeTypingIndicator() {
  const indicator = document.querySelector('.typing-indicator');
  if (indicator) indicator.remove();
}

// ===== Textarea Auto-resize =====
inputField.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  sendBtn.classList.toggle('active', this.value.trim().length > 0);
});

// ===== API Call (Multi-Provider) =====
async function callAPI(userMessage) {
  const provider = getCurrentProvider();
  const config = getProviderConfig(provider);
  const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY_PREFIX + provider);
  const model = localStorage.getItem(STORAGE_KEYS.MODEL) || config.defaultModel;
  const systemPrompt = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) || '';

  if (!apiKey) {
    return { error: 'APIキーが設定されていません。⚙ 設定画面からキーを入力してください。' };
  }

  currentAbortController = new AbortController();

  try {
    if (config.format === 'gemini') {
      return await callGeminiAPI(apiKey, model, systemPrompt, config);
    } else {
      return await callOpenAICompatibleAPI(apiKey, model, systemPrompt, config);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: null, aborted: true };
    }
    return { error: `接続エラー: ${err.message}` };
  } finally {
    currentAbortController = null;
  }
}

// --- Gemini format ---
async function callGeminiAPI(apiKey, model, systemPrompt, config) {
  const ai = new GoogleGenAI({ apiKey });

  const contents = conversationHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: msg.parts || [{ text: msg._text || '' }],
  }));

  const requestOptions = {
    model: model,
    contents: contents,
    config: {
      temperature: 0.9,
      topP: 0.95,
      topK: 40,
    }
  };

  if (systemPrompt.trim()) {
    requestOptions.config.systemInstruction = systemPrompt;
  }

  try {
    const response = await ai.models.generateContent(requestOptions);
    const text = response.text;
    if (!text) return { error: '応答が空でした。もう一度お試しください。' };
    return { text };
  } catch (err) {
    return { error: `API Error: ${err.message}` };
  }
}

// --- OpenAI-compatible format (OpenAI, xAI/Grok) ---
async function callOpenAICompatibleAPI(apiKey, model, systemPrompt, config) {
  const isXai = config.format === 'openai' && config.name.includes('xAI');
  const openaiArgs = { 
    apiKey: apiKey,
    dangerouslyAllowBrowser: true
  };
  
  if (isXai) {
    openaiArgs.baseURL = config.baseUrl;
  }
  
  const openai = new OpenAI(openaiArgs);

  const messages = [];
  if (systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  conversationHistory.forEach(msg => {
    messages.push({
      role: msg.role === 'model' ? 'assistant' : msg.role,
      content: msg._text || (msg.parts ? msg.parts[0].text : ''),
    });
  });

  try {
    const requestPayload = {
      model: model,
      messages: messages,
      temperature: 0.9,
      top_p: 0.95,
    };

    if (isXai) {
      requestPayload.max_tokens = 2048;
    } else {
      requestPayload.max_completion_tokens = 2048;
    }

    const response = await openai.chat.completions.create(
      requestPayload,
      { signal: currentAbortController.signal }
    );

    const text = response.choices?.[0]?.message?.content;
    if (!text) return { error: '応答が空でした。もう一度お試しください。' };
    return { text };
  } catch (err) {
    let errMsg = err.message;
    if (errMsg.toLowerCase().includes('model not found') || errMsg.toLowerCase().includes('does not exist')) {
      try {
        const modelsRes = await fetch(config.baseUrl + '/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          if (modelsData && modelsData.data) {
            const list = modelsData.data.map(m => m.id).join(', ');
            errMsg += `\n\n💡 現在このキーで使えるモデル一覧:\n${list}`;
          }
        }
      } catch (e) {}
    }
    return { error: `API Error: ${errMsg}` };
  }
}

// ===== Send Message =====
async function sendMessage() {
  const text = inputField.value.trim();
  if (!text || isStreaming) return;

  isStreaming = true;
  const now = new Date();
  const timeStr = formatTime(now);

  // Add user message to DOM
  const userMsg = document.createElement('div');
  userMsg.className = 'message sent';
  userMsg.innerHTML = `<p>${escapeHtml(text).replace(/\\n/g, '<br>')}</p><span class="time">${timeStr}</span>`;
  messagesContainer.appendChild(userMsg);

  // Add to history (store in normalized format)
  conversationHistory.push({
    role: 'user',
    parts: [{ text }],
    _text: text,
    _time: timeStr,
  });

  inputField.value = '';
  inputField.style.height = 'auto';
  sendBtn.classList.remove('active');
  scrollToBottom();

  // Show typing indicator
  setTimeout(() => showTypingIndicator(), 300);

  // Call API
  const result = await callAPI(text);

  removeTypingIndicator();

  const replyTime = formatTime(new Date());

  if (result.aborted) {
    isStreaming = false;
    return;
  }

  if (result.error) {
    // Show error as system message
    const errMsg = document.createElement('div');
    errMsg.className = 'message received error';
    errMsg.innerHTML = `<p>${escapeHtml(result.error).replace(/\\n/g, '<br>')}</p><span class="time">${replyTime}</span>`;
    messagesContainer.appendChild(errMsg);
    scrollToBottom();
    isStreaming = false;
    return;
  }

  // Add AI reply to DOM
  const aiMsg = document.createElement('div');
  aiMsg.className = 'message received';
  aiMsg.innerHTML = `<p>${escapeHtml(result.text).replace(/\\n/g, '<br>')}</p><span class="time">${replyTime}</span>`;
  messagesContainer.appendChild(aiMsg);

  // Add to history (use 'model' role for Gemini compat, normalized with _text)
  conversationHistory.push({
    role: 'model',
    parts: [{ text: result.text }],
    _text: result.text,
    _time: replyTime,
  });

  saveConversation();
  scrollToBottom();
  isStreaming = false;
}

// ===== Event Listeners =====
sendBtn.addEventListener('click', sendMessage);

inputField.addEventListener('keydown', function (e) {
  // IME入力中（漢字変換中）のEnterは何もしない
  if (e.isComposing) return;
  
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ===== Init =====
window.addEventListener('load', () => {
  // Initialize model select for current provider
  const currentProvider = getCurrentProvider();
  updateProviderUI(currentProvider);
  updateConnectionStatus();
  loadConversation();
  
  // Load system prompt so it's ready on page load
  systemPromptInput.value = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPT) || '';
  
  setTimeout(scrollToBottom, 600);
});
