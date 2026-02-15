const QUIZ_PROMPT_TEMPLATE = `You are a quiz generator. Based on the following text, generate exactly {count} multiple choice questions that test understanding of the KEY CONCEPTS and IMPORTANT FACTS in the text.

IMPORTANT RULES:
- Focus ONLY on substantive, educational content
- IGNORE any advertisements, promotional content, navigation text, or irrelevant information
- Each question should have exactly 4 options (A, B, C, D)
- Only one correct answer per question
- Include a brief explanation for the correct answer
- Questions should test comprehension, not trivial details

Respond with ONLY a JSON object in this exact format:
{
  "questions": [
    {
      "question": "What is...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Brief explanation of why this is correct"
    }
  ]
}

TEXT TO QUIZ ON:
{text}`;

const SYSTEM_PROMPT = 'You are a quiz generator that creates multiple choice questions from text. Always respond with valid JSON only.';

function parseQuizJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    // Try extracting JSON from markdown code blocks
    const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim());
    }
    throw new Error('Failed to parse quiz response as JSON');
  }
}

function buildQuizPrompt(text, questionCount) {
  return QUIZ_PROMPT_TEMPLATE
    .replace('{count}', String(questionCount))
    .replace('{text}', text);
}

async function generateWithOllama(settings, prompt) {
  const baseUrl = settings.ollamaBaseUrl || 'http://localhost:11434';
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.ollamaModel,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Ollama request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.response;
}

async function generateWithOpenAI(settings, systemPrompt, userPrompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateWithAnthropic(settings, systemPrompt, userPrompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': settings.anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.anthropicModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Anthropic request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

const EXPLANATION_PROMPT_TEMPLATE = `You are an expert educator. For each of the following quiz questions, write a detailed explanation that helps the reader deeply understand the topic. Go beyond just stating the correct answer — explain the underlying concept, why the other options are wrong, and provide any helpful context from the source text.

QUESTIONS:
{questions}

SOURCE TEXT:
{text}

Respond with ONLY a JSON object in this exact format:
{
  "explanations": [
    "Detailed explanation for question 1...",
    "Detailed explanation for question 2...",
    ...
  ]
}`;

const EXPLANATION_SYSTEM_PROMPT = 'You are an expert educator that writes clear, detailed explanations. Always respond with valid JSON only.';

class LLMProvider {
  constructor(settings) {
    this.settings = settings;
    this.provider = settings.provider || 'ollama';
  }

  async generateQuiz(text, questionCount) {
    const prompt = buildQuizPrompt(text, questionCount);
    let raw;

    switch (this.provider) {
      case 'ollama':
        raw = await generateWithOllama(this.settings, prompt);
        break;
      case 'openai':
        raw = await generateWithOpenAI(this.settings, SYSTEM_PROMPT, prompt);
        break;
      case 'anthropic':
        raw = await generateWithAnthropic(this.settings, SYSTEM_PROMPT, prompt);
        break;
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }

    return parseQuizJSON(raw);
  }

  async generateExplanations(text, questions) {
    const questionsFormatted = questions.map((q, i) => {
      const letters = ['A', 'B', 'C', 'D'];
      const options = q.options.map((opt, j) => `  ${letters[j]}) ${opt}`).join('\n');
      return `${i + 1}. ${q.question}\n${options}\n   Correct: ${letters[q.correctIndex]}`;
    }).join('\n\n');

    const prompt = EXPLANATION_PROMPT_TEMPLATE
      .replace('{questions}', questionsFormatted)
      .replace('{text}', text);

    let raw;
    switch (this.provider) {
      case 'ollama':
        raw = await generateWithOllama(this.settings, prompt);
        break;
      case 'openai':
        raw = await generateWithOpenAI(this.settings, EXPLANATION_SYSTEM_PROMPT, prompt);
        break;
      case 'anthropic':
        raw = await generateWithAnthropic(this.settings, EXPLANATION_SYSTEM_PROMPT, prompt);
        break;
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }

    return parseQuizJSON(raw);
  }

  async testConnection() {
    try {
      switch (this.provider) {
        case 'ollama': {
          const baseUrl = this.settings.ollamaBaseUrl || 'http://localhost:11434';
          const response = await fetch(`${baseUrl}/api/tags`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          const modelNames = (data.models || []).map(m => m.name);
          return {
            success: true,
            message: `Connected to Ollama. Available models: ${modelNames.join(', ') || 'none'}`,
          };
        }
        case 'openai': {
          if (!this.settings.openaiKey) {
            return { success: false, message: 'OpenAI API key is not set' };
          }
          const response = await fetch('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${this.settings.openaiKey}` },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return { success: true, message: 'Connected to OpenAI successfully' };
        }
        case 'anthropic': {
          if (!this.settings.anthropicKey) {
            return { success: false, message: 'Anthropic API key is not set' };
          }
          // Anthropic doesn't have a lightweight endpoint, so send a minimal request
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': this.settings.anthropicKey,
              'anthropic-version': '2023-06-01',
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              model: this.settings.anthropicModel || 'claude-sonnet-4-5-20250929',
              max_tokens: 10,
              messages: [{ role: 'user', content: 'Hi' }],
            }),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return { success: true, message: 'Connected to Anthropic successfully' };
        }
        default:
          return { success: false, message: `Unknown provider: ${this.provider}` };
      }
    } catch (error) {
      return { success: false, message: `Connection failed: ${error.message}` };
    }
  }
}

export { LLMProvider };
export default LLMProvider;
