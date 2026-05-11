# Shelved fixtures

Test fixtures parked here are **not** part of the active RAG verification corpus. They were generated for filetypes that the platform does not yet ingest. They live here (rather than being deleted) so we can pick them back up when the matching extractor lands.

## Currently shelved

### `strategieklausur_2025.pptx`

- **Format:** PowerPoint OOXML (`.pptx`)
- **Created:** 2026-05-08 (by the corpus-build agent team)
- **Shelved:** 2026-05-11
- **Reason:** Adversarial review concluded that `python-pptx` silently drops slide images, content inside grouped shapes, and presenter notes — real-world strategy decks would lose substantive content with no surfaced warning. Shipping it would produce misleading RAG indexes. The fixture itself is text-only (zero images, zero groups, zero notes) so it would pass a smoke test cleanly and hide the actual failure mode.
- **Unshelve when:** OCR pipeline v2 (Docling + Granite-Docling-258M + PaddleOCR-VL fallback, per `CLAUDE.md` priority #6) lands. Docling reads `.pptx` natively with layout-aware extraction including images, charts, and spatial table reconstruction.
- **Companion shelved formats:** `.ppt` and `.doc` (legacy binary Office formats) are also shelved by policy decision 2026-05-11 — they need system-tool subprocess deps (`antiword`, `catdoc`) and would bloat the Coolify image. Revisit alongside `.pptx` when Docling is in.

## When you unshelve

1. Move the fixture back into the corpus structure where it belongs (`musterbau/`, `multidoc_a/`, etc.).
2. Wire the extractor: add the lib to `backend/pyproject.toml`, add `_extract_<fmt>_text` in `backend/app/documents.py`, extend `SUPPORTED_UPLOAD_EXTENSIONS` + `_FILE_TYPE_BY_EXT` in `backend/app/main.py`, extend the frontend `accept` attributes.
3. Run `python scripts/build_corpus.py` to confirm fixture regeneration still works.
4. Drop the corresponding entry from this README.
