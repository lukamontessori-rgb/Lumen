# vendor/: the libraries Lumen uses

These are unchanged copies of other people's open-source libraries. Lumen serves them from its own site, so no public content network (CDN) is used and no extra company sees a visitor's internet address. Every folder has its own licence file, and the two bundles (Mermaid and WebLLM) also have a `THIRD_PARTY_LICENSES.txt` for the smaller libraries inside them. The full notices are in `../THIRD_PARTY_NOTICES.md`.

| Folder | What it is | Where the copy comes from (npm package, file) | Licence |
|---|---|---|---|
| `marked-18.0.14/` | Markdown to HTML | `marked@18.0.14`, `lib/marked.umd.js` | MIT |
| `dompurify-3.4.16/` | Cleans HTML so it is safe | `dompurify@3.4.16`, `dist/purify.min.js` | Apache 2.0 or MPL 2.0 (Lumen uses it under Apache 2.0) |
| `katex-0.18.9/` | Draws maths | `katex@0.18.9`, `dist/katex.min.js`, `dist/katex.min.css`, `dist/fonts/*.woff2` | MIT |
| `highlight.js-11.12.0/` | Colours code | `@highlightjs/cdn-assets@11.12.0`, `highlight.min.js` | BSD-3-Clause |
| `pdfjs-dist-3.11.174/` | Reads PDF files (loaded when you add a PDF) | `pdfjs-dist@3.11.174`, `build/pdf.min.js`, `build/pdf.worker.min.js` | Apache 2.0 |
| `mermaid-11.4.1/` | Draws diagrams (loaded when an answer has a diagram) | `mermaid@11.4.1`, `dist/mermaid.min.js` | MIT |
| `web-llm-0.2.85/` | The AI engine (WebLLM), loaded when you download or start a model | `@mlc-ai/web-llm@0.2.85`, `lib/index.js` | Apache 2.0 |

Only one file was changed on purpose: in `katex-0.18.9/katex.min.css` the old `.woff` and `.ttf` font addresses were removed, because every browser that can run Lumen reads the `.woff2` fonts that are in `katex-0.18.9/fonts/`. The `.js` files are byte for byte the files from the npm packages.

## How to update a library

1. Download the new version: `npm pack <package>@<version>` and unpack it.
2. Copy the same files into a new folder with the new version in its name, with the licence file.
3. Change the address in `index.html` (`src/page.html`), in `src/js/` (`WEBLLM_URL`, `PDFJS`, the Mermaid address) and in `sw.js`, then delete the old folder.
4. Update this table and `THIRD_PARTY_NOTICES.md`, then run the tests.

## What it costs

About 11 MB in the repository (the AI engine is 6.5 MB, Mermaid 2.6 MB, the PDF reader 1.4 MB, the rest 1 MB). The browser only fetches a library when it needs it: the five small ones at page start (about 0.5 MB), the others on first use. Files are sent compressed, so the real download is much smaller. The service worker keeps a copy of each file that was used (up to about 11 MB of browser storage), and "Delete all my data" removes it.
