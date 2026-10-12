# Changelog

One line per change: what changed, which file.

- 2026-10-12: The one-time "both versions are kept" tip now waits for another message to disappear instead of covering it (found by the full regression). `index.html`. The page cache name is now `lumen-shell-v12`. `sw.js`.
- 2026-10-12: Idea 3: Offline Wikipedia (`tools/build_wiki_pack.py` makes one pack file from a Wikipedia dump; Lumen imports it into its own database with progress, stop and safety checks, searches it with a word index kept on disk, uses it first / only / not at all, notes the copy date for the AI, credits CC BY-SA 4.0, warns on copied passages; settings and privacy rows). `index.html`, `tools/build_wiki_pack.py`.
- 2026-10-12: Idea 28: Dictation (off by default; private on-device mode when the browser offers it, online mode only after a clear yes; text goes into the box, never auto-sent; line above the box says where the voice goes). `index.html`.
- 2026-10-12: Ideas 31, 36 and 32: Test lab (`/lab`: model comparison, quick check, prompt and example A/B, voting test, speed; scored by code at temperature 0; baselines per model; survives reloads and out-of-memory; Markdown report). `index.html`.
- 2026-10-12: Idea 7: Example answers (20 model answers, approve or rewrite, the 2 or 3 most similar are shown to the AI, copy notice). `index.html`.
- 2026-10-12: Idea 6: Prompt versions (v1, v2, v3 of the base prompt, switchable, comparable in the Test lab). `index.html`.
- 2026-10-12: Idea 10: Voting on hard questions (Deep mode, three tries, most common final answer wins, "not sure" when all differ). `index.html`.
- 2026-10-12: Idea 25: Answer versions (editing or "Answer again" keeps the old version; arrows switch; up to 12; old chats unchanged). `index.html`.
- 2026-10-12: Phones and tablets: bigger tap targets for switches and buttons inside Settings. `index.html`.
- 2026-10-12: Idea 16: Role presets (Tutor, Writing coach, Business helper, Coding helper; Role button, `/role`, saved per chat, own starter buttons). `index.html`.
- 2026-10-12: Idea 11: Show-your-work solver (`/solve`, six-part layout, one repair if parts are missing, code check of each simple sum, no Wikipedia look-up for `/solve`). `index.html`.
- 2026-10-12: Idea 18: Essay feedback (`/essay`; one pass per paragraph, quotes checked by code, top 3 fixes, five kinds, optional rubric estimate). `index.html`.
- 2026-10-12: Idea 20: Daily review (five-box spaced repetition, "Save to daily review" under flashcards, `/review`, cards-due button on the home screen, streak). `index.html`.
- 2026-10-12: Idea 33: Battery saver (shorter answers, smaller memory, no background AI calls, automatic below 30% battery where the browser reports it, hot-laptop tip, badge, settings). `index.html`.
- 2026-10-12: Idea 12: Both-sides mode (`/both`, automatic for debate questions, fixed layout, length-balance check by code). `index.html`.
- 2026-10-12: Idea 5: Check facts button (claims, built-in facts and Wikipedia lookup, supported / could not confirm / contradicted, saved with the answer, feeds the confidence label). `index.html`.
- 2026-10-12: Idea 9 from the improvement doc: a "Confidence: High / Medium / Low" label under factual answers, decided by evidence (sources, exact code results, attached files), with the reason on tap. `index.html` (new part: confidence label). The model's own feeling does not count, and Lumen does not yet fact-check each sentence (idea 5), so the reason says so.
- 2026-10-11: Built-in core facts library (about 310 facts, works offline, can be switched off). `index.html`, `core-facts.txt`.
- 2026-10-11: Stuck-at-0% model loading is detected, restarted once, and explained. `index.html`.
- 2026-10-11: Most-known meaning for names ("mr beast"), remembered choices, bigger daily reading. `index.html`.
