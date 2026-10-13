# Model licences

Checked on 12 October 2026 (0.8B, 2B, 4B) and on 13 October 2026 (9B) on the official Hugging Face model cards.

| Model used by Lumen | Original model | Licence on the original model card | Notes |
|---|---|---|---|
| Qwen3.5 0.8B | https://huggingface.co/Qwen/Qwen3.5-0.8B | Apache-2.0 | Lumen loads the MLC build `Qwen3.5-0.8B-q4f16_1-MLC` (or the `q4f32_1` build). |
| Qwen3.5 2B (default) | https://huggingface.co/Qwen/Qwen3.5-2B | Apache-2.0 | `Qwen3.5-2B-q4f16_1-MLC` (or `q4f32_1`). |
| Qwen3.5 4B | https://huggingface.co/Qwen/Qwen3.5-4B | Apache-2.0 | `Qwen3.5-4B-q4f16_1-MLC` (or `q4f32_1`). |
| Qwen3.5 9B (strongest, for strong computers) | https://huggingface.co/Qwen/Qwen3.5-9B | Apache-2.0 | `Qwen3.5-9B-q4f16_1-MLC` (or `q4f32_1`). About 5.1 GB download. |

The MLC builds (https://huggingface.co/mlc-ai) are conversions of these models to a different file format. The mlc-ai pages for them show no separate licence, so the licence of the original model applies. The full Apache License 2.0 text is in `Apache-2.0.txt` in this folder.

Lumen does not host the model files. The browser downloads them from Hugging Face when the user presses "Download", and Lumen says so in its privacy page.

Re-check the licence on the model card whenever the model is changed.
