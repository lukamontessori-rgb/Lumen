# Model licences

Checked on 12 October 2026 (0.8B, 2B, 4B) and on 13 October 2026 (9B) on the official Hugging Face model cards.

| Model used by Lumen | Name in Lumen | Original model | Licence on the original model card | Notes |
|---|---|---|---|---|
| Qwen3.5 0.8B | Sparvelle | https://huggingface.co/Qwen/Qwen3.5-0.8B | Apache-2.0 | Lumen loads the MLC build `Qwen3.5-0.8B-q4f16_1-MLC` (or the `q4f32_1` build). |
| Qwen3.5 2B (default) | Lanthelle | https://huggingface.co/Qwen/Qwen3.5-2B | Apache-2.0 | `Qwen3.5-2B-q4f16_1-MLC` (or `q4f32_1`). |
| Qwen3.5 4B | Radivane | https://huggingface.co/Qwen/Qwen3.5-4B | Apache-2.0 | `Qwen3.5-4B-q4f16_1-MLC` (or `q4f32_1`). |
| Qwen3.5 9B (strongest, for strong computers) | Solvarra | https://huggingface.co/Qwen/Qwen3.5-9B | Apache-2.0 | `Qwen3.5-9B-q4f16_1-MLC` (or `q4f32_1`). About 5.1 GB download. |

The MLC builds (https://huggingface.co/mlc-ai) are conversions of these models to a different file format. The mlc-ai pages for them show no separate licence, so the licence of the original model applies. The full Apache License 2.0 text is in `Apache-2.0.txt` in this folder.

Lumen does not host the model files. The browser downloads them from Hugging Face when the user presses "Download", and Lumen says so in its privacy page.

The names in the second column were made up for Lumen (17 October 2026) so the models are easy to tell apart. They are only
labels: the models are used as published, without changes or retraining, and the app always shows the real model name next to
Lumen's name (model picker, Settings, About and Credits). Alibaba does not use these names and does not endorse Lumen. The Apache
License 2.0 grants no rights in Alibaba's or Qwen's trademarks (section 6); Lumen uses the name "Qwen" only to say where the models
come from.

Re-check the licence on the model card whenever the model is changed. Last re-checked: 17 October 2026 (third-party pages still
describe the official Qwen3.5 model cards as Apache-2.0).
