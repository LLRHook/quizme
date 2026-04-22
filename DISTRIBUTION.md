# Distribution

QuizMe is packaged as an unpacked Manifest V3 Chrome extension. The repository does not require a Node build step.

## Preflight

```bash
python -m json.tool manifest.json >/dev/null
rm -rf dist
mkdir -p dist
cp -R manifest.json background content icons lib options popup dist/
```

Load `dist/` in `chrome://extensions` with Developer mode enabled and run through:

- Ollama local provider connection
- OpenAI or Anthropic provider connection with a throwaway test key
- Quiz generation on an article page
- Popup close/reopen while generation is running
- Options persistence after browser restart

## Chrome Web Store Checklist

- Confirm the extension name, description, version, and icons in `manifest.json`.
- Zip the contents of `dist/`, not the repository root.
- Include screenshots of the popup, settings page, and generated quiz review state.
- Explain remote code/API usage in the privacy disclosure: page text is sent only to the provider selected by the user.
- Do not include API keys, `.pem` signing keys, or local browser profiles in the package.
