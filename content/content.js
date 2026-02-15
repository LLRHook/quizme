const NOISE_SELECTORS = [
  'nav', 'header', 'footer', 'aside',
  'iframe', 'script', 'style', 'noscript', 'svg',
];

const NOISE_CLASS_PATTERNS = /\b(ad|ads|advertisement|banner|sidebar|widget|nav|menu|footer|header|cookie|consent|popup|modal|social|share|comment)\b/i;

function isHiddenOrTiny(el) {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return true;

  const rect = el.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return true;

  return false;
}

function isNoiseElement(el) {
  if (NOISE_SELECTORS.includes(el.tagName.toLowerCase())) return true;

  const classAndId = `${el.className || ''} ${el.id || ''}`;
  if (NOISE_CLASS_PATTERNS.test(classAndId)) return true;

  return false;
}

function removeNoiseNodes(container) {
  const clone = container.cloneNode(true);

  // Remove noise elements by selector
  const noiseEls = clone.querySelectorAll(NOISE_SELECTORS.join(','));
  noiseEls.forEach(el => el.remove());

  // Remove elements matching noise class/id patterns
  clone.querySelectorAll('*').forEach(el => {
    const classAndId = `${el.className || ''} ${el.id || ''}`;
    if (typeof classAndId === 'string' && NOISE_CLASS_PATTERNS.test(classAndId)) {
      el.remove();
    }
  });

  return clone;
}

function findContentContainer() {
  const selectors = [
    'article',
    'main',
    '[role="main"]',
    '.content',
    '.post',
    '.article',
    '.entry-content',
  ];

  let best = null;
  let bestScore = 0;

  for (const selector of selectors) {
    const candidates = document.querySelectorAll(selector);
    for (const el of candidates) {
      if (isHiddenOrTiny(el)) continue;
      const score = scoreElement(el);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
  }

  return best || document.body;
}

function scoreElement(el) {
  const text = el.innerText || '';
  const textLen = text.trim().length;
  const childCount = el.children.length || 1;
  return textLen / childCount;
}

function processText(rawText) {
  const lines = rawText.split('\n');

  const cleaned = lines
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 20);

  return cleaned.join('\n');
}

function extractText() {
  const container = findContentContainer();
  const cleaned = removeNoiseNodes(container);

  // Also remove hidden/tiny elements from the cleaned clone
  cleaned.querySelectorAll('*').forEach(el => {
    try {
      // Can't use getComputedStyle on cloned nodes not in DOM,
      // so we check inline styles and known hidden attributes
      const style = el.getAttribute('style') || '';
      if (style.includes('display:none') || style.includes('display: none') ||
          style.includes('visibility:hidden') || style.includes('visibility: hidden')) {
        el.remove();
      }
      if (el.hidden || el.getAttribute('aria-hidden') === 'true') {
        el.remove();
      }
    } catch {
      // Skip elements that can't be inspected
    }
  });

  const rawText = cleaned.innerText || '';
  const text = processText(rawText);
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

  return {
    text,
    wordCount,
    title: document.title,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'extractText') {
    try {
      const result = extractText();
      sendResponse({ success: true, data: result });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // keep channel open for async response
});
