import { LLMProvider } from '../lib/llm.js';

// Quiz state keys in chrome.storage.local:
//   quizState: 'idle' | 'generating' | 'ready' | 'in_progress' | 'completed' | 'error'
//   quizData: { questions: [...] }
//   quizCurrentQuestion: number
//   quizUserAnswers: number[]
//   quizError: string | null
//   quizSourceText: string (kept for explanation generation)
//   quizExplanations: string[] | null (detailed explanations, generated in background)

async function getSettings() {
  return chrome.storage.local.get({
    provider: 'ollama',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3',
    openaiKey: '',
    openaiModel: 'gpt-4o-mini',
    anthropicKey: '',
    anthropicModel: 'claude-sonnet-4-5-20250929',
    maxQuestions: 15,
  });
}

async function getQuizSession() {
  return chrome.storage.local.get({
    quizState: 'idle',
    quizData: null,
    quizCurrentQuestion: 0,
    quizUserAnswers: [],
    quizError: null,
    quizSourceText: null,
    quizExplanations: null,
  });
}

async function setQuizSession(updates) {
  await chrome.storage.local.set(updates);
}

async function clearQuizSession() {
  await chrome.storage.local.set({
    quizState: 'idle',
    quizData: null,
    quizCurrentQuestion: 0,
    quizUserAnswers: [],
    quizError: null,
    quizSourceText: null,
    quizExplanations: null,
  });
}

function extractPageText() {
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
  ];

  let root = null;
  for (const selector of selectors) {
    root = document.querySelector(selector);
    if (root) break;
  }
  if (!root) {
    root = document.body;
  }

  const clone = root.cloneNode(true);

  const excluded = clone.querySelectorAll(
    'nav, header, footer, aside, script, style, noscript, iframe, svg, ' +
    '[role="navigation"], [role="banner"], [role="complementary"], [aria-hidden="true"], ' +
    '.ad, .ads, .advertisement, .sidebar, .nav, .menu, .footer, .header, .comments'
  );
  excluded.forEach(el => el.remove());

  const text = clone.innerText || '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;

  return { text: cleaned, wordCount };
}

async function handleGenerateQuiz(sendResponse) {
  try {
    // Extract text first (needs active tab, so must happen while popup may still be open)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      await setQuizSession({ quizState: 'error', quizError: 'No active tab found' });
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageText,
    });

    if (!result?.result) {
      await setQuizSession({ quizState: 'error', quizError: 'Failed to extract text from page' });
      sendResponse({ success: false, error: 'Failed to extract text from page' });
      return;
    }

    const { text, wordCount } = result.result;

    if (wordCount < 50) {
      await setQuizSession({ quizState: 'error', quizError: 'Not enough readable content on this page' });
      sendResponse({ success: false, error: 'Not enough readable content on this page' });
      return;
    }

    // Text extracted - mark as generating and respond immediately so popup knows
    await setQuizSession({
      quizState: 'generating',
      quizData: null,
      quizCurrentQuestion: 0,
      quizUserAnswers: [],
      quizError: null,
      quizSourceText: text,
      quizExplanations: null,
    });
    sendResponse({ success: true, data: { state: 'generating' } });

    // Now do the slow LLM call - popup can close, this keeps running
    const settings = await getSettings();
    const questionCount = Math.min(
      Math.max(Math.floor(wordCount / 150), 3),
      settings.maxQuestions || 15
    );

    const llm = new LLMProvider(settings);
    const quiz = await llm.generateQuiz(text, questionCount);

    await setQuizSession({
      quizState: 'ready',
      quizData: quiz,
      quizCurrentQuestion: 0,
      quizUserAnswers: [],
      quizError: null,
    });

    // Send notification
    chrome.notifications.create('quiz-ready', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'QuizMe',
      message: `Your quiz is ready! ${quiz.questions.length} questions generated.`,
    });

    // Generate detailed explanations in the background while user takes the quiz
    generateExplanationsInBackground(llm, text, quiz.questions);

  } catch (error) {
    console.error('QuizMe: generateQuiz failed:', error);
    await setQuizSession({ quizState: 'error', quizError: error.message });

    // Try to notify even on error
    chrome.notifications.create('quiz-error', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'QuizMe',
      message: `Quiz generation failed: ${error.message}`,
    });
  }
}

async function generateExplanationsInBackground(llm, text, questions) {
  try {
    const result = await llm.generateExplanations(text, questions);
    if (result && result.explanations && Array.isArray(result.explanations)) {
      await setQuizSession({ quizExplanations: result.explanations });
    }
  } catch (error) {
    // Non-critical - the brief explanations from the quiz still work as fallback
    console.warn('QuizMe: detailed explanation generation failed:', error);
  }
}

// Clicking the notification opens the popup
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'quiz-ready' || notificationId === 'quiz-error') {
    chrome.action.openPopup().catch(() => {
      // openPopup may not be supported in all contexts, that's fine
    });
  }
});

async function handleTestConnection(sendResponse) {
  try {
    const settings = await getSettings();
    const llm = new LLMProvider(settings);
    const result = await llm.testConnection();
    sendResponse({ success: true, data: result });
  } catch (error) {
    console.error('QuizMe: testConnection failed:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetQuizSession(sendResponse) {
  try {
    const session = await getQuizSession();
    sendResponse({ success: true, data: session });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSaveProgress(message, sendResponse) {
  try {
    const updates = {};
    if (message.currentQuestion !== undefined) updates.quizCurrentQuestion = message.currentQuestion;
    if (message.userAnswers !== undefined) updates.quizUserAnswers = message.userAnswers;
    if (message.state !== undefined) updates.quizState = message.state;
    await setQuizSession(updates);
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleClearQuiz(sendResponse) {
  try {
    await clearQuizSession();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.action) {
    case 'generateQuiz':
      handleGenerateQuiz(sendResponse);
      break;
    case 'testConnection':
      handleTestConnection(sendResponse);
      break;
    case 'getQuizSession':
      handleGetQuizSession(sendResponse);
      break;
    case 'saveProgress':
      handleSaveProgress(message, sendResponse);
      break;
    case 'clearQuiz':
      handleClearQuiz(sendResponse);
      break;
    default:
      sendResponse({ success: false, error: `Unknown action: ${message.action}` });
      return false;
  }
  return true;
});
