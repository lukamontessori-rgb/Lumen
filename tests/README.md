# Lumen's tests

End-to-end tests that drive the real page (`index.html`) in Chromium. They need no graphics chip and no internet:

- `fake-webllm.js` stands in for the AI engine. It uses the **real** WebLLM code to tell whether a model is saved and to delete it, and it reads the saved model files the same way WebLLM 0.2.85 does (Cache API, OPFS or IndexedDB), with the same "Tensor-cache record range … exceeds shard size" check. Its answers come from a few simple rules.
- `run.mjs` answers for Hugging Face (a small pretend model, with byte ranges), Wikipedia and every other site, and can cut connections, drop byte ranges, answer 404, or slow down.
- `server.mjs` serves the site and swaps in the pretend engine.

## Run them

```sh
npm install                  # Playwright (and docx, for one test)
npx playwright install chromium
npm test                     # all tests
node tests/run.mjs download  # only the tests whose name contains "download"
npm run shots                # screenshots of the main screens in tests/shots/
npm run serve -- --fake      # the site with the pretend engine at http://127.0.0.1:8000
```

## What they cover

The model download (every file checked, broken files repaired one by one, cut connections, pieces, no byte ranges, missing files, a full disk, a browser that damages saved files, offline and back, pause, switching models, no endless loops over reloads), the crash guard, the first-run setup and its model advice, the Claude-style composer (model picker, tools, styles, tags), projects, artifacts and the side panel, temporary chats, voice conversation, answers (stop, answer again, versions, edit, continue, quote, branch, shorter), study tools, essay feedback, files (text, CSV, Word, PDF, Excel, PowerPoint), memory, slash commands, fact check, ratings, settings, backup and restore, offline Wikipedia, "Delete all my data", Mermaid diagrams, the code runner, summaries, the Test lab, the calculator, units, dates, intents, Markdown safety, the source check, and a click-everything test on a desktop and a phone screen.
