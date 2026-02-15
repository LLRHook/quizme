// QuizMe popup logic

let currentView = 'setup';
let settings = null;
let quiz = null;
let currentQuestion = 0;
let userAnswers = [];

// DOM references
const views = {
  setup: document.getElementById('setup-view'),
  ready: document.getElementById('ready-view'),
  loading: document.getElementById('loading-view'),
  quiz: document.getElementById('quiz-view'),
  results: document.getElementById('results-view'),
  error: document.getElementById('error-view'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindEvents();
  await restoreSession();
}

function bindEvents() {
  document.getElementById('open-settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-gear').addEventListener('click', openSettings);
  document.getElementById('quiz-me-btn').addEventListener('click', startQuiz);
  document.getElementById('next-btn').addEventListener('click', nextQuestion);
  document.getElementById('redo-btn').addEventListener('click', redoQuiz);
  document.getElementById('new-quiz-btn').addEventListener('click', startQuiz);
  document.getElementById('close-btn').addEventListener('click', closeQuiz);
  document.getElementById('try-again-btn').addEventListener('click', startQuiz);
  document.getElementById('error-settings-btn').addEventListener('click', openSettings);
}

// Restore full state from storage on every popup open
async function restoreSession() {
  try {
    const data = await chrome.storage.local.get([
      'provider', 'ollamaBaseUrl', 'ollamaModel',
      'openaiKey', 'openaiModel',
      'anthropicKey', 'anthropicModel',
      'difficulty', 'maxQuestions',
      'quizState', 'quizData', 'quizCurrentQuestion', 'quizUserAnswers', 'quizError',
      'quizExplanations',
    ]);
    settings = data;

    const state = data.quizState || 'idle';

    switch (state) {
      case 'generating':
        showView('loading');
        document.getElementById('loading-text').textContent = 'Generating quiz...';
        pollForQuizReady();
        break;

      case 'ready':
        quiz = data.quizData;
        currentQuestion = 0;
        userAnswers = [];
        // Mark as in_progress now that they're viewing it
        saveProgress('in_progress', 0, []);
        showQuizView();
        break;

      case 'in_progress':
        quiz = data.quizData;
        currentQuestion = data.quizCurrentQuestion || 0;
        userAnswers = data.quizUserAnswers || [];
        if (quiz && quiz.questions) {
          showQuizView();
        } else {
          showReadyOrSetup(data);
        }
        break;

      case 'completed':
        quiz = data.quizData;
        userAnswers = data.quizUserAnswers || [];
        if (quiz && quiz.questions) {
          showResults();
        } else {
          showReadyOrSetup(data);
        }
        break;

      case 'error':
        showError(data.quizError || 'Something went wrong');
        break;

      default:
        showReadyOrSetup(data);
        break;
    }
  } catch (err) {
    showView('setup');
  }
}

function showReadyOrSetup(data) {
  if (isConfigured(data)) {
    updateProviderInfo(data);
    showView('ready');
  } else {
    showView('setup');
  }
}

function isConfigured(data) {
  if (!data.provider) return false;
  if (data.provider === 'ollama') return true;
  if (data.provider === 'openai') return !!data.openaiKey;
  if (data.provider === 'anthropic') return !!data.anthropicKey;
  return false;
}

function updateProviderInfo(data) {
  const providerNames = { ollama: 'Ollama', openai: 'OpenAI', anthropic: 'Anthropic' };
  const modelMap = {
    ollama: data.ollamaModel || 'llama3',
    openai: data.openaiModel || 'gpt-4o-mini',
    anthropic: data.anthropicModel || 'claude-sonnet-4-5-20250929',
  };
  const name = providerNames[data.provider] || data.provider;
  const model = modelMap[data.provider] || '';
  document.getElementById('provider-info').textContent = `Using: ${name} (${model})`;
}

function showView(name) {
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle('hidden', key !== name);
  }
  currentView = name;
}

function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Poll storage while waiting for background to finish generating
function pollForQuizReady() {
  const interval = setInterval(async () => {
    const data = await chrome.storage.local.get(['quizState', 'quizData', 'quizError']);

    if (data.quizState === 'ready') {
      clearInterval(interval);
      quiz = data.quizData;
      currentQuestion = 0;
      userAnswers = [];
      saveProgress('in_progress', 0, []);
      showQuizView();
    } else if (data.quizState === 'error') {
      clearInterval(interval);
      showError(data.quizError || 'Quiz generation failed');
    }
    // If still 'generating', keep polling
  }, 1000);
}

function startQuiz() {
  showView('loading');
  const loadingText = document.getElementById('loading-text');
  loadingText.textContent = 'Reading page content...';

  chrome.runtime.sendMessage({ action: 'generateQuiz' }, (response) => {
    if (chrome.runtime.lastError) {
      showError(chrome.runtime.lastError.message || 'Failed to connect to background service');
      return;
    }

    if (response && response.success) {
      // Background accepted the request and is generating
      loadingText.textContent = 'Generating quiz...';
      pollForQuizReady();
    } else {
      showError((response && response.error) || 'Failed to generate quiz');
    }
  });
}

function showQuizView() {
  showView('quiz');
  renderQuestion();
}

function renderQuestion() {
  const q = quiz.questions[currentQuestion];
  const total = quiz.questions.length;
  const letters = ['A', 'B', 'C', 'D'];

  const progress = ((currentQuestion) / total) * 100;
  document.getElementById('progress-bar').style.width = `${progress}%`;
  document.getElementById('question-counter').textContent = `Question ${currentQuestion + 1} of ${total}`;

  document.getElementById('question-text').textContent = q.question;

  const container = document.getElementById('options-container');
  container.innerHTML = '';

  q.options.forEach((option, i) => {
    const card = document.createElement('button');
    card.className = 'option-card';
    // Restore selection if user already answered this question
    if (userAnswers[currentQuestion] === i) {
      card.classList.add('selected');
    }
    card.innerHTML = `
      <span class="option-letter">${letters[i]}</span>
      <span class="option-text">${option}</span>
    `;
    card.addEventListener('click', () => selectOption(i));
    container.appendChild(card);
  });

  const nextBtn = document.getElementById('next-btn');
  nextBtn.disabled = userAnswers[currentQuestion] === undefined;
  nextBtn.textContent = currentQuestion === total - 1 ? 'Finish' : 'Next';
}

function selectOption(index) {
  userAnswers[currentQuestion] = index;

  const cards = document.querySelectorAll('.option-card');
  cards.forEach((card, i) => {
    card.classList.toggle('selected', i === index);
  });

  document.getElementById('next-btn').disabled = false;

  // Persist progress
  saveProgress('in_progress', currentQuestion, [...userAnswers]);
}

function nextQuestion() {
  if (userAnswers[currentQuestion] === undefined) return;

  if (currentQuestion < quiz.questions.length - 1) {
    currentQuestion++;
    saveProgress('in_progress', currentQuestion, [...userAnswers]);
    renderQuestion();
  } else {
    saveProgress('completed', currentQuestion, [...userAnswers]);
    showResults();
  }
}

async function showResults() {
  const total = quiz.questions.length;
  let correct = 0;

  quiz.questions.forEach((q, i) => {
    if (userAnswers[i] === q.correctIndex) {
      correct++;
    }
  });

  const percent = Math.round((correct / total) * 100);

  document.getElementById('score-text').textContent = `${correct}/${total}`;
  document.getElementById('score-percent').textContent = `${percent}%`;

  const circle = document.getElementById('score-circle');
  circle.className = 'score-circle';
  if (percent >= 80) {
    // default green styling
  } else if (percent >= 60) {
    circle.classList.add('score-warning');
  } else {
    circle.classList.add('score-error');
  }

  // Fetch detailed explanations from storage (may still be generating)
  let detailedExplanations = null;
  try {
    const stored = await chrome.storage.local.get('quizExplanations');
    detailedExplanations = stored.quizExplanations;
  } catch { /* use fallback */ }

  const list = document.getElementById('results-list');
  list.innerHTML = '';

  quiz.questions.forEach((q, i) => {
    const isCorrect = userAnswers[i] === q.correctIndex;
    const item = document.createElement('div');
    item.className = `result-item ${isCorrect ? 'result-correct' : 'result-incorrect'}`;

    // Show answer comparison for wrong answers
    let answerHtml = '';
    if (!isCorrect) {
      answerHtml = `
        <div class="result-detail">
          <span class="your-answer">Your answer: ${q.options[userAnswers[i]] || 'No answer'}</span><br>
          <span class="correct-answer">Correct: ${q.options[q.correctIndex]}</span>
        </div>
      `;
    } else {
      answerHtml = `
        <div class="result-detail">
          <span class="correct-answer">Correct: ${q.options[q.correctIndex]}</span>
        </div>
      `;
    }

    // Use detailed explanation if available, fall back to brief one
    const explanation = (detailedExplanations && detailedExplanations[i]) || q.explanation || '';
    const explanationHtml = explanation
      ? `<div class="result-explanation">${explanation}</div>`
      : '';

    item.innerHTML = `
      <div class="result-item-header">
        <span class="result-icon">${isCorrect ? '\u2705' : '\u274C'}</span>
        <span class="result-question">${q.question}</span>
      </div>
      ${answerHtml}
      ${explanationHtml}
    `;

    list.appendChild(item);
  });

  document.getElementById('progress-bar').style.width = '100%';
  showView('results');
}

function redoQuiz() {
  currentQuestion = 0;
  userAnswers = [];
  saveProgress('in_progress', 0, []);
  showQuizView();
}

function closeQuiz() {
  // Clear quiz session so next open shows ready view
  chrome.runtime.sendMessage({ action: 'clearQuiz' }, () => {
    window.close();
  });
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showView('error');
}

function saveProgress(state, question, answers) {
  chrome.runtime.sendMessage({
    action: 'saveProgress',
    state,
    currentQuestion: question,
    userAnswers: answers,
  });
}
