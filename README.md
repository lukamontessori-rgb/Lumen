# Lumen

A private AI tutor that runs inside your web browser. The AI model (Qwen3.5) runs on your own computer's graphics chip with the WebLLM engine. Nothing you type is sent to an AI company.

## What you need

- **Google Chrome 113 or newer** (best), or **Safari on macOS 26 (Tahoe)** or newer.
- About **1.1 GB** of free space for the recommended model (Qwen3.5 2B). The 4B model needs 2.4 GB, the 0.8B model 0.45 GB.
- Internet the first time (to download the model). After that the AI works offline. Look-ups, weather and news need the internet.

## Put it online with GitHub Pages (recommended)

This gives you a normal link. You download nothing yourself; the browser saves the model the first time you open the page.

1. On github.com, click **New repository**. Name it `lumen`, set it to **Public**, and click **Create repository**.
2. On the new repository page, click **uploading an existing file**.
3. Drag in all the files from this folder: `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `icon-192.png`, `icon-512.png`, `core-facts.txt`, `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, and the `licenses` folder. Click **Commit changes**. (The `tools` folder is for your own Mac, to make the offline Wikipedia file. It is fine in the repository, but the page does not need it.)
4. Go to **Settings → Pages**. Under "Branch", choose **main** and **/ (root)**, then click **Save**.
5. Wait one or two minutes. Your link is `https://<your-username>.github.io/lumen/`.
6. Open the link in Chrome and click **Download and start**.

If you already put an older Lumen online: upload the new files over the old ones, open the link, and press **Cmd+Shift+R** once to load the new version.

Tip: in Chrome you can click the install icon in the address bar to add Lumen to your Dock like an app.

## Try it without GitHub

Open `index.html` in **Google Chrome** (drag the file onto a Chrome window). It works, but the AI then runs on the main page thread, so it can feel a little less smooth, and start-up offline is less reliable. The GitHub Pages link is better.

## It keeps learning

A web page cannot retrain the AI model itself (that needs a big computer and a lot of time). So Lumen learns the way a good assistant does: it keeps notes on your computer and shows the right ones to the model with every question. All of it is saved in your browser only. You can see and control everything in **Settings → Keeps learning**, or type `/learned`.

- **It remembers what you tell it.** Say "I have an iPhone 17" and it is saved, with a small "Remembered" label under your message and an Undo button. Say "I now use an iPhone 18" later and the new fact replaces the old one. Say "Jimmy Donaldson is Mr. Beast" and Lumen knows both names mean the same thing, and even searches for the other name too. Other things it picks up: your name, age, where you live, your job or school, things you own, pets, "my exam is on Friday", things you like, and "from now on, answer in short sentences". It ignores questions, guesses and "what if" sentences, and it never saves health, religion, money or similar topics by itself (type "remember …" yourself if you want those saved). Say "forget my iPhone" to remove a fact.
- **It understands which one you mean.** Many names belong to more than one thing. If you type "mr beast", Lumen looks at which page people actually read the most (Wikipedia's page views of the last 60 days), so you get the YouTuber and not a little-known album. It also searches the other spelling ("mrbeast"). Under the answer it says which one it picked and shows a button for each other meaning ("Not what you meant?"). Tap one and Lumen answers again about that meaning and **remembers your choice** for that name, with an Undo button. If you write the kind of thing ("mr beast album"), it follows your words. You can see and forget your choices in `/learned`.
- **It notices what you like.** It keeps count of the topics you ask about. If you often tap "Simpler" it starts answering in simpler words by itself; the same for short answers, detailed answers and examples. Your favorite topics show up as a suggestion on the start screen.
- **It comes with built-in facts.** About 310 short facts are packed inside Lumen itself: who leads the big countries and organisations (checked on 11 October 2026), science, maths, history, geography, health, money, technology, sports results, big events of 2025–2026 (for example the 2026 World Cup, the 2026 Nobel prizes and the Iran war), everyday facts and a part about Slovenia. For every question Lumen searches them on your computer and gives the ones that fit to the AI, with the label "Built-in core facts" under the answer. They work without internet and are never sent anywhere. Turn them off in Settings → Keeps learning → "Use the built-in facts". They do not update by themselves: they are as new as the version of Lumen you have (the page tells the AI how old they are, and after 60 days it warns the user that they may be out of date).
- **It says how far to trust an answer.** Under factual answers there is a small label, "Confidence: High", "Medium" or "Low". Tap it to see why. It is decided by evidence, not by the AI's own feeling: High means sources (or exact code results, or your file) were in front of the AI; Low means nothing was found to check it against and the answer states specific dates, numbers or names. It does not check each sentence yet, so even "High" means "has sources", not "proven". Poems, small talk and code get no label.
- **Check facts.** Under a factual answer, the **Check facts** button lists up to 5 claims from the answer (dates, names and numbers first), looks each one up in the built-in facts and in Wikipedia, and marks it **Supported**, **Could not confirm** or **Contradicted**, with the source. "Could not confirm" does not mean wrong. A contradiction turns the confidence label to Low. The AI model judges each passage, and a small model can misjudge, so check important things yourself. The results are saved with the answer.
- **Both sides.** For debate questions ("Should schools ban phones?", "Is it fair to ...") Lumen answers in a fixed layout: the question in neutral words, the best case for each side, what is disputed, what to check next, and a counter-argument idea for your essay. It gives no opinion of its own. Code checks that the two sides are about the same length (within 20%) and warns you if one side is much longer. You can also type `/both your question`. "X better than Y" product questions still get the normal comparison table.
- **Battery saver.** Settings → Battery saver. When on: shorter answers, a smaller memory, and no background AI work (no search-word planning, no chat summaries). A badge at the top shows while it is on. It turns on by itself under 30% battery when not charging (Chrome can report the battery, Safari and Firefox cannot) and tells you when it does. If answers become more than 40% slower than at the start of your session, Lumen shows a tip that the laptop is hot.
- **Daily review.** Under flashcards (`/cards`), press **Save to daily review**. The cards then come back after 1, 2, 4, 8 and 16 days (five boxes): **Got it** moves a card up one box, **Missed** sends it back to box 1, **Not sure** keeps it where it is. The home screen says "12 cards due today", and `/review` opens a round of up to 20 cards. A streak counts the days in a row you reviewed. Days use your computer's own local time. Lumen only knows what is due when it is open: it sends no reminders. Cards are saved in this browser (up to 400) and are part of the backup.
- **Essay feedback.** Type `/essay`, paste your essay and, if you have it, your teacher's rubric. Lumen reads one paragraph at a time and gives: the top 3 fixes, then Structure, Clarity, Grammar, Evidence and Style, and (with a rubric) an estimated level per criterion. Every comment quotes your exact sentence, and code checks that the quote really is in your essay; comments with an invented quote are dropped and the answer says how many. Only one or two short example rewrites are shown, never a rewritten essay. It reads up to 3,000 words, about 14 paragraphs.
- **Show-your-work solver.** For school math and science problems, type `/solve your problem` (a plain "Solve 3x + 7 = 22" gets the same layout by itself). The answer always has six parts: **Given**, **Find**, **Method**, **Steps**, **Check** and **Answer**. If the AI leaves some parts out, Lumen asks it once to write the whole solution again (it keeps the better version and says so). Then code recomputes every simple step written like `22 - 7 = 15` or `3 × 4 = 12`. If the AI's sum is wrong, a yellow note shows the sum and the calculator's result; if all are right, a quiet note says so. `/solve` also skips the Wikipedia look-up, because a math problem does not need one.
- **Roles.** The **Role** button under the message box (or `/role tutor`, `/role writing`, `/role business`, `/role coding`, `/role none`) gives the chat a working style: **Tutor** (explains in steps, then asks you one check question and does not give its answer), **Writing coach** (top 3 fixes first, quotes your words, no full rewrites), **Business helper** (summary, numbers, next steps, says which numbers are assumptions) and **Coding helper** (code first, then a plain explanation). The role belongs to the chat, is saved with it, and changes the starter buttons on the home screen. It adds about 150 words to every message the AI reads, which uses a little more memory and time per answer.
- **It saves what it looks up.** Every Wikipedia article it reads for you is kept as a short note. The next question about it is faster, and it still works when you have no internet (the answer says the notes are older).
- **It reads a little of the internet every day, and gets a bit smarter each time.** About once a day, while Lumen is open, it reads Wikipedia's news, today's featured article and the 8 most-read articles. For your favorite topics (up to 5) it saves two articles each and headlines, and for your number-one topic it does a longer read, so a later question gets more than the opening lines. It also **tries again for things it could not find**: if you asked about something and nothing was found, Lumen keeps the words for up to 14 days and looks again in the daily reading (articles and news appear over time). And it **refreshes older notes** that it used before (up to 5 a day), so they do not go stale. Press **Learn now** to do it right away.

Every switch can be turned off, and "Forget what Lumen noticed" and "Empty the saved notes" erase what it learned. Facts about you (memory) can hold 60 items, and Lumen remembers up to 60 meanings you chose. The backup file includes your memory, your chosen meanings and saved notes.

## What is new in version 13: the legal parts

These were added after reading a legal checklist for EU and Slovenian hobby projects (it is not legal advice, see "Honest limits").

- **"You are chatting with an AI."** The first screen says it is an AI, not a human, that it can make mistakes, that it gives no medical, legal or money advice, and that it is recommended for ages 15 and over. The small line under the message box says it too.
- **Footer and four pages.** Under the message box and on the first screen: **About and limits**, **Privacy**, **Terms**, **Credits** and **Contact**. They open in a window, can be linked directly (`#privacy`, `#terms`, `#about`, `#credits` at the end of the address), and can be opened with `/about`, `/privacy`, `/terms`, `/credits` or with Cmd+K. The privacy page lists every service that can receive search words (from the same list as Settings), and names GitHub Pages, jsDelivr and Hugging Face, which see your internet address. The name and contact address are written once, in a line that starts with `const LEGAL =` in `index.html`. To change them, search the file for `zupanc.luka@icloud.com` and `Luka Zupanc` and replace them.
- **Delete all my data.** Settings → Storage and chats. Two clicks. It removes chats, memory, saved notes, settings, test-lab results, the offline Wikipedia copy, the AI model files and the page copy, then restarts the page as new.
- **"AI-generated by Lumen" labels.** Saved chats and answers, flashcards and quizzes, printouts, slide decks and the backup file always carry the label (and a machine-readable "generator" note). When you copy an answer, a short label is added at the end; you can switch that off in Settings → What leaves this computer.
- **Help if someone writes about hurting themselves.** If a message says things like "I want to die" or "hurt myself", a notice under the answer shows 112, Zaupni telefon Samarijan and Sopotnik (116 123) and TOM telefon (116 111). The check runs on your computer with a list of phrases; nothing is sent, and nothing is added to what the AI is told. It can miss a message, and it can show the notice when it is not needed.
- **Before the download.** The model card says where the files come from (Hugging Face), that it sees your internet address, and to use Wi-Fi on a phone. Nothing is downloaded until you press Download.
- **Licence files.** `LICENSE` (Apache 2.0 for Lumen's own code), `NOTICE`, `THIRD_PARTY_NOTICES.md` (the libraries and their licences) and `licenses/MODEL_LICENSES.md` (the Qwen3.5 models are Apache 2.0, checked on 12 October 2026 on the official pages).

## What is new in version 12

- **Versions of an answer.** When you edit a question or press **Answer again**, the old answer is kept. Small arrows (‹ 2/3 ›) let you go back and forth between the versions. Up to 12 versions are kept for each message. Chats from before this version are not changed.
- **Voting on hard questions.** Settings → "Hard questions: three tries". In Deep mode, for puzzles and math questions with a short answer (a number, a choice, yes or no), Lumen answers three times and shows the answer that most tries agree on. If all three differ it says it is not sure, and the confidence label drops to Low. It takes two to three times as long, so it is off until you turn it on.
- **Prompt versions and example answers.** Settings → "How Lumen is told to answer" has three versions of the base instructions (v1, v2, v3). Each changes one thing, and you can switch at any time. Settings → "Example answers" holds twenty model answers (explain, compare, how-to, both sides, "I don't know"). After you approve or rewrite at least three, Lumen shows the AI the two or three most similar ones before your question (this adds up to 600 tokens). A notice appears if an answer repeats 8 or more words in a row from an example.
- **Test lab.** Type `/lab` (or Settings → Test lab). It gives numbers instead of guesses: a **quick check** after every change, **compare models** (0.8B, 2B, 4B), **prompt and example answers A/B**, a **voting test**, and a **speed** test. Every test runs your real prompt at temperature 0 with a fixed seed, in Fast mode and with no look-ups, so two runs can be compared. Answers are scored by code (fact found, math answer right, layout kept, simple words), never by another AI. A change passes if no category gets worse by one question and the speed does not fall by more than 20%. A run survives a page reload, and if the graphics memory runs out the test says so and carries on. **Copy the report** gives a Markdown summary.
- **Dictation (speak instead of type).** Settings → Dictation. Off by default. In Chrome it works in one of two ways, and Lumen tells you which one before you turn it on: **private** (the browser turns speech into text on your computer; it needs the language pack, which the browser can download once) or **online** (the browser sends your voice to its speech service, in Chrome that is Google; this needs a clear yes). A microphone button appears next to Send. Your words appear in the message box so you can fix them, and nothing is sent until you press Send. A line above the box says where your voice goes while it listens. **Esc** stops it.
- **Offline Wikipedia.** Settings → Offline Wikipedia. A copy of Wikipedia's articles, kept on your computer and searched there, so many questions need no internet and no look-up leaves your computer. Lumen never downloads Wikipedia by itself. You make one file once, on your Mac:
  1. Open **Terminal** and go to the `tools` folder that came with Lumen, for example `cd ~/Downloads/lumen/tools`.
  2. Type `python3 build_wiki_pack.py --download simple` and press Enter. It downloads Simple English Wikipedia (about 350 MB, one time) and writes `lumen-wiki-pack.jsonl.gz`. It needs nothing installed and takes about 10 minutes. You can check the script first with `python3 build_wiki_pack.py --selftest` (no internet needed).
  3. In Lumen press **Choose the pack file** and pick that file. The import takes a few minutes. Keep the page open; **Stop the import** keeps nothing.

  For a bigger copy from the full English Wikipedia (a 23 GB download and several hours of work for your Mac) use `python3 build_wiki_pack.py --download en --max-articles 100000`, which keeps the longest 100,000 articles. The pack holds the title and the opening part of each article as plain words. It has no pictures, tables or lists, and no redirects, disambiguation pages, lists or very short stubs.
  
  **How it is used.** Setting "First" (the default): Lumen looks in the copy first. If it finds an article whose title shares a key word with your question, it uses it and asks nobody. If not, or if the question is about something recent ("latest", "news", this year), it asks Wikipedia online as before; with no internet the copy fills in. "Only it": Wikipedia is never asked online. "Off": the copy stays but is not used. The AI is told the copy's date and to say so for things that change. The source shows as "Wikipedia (offline copy)" with the CC BY-SA 4.0 credit, saved chats and exports credit Wikipedia, and a notice appears if an answer copies 8 or more words in a row from the copy.

## What came with version 11 and earlier

The look is the calm, cream-and-teal design again. Under it, Lumen is much smarter and faster:

- **Auto mode** (the default). Lumen decides how much to think. "Hi" gets an instant answer, "why is the sky blue?" gets a short think, and "write a detailed report" gets Deep. You can still pick Fast, Think or Deep yourself. The answer says which one was used.
- **Bigger memory.** The AI keeps about 16,000 tokens in mind (roughly 12,000 words). You can change this in Settings → Memory size. If your graphics chip cannot hold it, Lumen quietly uses a smaller size. In long chats, older messages are squeezed into a short summary, so the chat never "forgets" suddenly and never slows down.
- **Exact answers, not guesses.** Arithmetic, percentages, unit conversion, dates and "what time is it in Tokyo" are worked out by code on your computer.
- **Live data.** Weather and a 3-day forecast (Open-Meteo), currency rates (European Central Bank), crypto prices (CoinGecko).
- **Up-to-date facts.** Wikipedia (plus Simple English Wikipedia, Wiktionary and Wikivoyage), Wikipedia's news pages, Wikidata (exact facts like film directors, capitals, birth dates), news headlines from around the world (GDELT), tech news (Hacker News), and research papers (OpenAlex). They all run at the same time, so a look-up adds almost no waiting. Answers show numbered sources.
- **Optional web search.** Add a free key from Jina or Tavily in Settings and Lumen can search the whole web. Without a key it uses the sources above.
- **Your files.** Press **+** or drag a file into the chat: PDF, Word, PowerPoint, Excel, text, CSV, code. Long files are read in parts; for "summarize the whole file" Lumen first summarizes each part, then combines them. Paste a long text and it becomes a file automatically.
- **Web pages.** Paste a link and Lumen asks before reading it (see the privacy table).
- **Study tools.** `/quiz`, `/cards` and `/slides` make a quiz you can click through, flashcards you can flip, or a slide deck you can present full screen, download as one web page, or print as PDF. They work from a topic, your files, or the last answer.
- **Code tools.** Code blocks have Download. HTML and SVG can be previewed, JavaScript can be run, and Mermaid diagrams are drawn. All of it runs in a locked box with no internet and no access to your chats. JavaScript stops after 5 seconds. (Python cannot be run, only downloaded.)
- **Memory and rules.** Say "remember that my exam is on Friday" or use `/remember` (Lumen also notices facts by itself, see above). Settings → "Your rules" holds how Lumen should always answer. Everything stays on this computer.
- **Message menu.** Under each answer: copy, read aloud, answer again (think harder, faster, search first, without searching), see exactly what Lumen read for the answer, make a quiz or slides from it, save or print.
- **Commands.** Type `/` to see them: `/search`, `/deep`, `/fast`, `/think`, `/simple`, `/short`, `/tutor`, `/solve`, `/both`, `/essay`, `/review`, `/role`, `/quiz`, `/cards`, `/slides`, `/summarize`, `/weather`, `/convert`, `/time`, `/remember`, `/forget`, `/learned`, `/new`, `/export`, `/settings`, `/help`.
- **Search everything:** press **Cmd+K** (or Ctrl+K) to search your chats and find any action.
- **Backup:** Settings → Storage → "Save a backup" saves your chats and memory as one file. "Restore a backup" brings them back. The backup never contains your web search key.

## What leaves your computer

Your questions are answered on your own graphics chip. Only these short messages go out, and only when needed:

| Service | What is sent |
|---|---|
| Wikipedia (and Wiktionary, Wikivoyage) | Your search words |
| Wikipedia news | Nothing about your question |
| Offline Wikipedia copy | Nothing. It is searched on your computer, and Lumen never downloads it |
| GitHub Pages, jsDelivr, Hugging Face | Nothing from you but your internet address, like any web site: GitHub hosts the page, jsDelivr delivers the AI engine and the page libraries, Hugging Face and GitHub deliver the model files when you press Download |
| Dictation (only if you turn it on) | Nothing from Lumen. Private mode keeps your voice on your computer. Online mode: the browser sends your voice to its speech service (in Chrome, Google) |
| Wikidata | The name of the article it found |
| GDELT news | Your search words (news questions only) |
| Hacker News | Your search words (tech news only) |
| OpenAlex | Your search words (research questions only) |
| Open-Meteo | The place name |
| Frankfurter | The currency codes |
| CoinGecko | The coin name |
| Jina Reader | The address of a page, only after you say yes |
| Web search (Jina or Tavily) | Your search words, only if you added a key |
| Daily reading | Wikipedia's news feed (nothing about you). If you allow it, also a few of your favorite topic words, the search words of questions that found nothing, and the titles of older notes to Wikipedia, GDELT and Hacker News. Words from your personal facts (your devices, name, city) and sensitive topics are never used. |

Never sent: your chats, files, memory, saved notes, name, rules or email address. (Your saved city is used only for weather questions where you did not name a place, and then only the place name goes to Open-Meteo.) Text found on the internet is treated as reference text only; Lumen never follows instructions that appear inside it. You can switch every source off in Settings → Look things up, and "Check connections" tests them all.

## If something goes wrong

| Problem | What to do |
|---|---|
| "This browser can't run the AI model" | Use Chrome 113+, or update to macOS 26 for Safari. |
| "Graphics chip ran out of memory" | Close other tabs and apps, choose a smaller Memory size, or pick a smaller model in Settings. |
| The download stopped | Check the internet and click Try again. Finished parts are kept. |
| The model sits at 0% or will not start | Lumen now notices this by itself. If nothing happens for a minute it restarts the loading once, then tells you what it found. The usual causes: **Lumen is open in another tab or window** (close the other one and reload), a **network that blocks the model server** (some school and work networks do; try your phone hotspot), or **not enough memory** (close other tabs and apps). If it still fails, press "Delete the saved model and start over". |
| The model downloads again every time | Don't use a private window. Chrome may also clear site data when the disk is nearly full. |
| A source shows an orange or red dot | Open Settings → Look things up → Check connections. A source that fails three times is paused for a few minutes so it never slows an answer. |
| Answers feel slow | Use Auto or Fast, close other tabs, or choose the 0.8B model. |

## Honest limits

- Small models are much weaker than big cloud AIs. Lumen can still be wrong, especially about exact numbers, dates and hard math. Check the sources under each answer. Do not use it for medical, legal or exam-critical answers.
- The AI's own knowledge stops around the end of 2025. For anything newer it needs a source; if it finds none it says so.
- News headlines give the title, source and date, not the whole article.
- There are no live stock prices (there is no free, key-free source that works in a browser).
- The websites above can change or block requests. Lumen was tested with pretend versions of them, so if one of them behaves differently in real life, that source just shows a red dot and the others keep working. The Tavily and Jina web search options are the most likely to need changes.
- Mermaid diagrams and the PDF reader are loaded from the internet the first time you use them.
- The built-in facts come from a research round of about 20 searches and a few pages, not from 1,000 websites, and the list is short (about 310 facts). It is a good base, not an encyclopedia. Facts about people in office, results and news will become old; the date "checked 11 October 2026" is shown to the AI. Some things were left out on purpose because they could not be confirmed (for example who runs Venezuela today). You can read every fact in the file `core-facts.txt` that comes with Lumen. To refresh them, ask Claude for a new research round.
- Check facts only knows the built-in facts and Wikipedia. A claim about something they do not cover will say "Could not confirm". Wikipedia search wants all the words to match, so Lumen retries without numbers and with just the names, but it can still miss a page.
- The both-sides length check counts characters, not quality. It cannot tell if a small model describes one side in a weaker way.
- Essay feedback is only as good as a 2B-parameter model reading your paragraph. The quote check proves a comment is about your real sentence; it does not prove the comment is right. Treat it as a second pair of eyes, not a teacher. It was tested with a pretend model, so it has not been scored on essays with planted mistakes yet.
- The solver's calculator check only covers simple steps written as numbers with one sign, like `150 / 2 = 75`. It cannot check steps with letters (`3x = 15`), word problems in sentences, or a wrong method. So "all correct" means the sums are right, not that the whole solution is right. A small model can also ignore the six-part layout; Lumen asks once and then tells you what is missing. Roles are only instructions: a small model follows them most of the time, not always.
- The AI model itself does not change. "Learning" means saved notes and habits, not a smarter brain, so a very small model can still misunderstand a note. If it gets something wrong, tell it with "remember that …" and check the sources.
- "The most-known meaning" is a good guess, not a promise. It uses Wikipedia's page views, so a name that is suddenly in the news can win over an older, more famous meaning. That is why the other meanings are always one tap away. If Wikipedia's page-view data cannot be reached, Lumen falls back to the normal search order and still shows the other meanings.
- The daily reading only runs while the Lumen page is open in your browser (a web page cannot wake itself up while closed). If you open Lumen every day, it keeps up; if you do not, press **Learn now**.
- Lumen picks facts out of your messages with simple rules, not with the AI model, so it can miss a fact or (rarely) save one you did not mean. Check Settings → "What Lumen remembers about you" now and then; every fact has a delete button.
- Dictation uses a browser feature that is still new. Private dictation works only if your Chrome offers it for your language; if it does not, Lumen says so and the only way is online dictation, where the browser (not Lumen) sends your voice to Google. It was tested with a pretend speech engine, not with a real microphone.
- Voting only helps for short answers that can be compared, and it takes two to three times as long. It was tested with a pretend model that is wrong on purpose, so whether it makes the real 2B model more accurate is something only the Test lab's voting test can tell you on your Mac.
- The Test lab scores with simple code rules (a key word is there, the number is right, the layout is kept). It is a guide, not a grade: 50 questions are a small sample, and a difference of one question can be luck, so repeat a run before you decide. Speed numbers depend on what else your Mac is doing. The questions and the scoring were tested with a pretend model; the real numbers come from your own Mac.
- Offline Wikipedia finds articles by their words (with a small fix for typing mistakes), not by meaning. A question that uses other words than the article may find nothing; in "First" mode Lumen then asks Wikipedia online, in "Only it" mode you get no Wikipedia notes. The pack is a snapshot: the date shown is the day you built the file. Importing takes minutes (in a test, 60,000 articles took about two and a half minutes) and the copy uses roughly four times the size of the pack file on disk (a 19 MB file used about 68 MB), plus 80 to 120 MB of extra memory while importing; afterwards it needs almost no memory. Removing the copy deletes it at once, but the browser may take a while to give the disk space back. The builder script and the importer were tested on a made-up Wikipedia file in the real format and on made-up packs of up to 60,000 articles, not on the real Wikipedia download, which cannot be reached from where Lumen was built. If Wikipedia's real file behaves differently, the script's "--selftest" and the error messages in Lumen say what went wrong.

- The legal pages were written from a checklist, not by a lawyer. They say what Lumen really does today, but if Lumen changes (a new look-up source, analytics, accounts) they must change too. The checklist itself lists questions for a Slovenian lawyer, for example whether a free hobby site needs a full postal address, and how the AI Act's marking rule works for plain text. Lumen still loads its AI engine and page libraries from a public network (jsDelivr) instead of from this folder; the privacy page says so. Putting them in the repository is a bigger change that I did not make without testing it on a real laptop. The name "Lumen" is also used by other companies (one of them a telecom company with an AI helper called "Ask Lumen"); that is low risk for a free hobby project, but rename it before you earn money or publish an app.
- The help notice for self-harm uses a list of phrases. It is a safety net, not a safe system.

Want smarter answers? Open Settings and switch to the 4B model (2.4 GB). It reasons better, but is about half as fast and needs more memory, so close other tabs first.

## Credits

- Qwen3.5 by Alibaba (Apache 2.0), WebLLM by MLC (Apache 2.0)
- marked (MIT), DOMPurify (Apache 2.0 / MPL 2.0), KaTeX (MIT), highlight.js (BSD-3), Mermaid (MIT), PDF.js (Apache 2.0)
- Facts from Wikipedia, Wiktionary, Wikivoyage and Simple English Wikipedia (CC BY-SA 4.0), Wikidata (CC0), OpenAlex (CC0). Text in an offline Wikipedia pack is from Wikipedia, available under the Creative Commons Attribution-ShareAlike 4.0 license.
- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0), rates from the European Central Bank via Frankfurter, prices from CoinGecko, headlines from GDELT and Hacker News
