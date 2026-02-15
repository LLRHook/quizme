const DEFAULTS = {
  provider: 'ollama',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: '',
  openaiKey: '',
  openaiModel: 'gpt-4o-mini',
  anthropicKey: '',
  anthropicModel: 'claude-sonnet-4-5-20250929',
  difficulty: 'medium',
  maxQuestions: 5,
};

const elements = {
  providerTabs: document.querySelectorAll('.provider-tab'),
  ollamaSettings: document.getElementById('ollama-settings'),
  openaiSettings: document.getElementById('openai-settings'),
  anthropicSettings: document.getElementById('anthropic-settings'),
  ollamaUrl: document.getElementById('ollama-url'),
  ollamaModel: document.getElementById('ollama-model'),
  ollamaModelStatus: document.getElementById('ollama-model-status'),
  openaiKey: document.getElementById('openai-key'),
  openaiModel: document.getElementById('openai-model'),
  anthropicKey: document.getElementById('anthropic-key'),
  anthropicModel: document.getElementById('anthropic-model'),
  maxQuestions: document.getElementById('max-questions'),
  maxQuestionsValue: document.getElementById('max-questions-value'),
  saveBtn: document.getElementById('save-btn'),
  statusMessage: document.getElementById('status-message'),
  testResult: document.getElementById('test-result'),
  testOllama: document.getElementById('test-ollama'),
  testOpenai: document.getElementById('test-openai'),
  testAnthropic: document.getElementById('test-anthropic'),
};

let activeProvider = 'ollama';

function showProviderSettings(provider) {
  activeProvider = provider;

  elements.providerTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.provider === provider);
  });

  elements.ollamaSettings.classList.toggle('hidden', provider !== 'ollama');
  elements.openaiSettings.classList.toggle('hidden', provider !== 'openai');
  elements.anthropicSettings.classList.toggle('hidden', provider !== 'anthropic');

  elements.testResult.classList.add('hidden');

  if (provider === 'ollama') {
    fetchOllamaModels();
  }
}

function showStatus(message, type) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message ${type}`;
  elements.statusMessage.classList.remove('hidden');

  setTimeout(() => {
    elements.statusMessage.classList.add('hidden');
  }, 3000);
}

function showTestResult(message, type) {
  elements.testResult.textContent = message;
  elements.testResult.className = `test-result ${type}`;
  elements.testResult.classList.remove('hidden');
}

async function fetchOllamaModels(selectedModel) {
  const baseUrl = elements.ollamaUrl.value.trim() || DEFAULTS.ollamaBaseUrl;
  const select = elements.ollamaModel;
  const status = elements.ollamaModelStatus;

  select.innerHTML = '<option value="" disabled selected>Loading models...</option>';
  select.disabled = true;
  status.textContent = '';

  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const models = (data.models || []).map(m => m.name);

    if (models.length === 0) {
      select.innerHTML = '<option value="" disabled selected>No models found</option>';
      status.textContent = '(none installed)';
      status.className = 'inline-status error';
      return;
    }

    select.innerHTML = '';
    models.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    select.disabled = false;

    // Restore previous selection if it exists in the list
    if (selectedModel && models.includes(selectedModel)) {
      select.value = selectedModel;
    } else {
      select.selectedIndex = 0;
    }

    status.textContent = `(${models.length} available)`;
    status.className = 'inline-status success';
  } catch (error) {
    select.innerHTML = '<option value="" disabled selected>Failed to connect</option>';
    status.textContent = '(offline)';
    status.className = 'inline-status error';
  }
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULTS);

  activeProvider = settings.provider;
  showProviderSettings(activeProvider);

  elements.ollamaUrl.value = settings.ollamaBaseUrl;
  elements.openaiKey.value = settings.openaiKey;
  elements.openaiModel.value = settings.openaiModel;
  elements.anthropicKey.value = settings.anthropicKey;
  elements.anthropicModel.value = settings.anthropicModel;
  elements.maxQuestions.value = settings.maxQuestions;
  elements.maxQuestionsValue.textContent = settings.maxQuestions;

  const difficultyRadio = document.querySelector(
    `input[name="difficulty"][value="${settings.difficulty}"]`
  );
  if (difficultyRadio) difficultyRadio.checked = true;

  // Fetch models and restore selection
  if (activeProvider === 'ollama') {
    fetchOllamaModels(settings.ollamaModel);
  }
}

async function saveSettings() {
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'medium';

  const settings = {
    provider: activeProvider,
    ollamaBaseUrl: elements.ollamaUrl.value.trim() || DEFAULTS.ollamaBaseUrl,
    ollamaModel: elements.ollamaModel.value || DEFAULTS.ollamaModel,
    openaiKey: elements.openaiKey.value.trim(),
    openaiModel: elements.openaiModel.value,
    anthropicKey: elements.anthropicKey.value.trim(),
    anthropicModel: elements.anthropicModel.value,
    difficulty,
    maxQuestions: parseInt(elements.maxQuestions.value, 10),
  };

  await chrome.storage.local.set(settings);
  showStatus('Settings saved', 'success');
}

async function testConnection() {
  showTestResult('Testing connection...', 'loading');

  await saveSettings();

  chrome.runtime.sendMessage({ action: 'testConnection' }, (response) => {
    if (chrome.runtime.lastError) {
      showTestResult(`Error: ${chrome.runtime.lastError.message}`, 'error');
      return;
    }
    if (response?.success && response.data?.success) {
      showTestResult(response.data.message, 'success');
    } else {
      const msg = response?.data?.message || response?.error || 'Connection failed';
      showTestResult(msg, 'error');
    }
  });
}

// Provider tab clicks
elements.providerTabs.forEach(tab => {
  tab.addEventListener('click', () => showProviderSettings(tab.dataset.provider));
});

// Refetch models when URL changes
let urlDebounce;
elements.ollamaUrl.addEventListener('input', () => {
  clearTimeout(urlDebounce);
  urlDebounce = setTimeout(() => fetchOllamaModels(), 500);
});

// Slider value display
elements.maxQuestions.addEventListener('input', () => {
  elements.maxQuestionsValue.textContent = elements.maxQuestions.value;
});

// Password visibility toggles
document.querySelectorAll('.toggle-visibility').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.target);
    const isPassword = target.type === 'password';
    target.type = isPassword ? 'text' : 'password';
    btn.querySelector('.eye-icon').classList.toggle('hidden', !isPassword);
    btn.querySelector('.eye-off-icon').classList.toggle('hidden', isPassword);
  });
});

// Save button
elements.saveBtn.addEventListener('click', saveSettings);

// Test connection buttons
elements.testOllama.addEventListener('click', testConnection);
elements.testOpenai.addEventListener('click', testConnection);
elements.testAnthropic.addEventListener('click', testConnection);

// Load on open
loadSettings();
