# QuizMe

A Chrome extension that generates interactive multiple-choice quizzes from any web page using AI.

## How It Works

1. Navigate to any article or content-rich web page
2. Click the QuizMe extension icon
3. Hit "Quiz Me!" to generate a quiz from the page content
4. Answer questions, get scored, and review explanations

The extension extracts readable text from the page, sends it to an LLM, and builds an interactive quiz right in the popup.

## Supported LLM Providers

| Provider | Type | Models |
|----------|------|--------|
| **Ollama** | Local | Any model you have installed |
| **OpenAI** | Cloud | GPT-4o, GPT-4o Mini, GPT-4 Turbo |
| **Anthropic** | Cloud | Claude Sonnet 4.5, Claude Haiku 4.5 |

## Setup

1. Clone or download this repo
2. Go to `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select this directory
4. Click the QuizMe icon in your toolbar, then open **Settings** to configure your LLM provider

### Ollama (local, free)

1. [Install Ollama](https://ollama.com)
2. Pull a model: `ollama pull llama3`
3. In QuizMe settings, select **Local (Ollama)** and pick your model

### OpenAI / Anthropic (cloud)

1. In QuizMe settings, select the provider tab
2. Enter your API key
3. Choose a model
4. Click **Test Connection** to verify

## Quiz Settings

- **Difficulty**: Easy, Medium, or Hard
- **Max Questions**: 3 to 15 per quiz

## Features

- Quiz generation runs in the background -- close and reopen the popup without losing progress
- Desktop notification when your quiz is ready
- Score tracking with per-question review and explanations
- Session persistence across popup closes
- Smart content extraction that filters out ads, navigation, and boilerplate

## Project Structure

```
manifest.json          # Extension config (Manifest V3)
background/
  background.js        # Service worker: quiz lifecycle and LLM orchestration
content/
  content.js           # Content script: page text extraction
lib/
  llm.js               # LLM provider abstraction (Ollama, OpenAI, Anthropic)
popup/
  popup.html/js/css     # Main quiz UI
options/
  options.html/js/css   # Settings page
icons/
  icon{16,48,128}.png  # Extension icons
```
