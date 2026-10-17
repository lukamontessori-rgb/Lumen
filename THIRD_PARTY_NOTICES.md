# Third-party notices

Lumen's own code is under the Apache License 2.0 (see `LICENSE`). The libraries below are unchanged copies from their npm packages. They are in the folder `vendor/` of this repository and Lumen serves them from its own site (no public content network is used). Each folder in `vendor/` has the licence file of its library, and `vendor/README.md` lists the exact files and where they come from. Their licences and copyright notices are also listed here.

Two of the libraries are bundles that contain smaller libraries inside them: the notices for those are in `vendor/mermaid-11.4.1/THIRD_PARTY_LICENSES.txt` (19 libraries, including d3, cytoscape, dayjs, lodash-es and marked) and `vendor/web-llm-0.2.85/THIRD_PARTY_LICENSES.txt` (the Apache TVM runtime, OpenAI library types, tslib and loglevel).

Licence checks were made on 12 October 2026 against the exact package versions Lumen loads.

## Apache License 2.0 (full text in `licenses/Apache-2.0.txt`)

- **WebLLM** (`@mlc-ai/web-llm` 0.2.85), by the MLC team. https://github.com/mlc-ai/web-llm
- **PDF.js** (`pdfjs-dist` 3.11.174), by Mozilla and contributors. https://github.com/mozilla/pdf.js
- **DOMPurify** (3.4.16), by Cure53 and contributors. Offered under Apache License 2.0 or Mozilla Public License 2.0; Lumen uses it under Apache 2.0. https://github.com/cure53/DOMPurify
- **Qwen3.5** (0.8B, 2B, 4B and 9B models), by the Qwen team, Alibaba Cloud. Model cards on https://huggingface.co/Qwen state `License: apache-2.0` (checked 12 October 2026 for 0.8B, 2B and 4B, and 13 October 2026 for 9B). See `licenses/MODEL_LICENSES.md`.

## MIT and BSD licences

### marked 18.0.14

```text
# License information

## Contribution License Agreement

If you contribute code to this project, you are implicitly allowing your code
to be distributed under the MIT license. You are also implicitly verifying that
all code is your original work. `</legalese>`

## Marked

Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)
Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Markdown

Copyright © 2004, John Gruber
http://daringfireball.net/
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name “Markdown” nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

This software is provided by the copyright holders and contributors “as is” and any express or implied warranties, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose are disclaimed. In no event shall the copyright owner or contributors be liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, procurement of substitute goods or services; loss of use, data, or profits; or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort (including negligence or otherwise) arising in any way out of the use of this software, even if advised of the possibility of such damage.
```

### KaTeX 0.18.9

```text
The MIT License (MIT)

Copyright (c) 2013-2020 Khan Academy and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Mermaid 11.4.1

```text
The MIT License (MIT)

Copyright (c) 2014 - 2022 Knut Sveidqvist

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### highlight.js 11.12.0

```text
BSD 3-Clause License

Copyright (c) 2006, Ivan Sagalaev.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Fonts (SIL Open Font License 1.1)

Since version 18 the page uses the fonts that are already on your computer and ships no font files. Earlier notes named these two free fonts (SIL Open Font License, Version 1.1); their licence texts, with the copyright lines, stay in the folder `licenses/` in case a later version bundles them.

- **Figtree**: Copyright 2022 The Figtree Project Authors (https://github.com/erikdkennedy/figtree). Licence: `licenses/OFL-Figtree.txt`.
- **Fraunces**: Copyright 2020 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces). Licence: `licenses/OFL-Fraunces.txt`.

The fonts are not sold on their own. Lumen is not made by or endorsed by the font authors.

## Data and services

- Wikipedia, Simple English Wikipedia, Wiktionary and Wikivoyage text: Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), by Wikipedia contributors. Wikipedia is a trademark of the Wikimedia Foundation; Lumen is not connected to it.
- Wikidata and OpenAlex: CC0.
- Open-Meteo.com weather data: CC BY 4.0 (https://open-meteo.com/).
- Exchange rates from the European Central Bank through Frankfurter; prices from CoinGecko; headlines from GDELT and Hacker News; page reading by Jina Reader. These are asked live, and only with short search words, as described in the privacy page of the app.
