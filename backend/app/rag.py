import asyncio
import logging
import re
from calendar import monthrange
from typing import Any, Dict, List, Optional, Tuple

import httpx

from .config import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    RAG_RELEVANCE_GATE,
    RAG_SIMILARITY_THRESHOLD,
    RAG_TOP_K,
)
from .database import supabase
from . import documents as documents_mod
from . import providers as providers_mod
from .token_tracking import record_usage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Chunking — Markdown-section-aware, token-based (Ansatz A + B)
# ---------------------------------------------------------------------------

# Matches markdown headings: "## Title", "### 1.1 Subsection", etc.
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$")

# Bullet / numbered list items (treated as atomic units, never split mid-item)
_BULLET_RE = re.compile(r"^\s*[-*•]\s+|^\s*\d+[.)]\s+")

# Sentence boundary: ./?/! followed by space + uppercase or digit.
# Deliberately simple — overlaps prevent hard boundary errors.
_SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÄÖÜ\d\"])")

# Page markers injected by documents.py during OCR extraction
_PAGE_MARKER_RE = re.compile(r"^<!-- page:(\d+) -->$")

# Markdown table: any non-empty line that starts with |
_TABLE_LINE_RE = re.compile(r"^\s*\|")
# Markdown separator row: |---|---| or |:---:|
_TABLE_SEP_RE = re.compile(r"^\s*\|[\s\-:|]+\|")

# Module-level tiktoken encoder (lazy-loaded once, then cached)
_encoder = None


def _get_encoder():
    """Lazy-load and cache the cl100k_base tiktoken encoder."""
    global _encoder
    if _encoder is None:
        import tiktoken  # noqa: PLC0415
        _encoder = tiktoken.get_encoding("cl100k_base")
    return _encoder


def _tok(text: str) -> int:
    """Return the token count of *text* using the cl100k_base tokenizer."""
    return len(_get_encoder().encode(text))


def _breadcrumb(stack: List[Tuple[int, str]]) -> str:
    """Format a heading stack as a human-readable breadcrumb prefix.

    Example: [(2, "3. Projektrollen"), (3, "3.1 Projektleiter")]
          -> "## 3. Projektrollen > ### 3.1 Projektleiter"
    """
    return " > ".join(f"{'#' * lvl} {txt}" for lvl, txt in stack)


def _split_into_units(text: str) -> List[str]:
    """Break prose into small atomic units for fine-grained chunk assembly.

    Rules (in order):
    1. Empty lines → preserved as empty strings (paragraph breaks).
    2. Bullet / numbered list items → one unit each.
    3. All other lines → sentence-split via _SENT_SPLIT_RE.
    """
    units: List[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            units.append("")
            continue
        if _BULLET_RE.match(stripped):
            units.append(line)
        else:
            parts = _SENT_SPLIT_RE.split(line)
            units.extend(parts)
    return units


def _table_to_atoms(table_text: str, chunk_size: int, prefix_tokens: int) -> List[str]:
    """Convert a markdown table block to one or more pre-sized chunk atoms (Phase 5.1).

    If the whole table fits within the token budget, it is returned as a single atom.
    Otherwise it is split only at row boundaries, and the column-header row is
    repeated at the start of every continuation chunk so the LLM always sees the
    column context alongside the data.
    """
    budget = chunk_size - prefix_tokens - 10  # small safety margin
    if _tok(table_text) <= budget:
        return [table_text]

    lines = table_text.split("\n")

    # Identify header rows: row 0 (column names) + optional row 1 (separator |---|)
    header_lines: List[str] = [lines[0]] if lines else []
    data_start = 1
    if len(lines) > 1 and _TABLE_SEP_RE.match(lines[1]):
        header_lines.append(lines[1])
        data_start = 2

    data_lines = lines[data_start:]
    result: List[str] = []
    row_buf: List[str] = list(header_lines)
    row_buf_tokens = _tok("\n".join(row_buf)) + 1

    for row in data_lines:
        row_tokens = _tok(row) + 1
        if row_buf_tokens + row_tokens > budget and len(row_buf) > len(header_lines):
            result.append("\n".join(row_buf))
            cont_note = f"[Tabellenfortsetzung — Spalten: {lines[0]}]"
            row_buf = [cont_note] + (header_lines[1:] if len(header_lines) > 1 else [])
            row_buf_tokens = _tok("\n".join(row_buf)) + 1
        row_buf.append(row)
        row_buf_tokens += row_tokens

    if row_buf:
        result.append("\n".join(row_buf))

    return result or [table_text]


def _units_with_table_awareness(
    content: str, chunk_size: int, prefix_tokens: int
) -> List[str]:
    """Replace _split_into_units for table-aware section splitting (Phase 5.1).

    Contiguous markdown table lines are extracted as atomic blocks and pre-sized
    via _table_to_atoms so they are never split mid-row. Non-table prose is
    delegated to _split_into_units as before.
    """
    atoms: List[str] = []
    prose_lines: List[str] = []
    table_lines: List[str] = []
    in_table = False

    for line in content.split("\n"):
        is_tbl = bool(line.strip() and _TABLE_LINE_RE.match(line))
        if is_tbl:
            if not in_table:
                if prose_lines:
                    atoms.extend(_split_into_units("\n".join(prose_lines)))
                    prose_lines = []
                in_table = True
            table_lines.append(line)
        else:
            if in_table:
                atoms.extend(_table_to_atoms("\n".join(table_lines), chunk_size, prefix_tokens))
                table_lines = []
                in_table = False
            prose_lines.append(line)

    # Flush remaining
    if table_lines:
        atoms.extend(_table_to_atoms("\n".join(table_lines), chunk_size, prefix_tokens))
    if prose_lines:
        atoms.extend(_split_into_units("\n".join(prose_lines)))

    return atoms


def _overlap_tail(units: List[str], overlap_tokens: int) -> List[str]:
    """Return the trailing units that fit within *overlap_tokens*."""
    tail: List[str] = []
    budget = overlap_tokens
    for unit in reversed(units):
        cost = _tok(unit) + 1  # +1 for the joining newline
        if cost > budget:
            break
        tail.insert(0, unit)
        budget -= cost
    return tail


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> List[Tuple[str, Optional[int]]]:
    """Markdown-section-aware chunker with token-based sizing and header injection.

    Returns a list of (chunk_text, page_number) tuples. page_number is the
    1-based page number at which the section starts (from <!-- page:N --> markers
    injected by documents.py), or None if no page markers are present.

    A) **Markdown-section-aware**: The input text (Mistral OCR markdown) is split
       at heading boundaries (``#`` … ``######``).  Each section keeps its own
       heading stack so the embedding model always sees the structural context.

    B) **Header injection**: Every chunk is prefixed with a breadcrumb derived
       from the active heading stack, e.g.::

           ## 3. Projektrollen > ### 3.1 Projektleiter

           Der Projektleiter ist verantwortlich für…

       This ensures that retrieval for "Wer ist Projektleiter?" finds the right
       section even when the heading itself is not in the retrieved chunk.

    C) **Token-based sizing**: ``chunk_size`` and ``overlap`` are now measured in
       *tokens* (tiktoken cl100k_base, same family as text-embedding-3-small),
       not characters.  Default: 512 tokens / 50 tokens overlap.

    D) **Sentence-boundary respect**: When a section must be split, the chunker
       tries to break at sentence endings or bullet-item boundaries rather than
       at arbitrary character positions.
    """
    if not text or not text.strip():
        return []

    # ------------------------------------------------------------------
    # Step 1 — Parse into sections at heading boundaries
    # ------------------------------------------------------------------
    # Each section: (heading_stack, content_lines, start_page)
    sections: List[Tuple[List[Tuple[int, str]], List[str], Optional[int]]] = []
    heading_stack: List[Tuple[int, str]] = []
    current_lines: List[str] = []
    current_page: Optional[int] = None
    section_start_page: Optional[int] = None

    for raw_line in text.split("\n"):
        pm = _PAGE_MARKER_RE.match(raw_line)
        if pm:
            current_page = int(pm.group(1))
            continue  # marker is metadata, not content

        m = _HEADING_RE.match(raw_line)
        if m:
            # Flush previous section only when it has actual text content.
            # Empty sections (heading followed immediately by another heading)
            # are skipped — the parent heading is carried in the breadcrumb of
            # the child section via heading_stack.
            if any(line.strip() for line in current_lines):
                sections.append((list(heading_stack), list(current_lines), section_start_page))
            current_lines = []
            section_start_page = current_page  # new section begins at current page
            level = len(m.group(1))
            title = m.group(2).strip()
            # Pop headings at the same or deeper level, then push new heading
            heading_stack = [(lvl, txt) for lvl, txt in heading_stack if lvl < level]
            heading_stack.append((level, title))
        else:
            current_lines.append(raw_line)

    # Flush last section
    if current_lines:
        sections.append((list(heading_stack), list(current_lines), section_start_page))

    # ------------------------------------------------------------------
    # Step 2 — Convert sections to chunks
    # ------------------------------------------------------------------
    chunks: List[Tuple[str, Optional[int]]] = []

    for h_stack, lines, start_page in sections:
        bc = _breadcrumb(h_stack)
        content = "\n".join(lines).strip()

        if not content and not bc:
            continue

        prefix = f"{bc}\n\n" if bc else ""
        prefix_tokens = _tok(prefix) if prefix else 0
        full_text = f"{prefix}{content}" if content else bc

        # Happy path: entire section fits in one chunk
        if _tok(full_text) <= chunk_size:
            chunks.append((full_text, start_page))
            continue

        # Section too large — split at unit boundaries
        units = _units_with_table_awareness(content, chunk_size, prefix_tokens)
        buf: List[str] = []
        buf_tokens = prefix_tokens

        for unit in units:
            unit_tokens = _tok(unit) + 1  # +1 for joining newline

            # Edge case: single unit exceeds budget → hard token-split
            if unit_tokens > chunk_size - prefix_tokens:
                if buf:
                    chunks.append((f"{prefix}{chr(10).join(buf).strip()}", start_page))
                    buf = _overlap_tail(buf, overlap)
                    buf_tokens = prefix_tokens + sum(_tok(u) + 1 for u in buf)

                enc = _get_encoder()
                encoded = enc.encode(unit)
                budget = chunk_size - prefix_tokens
                while encoded:
                    slice_enc = encoded[:budget]
                    encoded = encoded[max(0, budget - overlap):]
                    decoded = enc.decode(slice_enc)
                    chunks.append((f"{prefix}{decoded}", start_page))
                    if len(encoded) <= overlap:
                        break
                buf = []
                buf_tokens = prefix_tokens
                continue

            # Normal case: flush buffer when it would overflow
            if buf_tokens + unit_tokens > chunk_size and buf:
                chunks.append((f"{prefix}{chr(10).join(buf).strip()}", start_page))
                buf = _overlap_tail(buf, overlap)
                buf_tokens = prefix_tokens + sum(_tok(u) + 1 for u in buf)

            if unit.strip():  # skip empty lines after a flush
                buf.append(unit)
                buf_tokens += unit_tokens

        # Flush remaining buffer
        if buf:
            tail = "\n".join(buf).strip()
            if tail:
                chunks.append((f"{prefix}{tail}", start_page))

    return [(c, p) for c, p in chunks if c.strip()]


# ---------------------------------------------------------------------------
# End of chunking helpers
# ---------------------------------------------------------------------------

IMAGE_QUERY_KEYWORDS = {
    "image", "images", "picture", "pictures", "photo", "photos", "figure", "figures",
    "chart", "charts", "graph", "graphs", "diagram", "diagrams", "screenshot", "screenshots",
    "bild", "bilder", "grafik", "grafiken", "abbildung", "abbildungen", "diagramm", "diagramme",
    "chartanalyse", "visual", "visuell", "tabellenbild", "plot",
}


SUMMARY_QUERY_KEYWORDS = {
    "summarize", "summary", "overview", "abstract", "recap",
    "zusammenfassen", "zusammenfassung", "fasse", "überblick", "ueberblick",
}

LISTING_QUERY_KEYWORDS = {
    "welche dokumente", "welche dateien", "welche unterlagen",
    "liste alle dokumente", "liste die dokumente", "zeige alle dokumente",
    "which documents", "list documents", "list all documents", "show documents",
    "what documents", "what files",
    "dokumente kennst", "dokumente hast", "dokumente gibt es",
    "dokumente vorhanden", "dokumente verfügbar",
}

# Max chunks returned by targeted (filter-based) retrieval — caps context size.
# 80 chunks × ~512 tokens ≈ 40 k tokens, comfortably within large-context models.
_MAX_TARGETED_CHUNKS = 80

# German and English month names → month number
_MONTH_MAP: Dict[str, int] = {
    "januar": 1, "jänner": 1, "january": 1,
    "februar": 2, "february": 2,
    "märz": 3, "maerz": 3, "march": 3,
    "april": 4,
    "mai": 5, "may": 5,
    "juni": 6, "june": 6,
    "juli": 7, "july": 7,
    "august": 8,
    "september": 9,
    "oktober": 10, "october": 10,
    "november": 11,
    "dezember": 12, "december": 12,
}

# Common document-type nouns used for filename ILIKE matching
_DOC_TYPE_WORDS = [
    "protokoll", "protokolle",
    "rechnung", "rechnungen",
    "vertrag", "verträge", "vertraege",
    "bericht", "berichte",
    "angebot", "angebote",
    "gutachten",
    "invoice", "invoices",
    "contract", "contracts",
    "report", "reports",
    "minutes",
]


def parse_document_filters(query: str) -> Dict[str, Any]:
    """Extract temporal and type filters from a natural-language query.

    Returns a dict with zero or more of these keys:
      date_from   — ISO date string "YYYY-MM-DD" (inclusive)
      date_to     — ISO date string "YYYY-MM-DD" (inclusive, end of day)
      name_pattern — substring for case-insensitive filename matching

    Handles numeric date formats (DD.MM.YYYY, D.M.YYYY, YYYY-MM-DD, MM/YYYY)
    as well as text month names (März, march, …).
    """
    q = (query or "").lower()
    filters: Dict[str, Any] = {}

    year: Optional[int] = None
    month: Optional[int] = None

    # 1. Numeric date formats — highest priority, checked first
    # DD.MM.YYYY or D.M.YYYY  (e.g. "23.03.2026", "1.3.2026")
    m = re.search(r"\b(\d{1,2})\.(\d{1,2})\.(20[2-9]\d)\b", q)
    if m:
        month = int(m.group(2))
        year = int(m.group(3))

    # YYYY-MM-DD (e.g. "2026-03-23")
    if not (year and month):
        m = re.search(r"\b(20[2-9]\d)-(\d{2})-\d{2}\b", q)
        if m:
            year = int(m.group(1))
            month = int(m.group(2))

    # MM/YYYY or MM.YYYY (e.g. "03/2026", "03.2026")
    if not (year and month):
        m = re.search(r"\b(0?[1-9]|1[0-2])[./](20[2-9]\d)\b", q)
        if m:
            month = int(m.group(1))
            year = int(m.group(2))

    # 2. Text month names (e.g. "März 2026", "march 2026")
    if not (year and month):
        year_m = re.search(r"\b(20[2-9]\d)\b", q)
        year = int(year_m.group(1)) if year_m else None
        for m_name, m_num in _MONTH_MAP.items():
            if m_name in q:
                month = m_num
                break

    # 3. Year-only fallback (no month found)
    if not year:
        year_m = re.search(r"\b(20[2-9]\d)\b", q)
        year = int(year_m.group(1)) if year_m else None

    # Validate month range
    if month and not (1 <= month <= 12):
        month = None

    if year and month:
        last_day = monthrange(year, month)[1]
        filters["date_from"] = f"{year}-{month:02d}-01"
        filters["date_to"] = f"{year}-{month:02d}-{last_day}"
    elif year:
        filters["date_from"] = f"{year}-01-01"
        filters["date_to"] = f"{year}-12-31"

    # Document type → filename pattern (use the matched word verbatim for ILIKE)
    for word in _DOC_TYPE_WORDS:
        if word in q:
            filters["name_pattern"] = word
            break

    return filters


def fetch_filtered_document_ids(
    user_id: str,
    pool_id: Optional[str],
    chat_id: Optional[str],
    filters: Dict[str, Any],
) -> List[str]:
    """Query app_documents using date/name filters and return matching IDs (ready only).

    Returns an empty list when no filters are supplied — callers fall back to
    normal vector retrieval in that case.
    """
    if not filters:
        return []

    q = (
        supabase.table("app_documents")
        .select("id")
        .eq("status", "ready")
    )

    if pool_id is not None:
        q = q.eq("pool_id", pool_id)
    elif chat_id is not None:
        q = q.eq("user_id", user_id).eq("chat_id", chat_id).is_("pool_id", "null")
    else:
        q = q.eq("user_id", user_id).is_("pool_id", "null").is_("chat_id", "null")

    if "date_from" in filters:
        q = q.gte("created_at", filters["date_from"])
    if "date_to" in filters:
        q = q.lte("created_at", filters["date_to"] + "T23:59:59")
    if "name_pattern" in filters:
        q = q.ilike("filename", f"%{filters['name_pattern']}%")

    result = q.execute()
    ids = [row["id"] for row in (result.data or [])]
    logger.info("Document filter %s → %d matching doc(s)", filters, len(ids))
    return ids


def fetch_chunks_for_documents(document_ids: List[str]) -> List[Dict[str, Any]]:
    """Fetch up to _MAX_TARGETED_CHUNKS chunks from the given documents.

    Results are ordered by (document_id, chunk_index) so the LLM reads each
    document sequentially.  All chunks get similarity=1.0 — they're relevant
    by construction (the caller already filtered by metadata).
    """
    if not document_ids:
        return []

    rows_result = (
        supabase.table("app_document_chunks")
        .select("id, document_id, chunk_index, content, token_count, page_number")
        .in_("document_id", document_ids)
        .order("document_id")
        .order("chunk_index")
        .limit(_MAX_TARGETED_CHUNKS)
        .execute()
    )
    rows = rows_result.data or []
    if not rows:
        return []

    # Batch-fetch filenames
    unique_doc_ids = list({r["document_id"] for r in rows})
    fn_result = (
        supabase.table("app_documents")
        .select("id, filename")
        .in_("id", unique_doc_ids)
        .execute()
    )
    filename_map = {d["id"]: d["filename"] for d in (fn_result.data or [])}

    return [
        {
            "id": row["id"],
            "document_id": row["document_id"],
            "chunk_index": row["chunk_index"],
            "content": row["content"],
            "token_count": row.get("token_count", 0),
            "page_number": row.get("page_number"),
            "filename": filename_map.get(row["document_id"], "unknown"),
            "similarity": 1.0,
        }
        for row in rows
    ]


def detect_query_intent(query: str) -> str:
    """Return a coarse retrieval intent: summary, listing, or fact."""
    q = (query or "").lower()
    if any(keyword in q for keyword in SUMMARY_QUERY_KEYWORDS):
        return "summary"
    if any(keyword in q for keyword in LISTING_QUERY_KEYWORDS):
        return "listing"
    return "fact"


def should_use_image_retrieval(query: str, image_mode: str) -> bool:
    """Decide whether image retrieval should run for a query."""
    mode = (image_mode or "auto").lower()
    if mode == "off":
        return False
    if mode == "on":
        return True

    q = (query or "").lower()
    return any(keyword in q for keyword in IMAGE_QUERY_KEYWORDS)


async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Generate embeddings via OpenAI or Azure OpenAI, based on admin RAG settings."""
    from . import admin as admin_crud  # noqa: PLC0415
    rag_settings = admin_crud.get_rag_settings()
    provider = rag_settings.get("embedding_provider", "openai")

    if provider == "azure":
        api_key = providers_mod.get_api_key("azure")
        if not api_key:
            raise RuntimeError("Azure API key not configured — required for embeddings")
        config = providers_mod.get_provider_config("azure")
        endpoint = config.get("endpoint_url", "").rstrip("/")
        api_version = config.get("api_version", "2024-02-01")
        deployment = rag_settings.get("embedding_deployment", "").strip()
        if not deployment:
            raise RuntimeError("Azure embedding deployment name not configured in RAG settings")
        url = f"{endpoint}/openai/deployments/{deployment}/embeddings?api-version={api_version}"
        headers = {"api-key": api_key, "Content-Type": "application/json"}
        body: Dict[str, Any] = {"input": texts, "dimensions": EMBEDDING_DIMENSIONS}
    else:  # openai (default)
        api_key = providers_mod.get_api_key("openai")
        if not api_key:
            raise RuntimeError("OpenAI API key not configured — required for embeddings")
        url = "https://api.openai.com/v1/embeddings"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        body = {"model": EMBEDDING_MODEL, "input": texts, "dimensions": EMBEDDING_DIMENSIONS}

    logger.info("Generating embeddings via provider=%s (n=%d)", provider, len(texts))
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            # Audit #57/#255 sibling site: don't echo raw provider error body
            # to callers (the embedding error eventually surfaces in user-visible
            # upload/RAG flows). Log full body server-side for ops triage.
            logger.warning(
                "Embedding API error provider=%s status=%s body=%r",
                provider, resp.status_code, resp.text[:500],
            )
            raise RuntimeError(f"Embedding API error ({provider}) {resp.status_code}")
        data = resp.json()

    return [item["embedding"] for item in data["data"]]


def _estimate_tokens(text: str) -> int:
    """Exact token count via tiktoken (cl100k_base)."""
    return max(1, _tok(text))


async def process_document(document_id: str, text: str, user_id: str) -> Tuple[int, int]:
    """Chunk text, generate embeddings, store in DB. Returns (chunk_count, total_tokens)."""
    chunk_pairs = chunk_text(text)  # List[Tuple[str, Optional[int]]]
    if not chunk_pairs:
        documents_mod.update_document_status(document_id, "error", error_message="No text extracted")
        return 0, 0

    # Phase 4.2 — Contextual Retrieval: optionally prefix each chunk with LLM-generated context
    from . import admin as admin_crud  # noqa: PLC0415
    rag_settings = admin_crud.get_rag_settings()
    if rag_settings.get("contextual_retrieval_enabled"):
        cr_model = str(rag_settings.get("contextual_retrieval_model", "claude-haiku-4-5-20251001")).strip() or "claude-haiku-4-5-20251001"
        try:
            logger.info(
                "Kontextuelles Retrieval: %d Chunks werden angereichert (model=%s, doc=%s)",
                len(chunk_pairs), cr_model, document_id,
            )
            chunk_pairs = await _apply_contextual_retrieval(chunk_pairs, document_text=text, model=cr_model)
        except Exception as e:
            logger.warning("Kontextuelles Retrieval fehlgeschlagen, verwende einfache Chunks: %s", e)

    chunk_texts_only = [c for c, _ in chunk_pairs]
    try:
        embeddings = await generate_embeddings(chunk_texts_only)
    except Exception as e:
        documents_mod.update_document_status(document_id, "error", error_message=str(e))
        raise

    total_tokens = 0
    rows = []
    for i, ((chunk, page_num), embedding) in enumerate(zip(chunk_pairs, embeddings)):
        token_count = _estimate_tokens(chunk)
        total_tokens += token_count
        rows.append({
            "document_id": document_id,
            "chunk_index": i,
            "content": chunk,
            "token_count": token_count,
            "page_number": page_num,
            "embedding": str(embedding),
        })

    # Batch insert chunks
    supabase.table("app_document_chunks").insert(rows).execute()

    documents_mod.update_document_status(document_id, "ready", chunk_count=len(chunk_pairs))

    # Record embedding token usage
    from . import admin as admin_crud  # noqa: PLC0415
    _embedding_provider = admin_crud.get_rag_settings().get("embedding_provider", "openai")
    record_usage(
        user_id=user_id,
        chat_id=None,
        model=EMBEDDING_MODEL,
        provider=_embedding_provider,
        prompt_tokens=total_tokens,
        completion_tokens=0,
    )

    return len(chunk_pairs), total_tokens


def _rpc_chunks(
    embedding: List[float],
    user_id: str,
    chat_id: Optional[str],
    pool_id: Optional[str],
    top_k: int,
    threshold: float,
) -> List[Dict[str, Any]]:
    """Execute match_document_chunks RPC with a pre-computed embedding."""
    params: Dict[str, Any] = {
        "query_embedding": str(embedding),
        "match_user_id": user_id,
        "match_threshold": threshold,
        "match_count": top_k,
    }
    if chat_id is not None:
        params["match_chat_id"] = chat_id
    if pool_id is not None:
        params["match_pool_id"] = pool_id
    result = supabase.rpc("match_document_chunks", params).execute()
    return result.data or []


async def search_similar_chunks(
    query: str,
    user_id: str,
    chat_id: Optional[str] = None,
    pool_id: Optional[str] = None,
    top_k: int = RAG_TOP_K,
    threshold: float = RAG_SIMILARITY_THRESHOLD,
) -> List[Dict[str, Any]]:
    """Search for similar chunks using the Supabase RPC."""
    embeddings = await generate_embeddings([query])
    return _rpc_chunks(embeddings[0], user_id, chat_id, pool_id, top_k, threshold)


def _bm25_search_chunks(
    query: str,
    user_id: str,
    chat_id: Optional[str],
    pool_id: Optional[str],
    limit: int,
) -> List[Dict[str, Any]]:
    """BM25-style keyword search via PostgreSQL FTS (ts_rank_cd normalization 32).

    Calls the keyword_search_chunks RPC which uses a GENERATED tsvector column
    with a GIN index and the 'german' dictionary (handles stemming).
    Scope mirrors match_document_chunks: conversation / pool / global.
    """
    if not query or not query.strip():
        return []

    params: Dict[str, Any] = {
        "query_text": query,
        "match_user_id": user_id,
        "match_count": limit,
    }
    if chat_id is not None:
        params["match_chat_id"] = chat_id
    if pool_id is not None:
        params["match_pool_id"] = pool_id

    try:
        result = supabase.rpc("keyword_search_chunks", params).execute()
        rows = result.data or []
    except Exception as e:
        logger.warning("BM25 keyword search failed: %s", e)
        return []

    # Normalise field name so downstream code uses the common 'similarity' key
    for row in rows:
        row["similarity"] = float(row.pop("bm25_score", 0.01))
    return rows


def _reciprocal_rank_fusion(
    vector_chunks: List[Dict[str, Any]],
    bm25_chunks: List[Dict[str, Any]],
    k: int = 60,
) -> List[Dict[str, Any]]:
    """Merge two ranked lists with Reciprocal Rank Fusion.

    Score = Σ 1 / (k + rank)  summed across both lists.
    k=60 is the value from the original RRF paper (Cormack 2009).
    Chunks that appear in both lists get a combined score boost.
    """
    scores: Dict[str, float] = {}
    chunk_map: Dict[str, Dict] = {}

    for rank, chunk in enumerate(vector_chunks):
        cid = chunk.get("id", "")
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
        chunk_map[cid] = chunk

    for rank, chunk in enumerate(bm25_chunks):
        cid = chunk.get("id", "")
        scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank + 1)
        if cid not in chunk_map:
            chunk_map[cid] = chunk

    sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)
    merged = [chunk_map[cid] for cid in sorted_ids]
    for chunk in merged:
        chunk["rrf_score"] = scores[chunk.get("id", "")]
    return merged


async def _search_chunks_hybrid(
    query: str,
    user_id: str,
    chat_id: str,
    top_k: int,
    threshold: float,
) -> List[Dict[str, Any]]:
    """Hybrid chunk search for conversation scope: vector + BM25, merged via RRF.

    Phase 1 (vector): pgvector cosine similarity search scoped to the conversation.
    Phase 2 (BM25):   PostgreSQL FTS (ts_rank_cd, 'german' dictionary) for the same
                      scope — catches exact terms, abbreviations and section titles
                      that rank too low in vector space.
    Merging:          Reciprocal Rank Fusion (k=60) so chunks appearing in both
                      lists get a combined score boost.
    """
    embeddings = await generate_embeddings([query])
    embedding = embeddings[0]

    # Phase 1 — vector search (conversation scope)
    vector_chunks = _rpc_chunks(embedding, user_id, chat_id, None, top_k, threshold)

    # Phase 2 — BM25 keyword search (conversation scope)
    bm25_chunks = _bm25_search_chunks(
        query=query,
        user_id=user_id,
        chat_id=chat_id,
        pool_id=None,
        limit=max(4, top_k),
    )

    if bm25_chunks:
        logger.info(
            "Hybrid (conv): vector=%d bm25=%d → RRF merge",
            len(vector_chunks), len(bm25_chunks),
        )
        return _reciprocal_rank_fusion(vector_chunks, bm25_chunks)

    return vector_chunks


async def retrieve_chunks_with_strategy(
    query: str,
    user_id: str,
    chat_id: Optional[str] = None,
    pool_id: Optional[str] = None,
    intent: str = "fact",
    rerank_settings: Optional[Dict[str, Any]] = None,
    document_filters: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Adaptive retrieval with fallback passes for generic/summary prompts.

    For conversation scope all documents are directly relevant, so we retrieve
    up to 50 chunks with no similarity threshold. This guarantees completeness
    even when specific section headings score poorly in vector space.
    Cohere reranker then selects the best subset.

    Pool/global scope uses threshold-filtered plans (may have many unrelated docs).

    When document_filters are supplied and the intent is summary or listing,
    targeted retrieval is attempted first: all chunks from matching documents are
    fetched in document order, bypassing vector search.  Falls back to normal
    retrieval when no documents match the filter.
    """
    # Targeted retrieval for all intents with metadata filters
    if document_filters and intent in ("summary", "listing", "fact"):
        filtered_ids = fetch_filtered_document_ids(user_id, pool_id, chat_id, document_filters)
        if filtered_ids:
            chunks = fetch_chunks_for_documents(filtered_ids)
            if chunks:
                logger.info(
                    "Targeted retrieval: %d chunks from %d doc(s) (filters=%s)",
                    len(chunks), len(filtered_ids), document_filters,
                )
                return chunks
            logger.warning(
                "Targeted retrieval: %d doc(s) matched but yielded no chunks — falling back",
                len(filtered_ids),
            )

    plans: List[Tuple[int, float]]

    if chat_id is not None:
        # Conversation: cast a wide net — retrieve all chunks, let Cohere rank
        plans = [(50, 0.0)]
    elif intent == "summary":
        plans = [
            (max(RAG_TOP_K, 8), max(RAG_SIMILARITY_THRESHOLD * 0.7, 0.08)),
            (max(RAG_TOP_K * 2, 12), 0.0),
        ]
    else:
        plans = [
            (RAG_TOP_K, RAG_SIMILARITY_THRESHOLD),
            (max(RAG_TOP_K + 3, 8), max(RAG_SIMILARITY_THRESHOLD * 0.6, 0.08)),
        ]

    for top_k, threshold in plans:
        if chat_id is not None:
            chunks = await _search_chunks_hybrid(
                query=query,
                user_id=user_id,
                chat_id=chat_id,
                top_k=top_k,
                threshold=threshold,
            )
        else:
            # Vector search (pool / global scope)
            chunks = await search_similar_chunks(
                query=query,
                user_id=user_id,
                chat_id=None,
                pool_id=pool_id,
                top_k=top_k,
                threshold=threshold,
            )
            # BM25 supplement + RRF (pool / global scope)
            bm25_chunks = _bm25_search_chunks(
                query=query,
                user_id=user_id,
                chat_id=None,
                pool_id=pool_id,
                limit=max(4, top_k),
            )
            if bm25_chunks:
                logger.info(
                    "Hybrid (pool/global): vector=%d bm25=%d → RRF merge",
                    len(chunks), len(bm25_chunks),
                )
                chunks = _reciprocal_rank_fusion(chunks, bm25_chunks)
        logger.info(
            "RAG search: %d chunks found (chat_id=%s, pool_id=%s, threshold=%.2f)",
            len(chunks),
            chat_id,
            pool_id,
            threshold,
        )
        if chunks:
            return await _apply_optional_rerank(query, chunks, rerank_settings)

    logger.warning(
        "RAG: no chunks found for query (chat_id=%s, pool_id=%s)", chat_id, pool_id
    )
    return []


async def _apply_optional_rerank(
    query: str,
    chunks: List[Dict[str, Any]],
    rerank_settings: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    settings = rerank_settings or {}
    enabled = bool(settings.get("rerank_enabled", False))
    if not enabled or not chunks:
        # Without reranking, sort chunks by the strongest available score —
        # RRF beats raw similarity because BM25 hits carry their BM25 score
        # in the same `similarity` field (mapped at _bm25_search_chunks)
        # which has a very different scale from vector cosine similarity.
        # Sorting purely by `similarity` therefore silently undoes the RRF
        # ranking whenever BM25 contributed. document_id + chunk_index
        # break ties for determinism.
        return sorted(
            chunks,
            key=lambda c: (
                -float(c.get("rrf_score") or c.get("rerank_score") or c.get("similarity", 0.0) or 0.0),
                c.get("document_id", ""),
                c.get("chunk_index", 0),
            ),
        )

    candidates = max(5, min(100, int(settings.get("rerank_candidates", 50))))
    top_n = max(1, min(30, int(settings.get("rerank_top_n", 6))))
    model = str(settings.get("rerank_model", "rerank-v3.5")).strip() or "rerank-v3.5"
    if top_n > candidates:
        top_n = candidates

    key = providers_mod.get_api_key("cohere")
    if not key:
        logger.warning("Rerank enabled but no Cohere key configured; using vector ranking only")
        return chunks[:top_n]

    subset = chunks[:candidates]
    reranked = await _cohere_rerank(query, subset, key, model=model, top_n=top_n)
    return reranked or subset[:top_n]


async def _cohere_rerank(
    query: str,
    chunks: List[Dict[str, Any]],
    api_key: str,
    model: str,
    top_n: int,
) -> List[Dict[str, Any]]:
    if not chunks:
        return []

    documents = [str(c.get("content", ""))[:8000] for c in chunks]
    payload = {
        "model": model,
        "query": query,
        "documents": documents,
        "top_n": min(top_n, len(documents)),
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post("https://api.cohere.com/v2/rerank", headers=headers, json=payload)
        if resp.status_code != 200:
            logger.warning("Cohere rerank failed with HTTP %s: %s", resp.status_code, resp.text[:300])
            return []
        data = resp.json()
        results = data.get("results", []) or []
        reranked: List[Dict[str, Any]] = []
        for r in results:
            idx = r.get("index")
            if idx is None or idx < 0 or idx >= len(chunks):
                continue
            chunk = dict(chunks[idx])
            if "relevance_score" in r:
                chunk["rerank_score"] = float(r["relevance_score"])
            reranked.append(chunk)
        return reranked
    except Exception as e:
        logger.warning("Cohere rerank exception: %s", e)
        return []


def _rpc_assets(
    embedding: List[float],
    user_id: str,
    chat_id: Optional[str],
    pool_id: Optional[str],
    top_k: int,
    threshold: float,
) -> List[Dict[str, Any]]:
    """Execute match_document_assets RPC with a pre-computed embedding."""
    params: Dict[str, Any] = {
        "query_embedding": str(embedding),
        "match_user_id": user_id,
        "match_threshold": threshold,
        "match_count": top_k,
    }
    if chat_id is not None:
        params["match_chat_id"] = chat_id
    if pool_id is not None:
        params["match_pool_id"] = pool_id
    result = supabase.rpc("match_document_assets", params).execute()
    return result.data or []


async def search_similar_assets(
    query: str,
    user_id: str,
    chat_id: Optional[str] = None,
    pool_id: Optional[str] = None,
    top_k: int = RAG_TOP_K,
    threshold: float = RAG_SIMILARITY_THRESHOLD,
) -> List[Dict[str, Any]]:
    """Search for similar image assets (if multimodal schema is available).

    For conversation scope (chat_id provided) uses the same two-phase approach
    as chunk retrieval: conversation-specific assets first, global supplement
    if needed.
    """
    try:
        embeddings = await generate_embeddings([query])
        embedding = embeddings[0]

        if chat_id is not None:
            # Phase 1: conversation-specific assets
            conv_assets = _rpc_assets(embedding, user_id, chat_id, None, top_k, threshold)
            if len(conv_assets) >= top_k:
                return conv_assets
            # Phase 2: global supplement
            remaining = top_k - len(conv_assets)
            global_assets = _rpc_assets(embedding, user_id, None, None, remaining, threshold)
            seen = {a["document_id"] for a in conv_assets}
            global_assets = [a for a in global_assets if a["document_id"] not in seen]
            return conv_assets + global_assets[:remaining]

        # Pool or global-only path
        return _rpc_assets(embedding, user_id, chat_id, pool_id, top_k, threshold)

    except Exception as e:
        # Schema might not be migrated yet in some environments.
        logger.info("Image asset retrieval unavailable: %s", e)
        return []


async def rechunk_all_documents(
    progress_callback: Optional[Any] = None,
) -> Dict[str, int]:
    """Re-chunk all existing documents with the current chunker.

    Deletes old chunks from app_document_chunks and re-runs process_document()
    for every document that has extracted_text. Does NOT re-run OCR.

    progress_callback(done, total) is called after each document so callers
    can track live progress (e.g. for a status endpoint).

    Returns a dict with processed / failed / skipped / total counts.
    """
    result = (
        supabase.table("app_documents")
        .select("id, user_id, filename, extracted_text")
        .not_.is_("extracted_text", "null")
        .neq("extracted_text", "")
        .execute()
    )
    docs = result.data or []
    processed = 0
    failed = 0
    skipped = 0

    if progress_callback:
        progress_callback(0, len(docs))

    for doc in docs:
        doc_id = doc["id"]
        text = (doc.get("extracted_text") or "").strip()
        user_id = doc["user_id"]
        filename = doc.get("filename", doc_id)

        if not text:
            skipped += 1
        else:
            try:
                supabase.table("app_document_chunks").delete().eq("document_id", doc_id).execute()
                documents_mod.update_document_status(doc_id, "processing")
                await process_document(doc_id, text, user_id)
                processed += 1
                logger.info("Re-chunked: %s (%s)", filename, doc_id)
            except asyncio.CancelledError:
                # In-flight document was mid-rewrite when the outer task was
                # cancelled (uvicorn graceful-shutdown timeout). Chunks have
                # already been deleted and status set to 'processing'; without
                # this branch the document would stay at 'processing' with zero
                # chunks forever (invisible to RAG). Mark it 'error' so it can
                # be recognised + retried, then re-raise so the outer loop also
                # exits cleanly.
                logger.warning("Re-chunk cancelled mid-document for %s (%s)", filename, doc_id)
                try:
                    documents_mod.update_document_status(doc_id, "error", error_message="Re-chunk: cancelled")
                except Exception as cleanup_err:
                    logger.error("Failed to mark cancelled doc %s as error: %s", doc_id, cleanup_err)
                raise
            except Exception as e:
                logger.error("Re-chunk failed for %s (%s): %s", filename, doc_id, e, exc_info=True)
                documents_mod.update_document_status(doc_id, "error", error_message=f"Re-chunk: {e}")
                failed += 1

        if progress_callback:
            progress_callback(processed + failed + skipped, len(docs))

    return {"processed": processed, "failed": failed, "skipped": skipped, "total": len(docs)}


async def enrich_with_neighbors(
    chunks: List[Dict[str, Any]],
    top_n: int = 3,
) -> List[Dict[str, Any]]:
    """Fügt ±1 Nachbar-Chunks für die Top-N-Treffer hinzu (Phase 5.3).

    Stellt abgeschnittenen Kontext an Chunk-Grenzen wieder her, ohne Schema-Änderungen
    zu erfordern. Nur die Top-N-Chunks (nach Ähnlichkeit) werden erweitert, um die
    Anzahl der DB-Abfragen zu begrenzen.

    Rückgabe sortiert nach Ähnlichkeit absteigend (mit document_id + chunk_index
    als Tiebreaker) — relevanteste Chunks aus beliebigem Dokument zuerst, damit
    das Token-Budget in `build_rag_context()` mehrere Dokumente fair berücksichtigt.
    """
    if not chunks:
        return chunks

    sorted_by_sim = sorted(chunks, key=lambda c: c.get("similarity", 0.0), reverse=True)
    top_chunks = sorted_by_sim[:top_n]

    existing_ids: set = {c.get("id") for c in chunks}
    neighbor_chunks: List[Dict[str, Any]] = []

    for chunk in top_chunks:
        doc_id = chunk.get("document_id")
        idx = chunk.get("chunk_index", 0)
        if not doc_id:
            continue

        for neighbor_idx in (idx - 1, idx + 1):
            if neighbor_idx < 0:
                continue
            try:
                result = (
                    supabase.table("app_document_chunks")
                    .select("id, document_id, chunk_index, content, page_number, token_count")
                    .eq("document_id", doc_id)
                    .eq("chunk_index", neighbor_idx)
                    .limit(1)
                    .execute()
                )
                if result.data:
                    neighbor = dict(result.data[0])
                    if neighbor["id"] in existing_ids:
                        continue
                    neighbor["filename"] = chunk.get("filename", "")
                    # Slightly lower score — marks it as adjacent context, not a primary hit
                    neighbor["similarity"] = chunk.get("similarity", 0.0) * 0.85
                    neighbor["is_neighbor"] = True
                    neighbor_chunks.append(neighbor)
                    existing_ids.add(neighbor["id"])
            except Exception as e:
                logger.warning(
                    "Nachbar-Chunk-Abruf fehlgeschlagen (doc=%s, idx=%d): %s",
                    doc_id, neighbor_idx, e,
                )

    if not neighbor_chunks:
        return chunks

    combined = chunks + neighbor_chunks
    return sorted(
        combined,
        key=lambda c: (
            -float(c.get("similarity", 0.0)),
            c.get("document_id", ""),
            c.get("chunk_index", 0),
        ),
    )


async def _generate_chunk_context(doc_summary: str, chunk_content: str, model: str) -> str:
    """Generiert einen 1-Satz-Kontext für einen Chunk via LLM (Phase 4.2).

    Verortet den Chunk im Gesamtdokument, damit das Embedding-Modell auch ohne
    umgebende Abschnitte den richtigen semantischen Raum findet.
    """
    from .llm import call_llm  # lazy import — avoids circular dependency at module load

    prompt = (
        "Schreibe einen einzigen Satz (max. 30 Wörter), der beschreibt, woher dieser "
        "Abschnitt stammt und was er im Gesamtkontext des Dokuments darstellt. "
        "Antworte NUR mit diesem Satz, ohne Einleitung oder Kommentar.\n\n"
        f"Dokumentzusammenfassung: {doc_summary[:500]}\n\n"
        f"Abschnitt:\n{chunk_content[:800]}"
    )
    try:
        result = await call_llm([{"role": "user", "content": prompt}], model, temperature=0.1)
        sentence = result["content"].strip()
        return f"[Kontext: {sentence}]\n\n" if sentence else ""
    except Exception as e:
        logger.warning("Kontextgenerierung für Chunk fehlgeschlagen: %s", e)
        return ""


async def _apply_contextual_retrieval(
    chunk_pairs: List[Tuple[str, Optional[int]]],
    document_text: str,
    model: str,
) -> List[Tuple[str, Optional[int]]]:
    """Stellt jedem Chunk einen LLM-generierten Kontext voran (Phase 4.2).

    Alle Chunks eines Dokuments werden parallel verarbeitet, um die Latenz minimal
    zu halten. Der Kontext wird sowohl dem gespeicherten Chunk-Text als auch dem
    Embedding vorangestellt (Konsistenz zwischen Retrieval und Anzeige).
    """
    import asyncio  # noqa: PLC0415

    clean_text = re.sub(r"<!-- page:\d+ -->\n?", "", document_text).strip()
    doc_summary = clean_text[:1200]

    async def _enrich(pair: Tuple[str, Optional[int]]) -> Tuple[str, Optional[int]]:
        text, page = pair
        prefix = await _generate_chunk_context(doc_summary, text, model)
        return (prefix + text if prefix else text, page)

    enriched = await asyncio.gather(*[_enrich(p) for p in chunk_pairs])
    return list(enriched)


def extract_section_path(content: str) -> str:
    """Extrahiert den Abschnitts-Breadcrumb aus dem Anfang eines Chunks.

    Der Chunker fügt Heading-Stacks als erste Zeile ein, z. B.:
    '## 3. Projektrollen > ### 3.1 Projektleiter'
    Diese Funktion gibt diesen Pfad zurück, damit er in Quellenangaben
    und im rag_sources-Array des Frontends angezeigt werden kann.
    """
    if not content:
        return ""
    first_block = content.split("\n\n", 1)[0].strip()
    # Breadcrumb beginnt mit '#' oder enthält ' > ' (Trennzeichen im Heading-Stack)
    if first_block.startswith("#") or (" > " in first_block and "#" in first_block):
        return first_block
    return ""


def apply_relevance_gate(
    chunks: List[Dict[str, Any]],
    threshold: float = RAG_RELEVANCE_GATE,
) -> List[Dict[str, Any]]:
    """Verwirft alle Chunks, wenn der beste Ähnlichkeitswert unter der Schwelle liegt.

    Verhindert, dass irrelevanter Dokumentkontext in den Prompt eingeschleust wird,
    wenn der Nutzer etwas fragt, das nichts mit den hochgeladenen Dokumenten zu tun hat.
    Gibt eine leere Liste zurück, wenn kein Chunk die Relevanzschranke überschreitet.
    """
    if not chunks:
        return chunks
    max_sim = max(c.get("similarity", 0.0) for c in chunks)
    if max_sim < threshold:
        logger.info(
            "RAG-Relevanzschranke: bester Treffer %.3f < Schwelle %.3f — %d Chunks verworfen",
            max_sim, threshold, len(chunks),
        )
        return []
    return chunks


def build_rag_context(
    chunks: List[Dict[str, Any]],
    max_tokens: int = 6000,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Formatiert abgerufene Chunks als XML-Dokumentenblock für das LLM.

    Verwendet XML-Tags gemäß Anthropic-Prompting-Best-Practices. Jede Quelle enthält
    Dateiname, Seitennummer und Abschnittspfad. Das Token-Budget (max_tokens) verhindert,
    dass RAG-Kontext das Kontextfenster dominiert (Phase 7.1 + 7.2).

    Rückgabe: Tupel (xml_text, surviving_chunks). `surviving_chunks` enthält in
    Original-Reihenfolge nur die Chunks, die ins Token-Budget gepasst haben —
    Aufrufer müssen daraus `rag_sources` aufbauen, damit Quellenangaben mit dem
    übereinstimmen, was das LLM wirklich gesehen hat.
    """
    if not chunks:
        return "", []

    doc_parts: List[str] = []
    surviving: List[Dict[str, Any]] = []
    token_budget = max_tokens
    skipped = 0

    for i, chunk in enumerate(chunks, 1):
        filename = chunk.get("filename", "unknown")
        similarity = chunk.get("similarity", 0)
        content = chunk.get("content", "")
        page = chunk.get("page_number")
        section = extract_section_path(content)

        source_parts = [filename]
        if page is not None:
            source_parts.append(f"Seite {page}")
        if section:
            source_parts.append(section)
        source_line = " | ".join(source_parts)

        doc_block = (
            f'  <document index="{i}">\n'
            f'    <source>{source_line} (Relevanz: {similarity:.0%})</source>\n'
            f'    <content>{content}</content>\n'
            f'  </document>'
        )

        block_tokens = _tok(doc_block)
        if block_tokens > token_budget:
            skipped += 1
            continue

        doc_parts.append(doc_block)
        surviving.append(chunk)
        token_budget -= block_tokens

    if not doc_parts:
        return "", []

    if skipped:
        logger.info(
            "RAG context: %d chunk(s) ausgelassen (Token-Budget erschöpft, max=%d)",
            skipped, max_tokens,
        )

    # phase3=true Phase 3 observability — temporary; remove or gate behind
    # log-level=DEBUG once verification matrix in docs/tests/phase3/ is signed off.
    # Lets us confirm at runtime that the multi-doc-bias fix and the RRF sort key
    # are surfacing chunks across multiple documents.
    logger.info(
        "phase3=true RAG surviving chunks (n=%d): %s",
        len(surviving),
        [
            {
                "id": c.get("id"),
                "doc": c.get("document_id"),
                "idx": c.get("chunk_index"),
                "sim": round(float(c.get("similarity", 0.0) or 0.0), 4),
                "rrf": round(float(c.get("rrf_score", 0.0) or 0.0), 4),
                "rerank": round(float(c.get("rerank_score", 0.0) or 0.0), 4),
                "tok": c.get("token_count"),
                "neighbor": bool(c.get("is_neighbor", False)),
            }
            for c in surviving
        ],
    )

    return "<documents>\n" + "\n".join(doc_parts) + "\n</documents>", surviving


def build_image_rag_context(assets: List[Dict[str, Any]]) -> str:
    """Format image asset hits into a compact context string for the LLM."""
    if not assets:
        return ""

    parts = ["[Relevant image/document visual context:]"]
    for i, asset in enumerate(assets, 1):
        filename = asset.get("filename", "unknown")
        page = asset.get("page_number")
        similarity = asset.get("similarity", 0)
        caption = (asset.get("caption") or "").strip()
        page_info = f", page {page}" if page is not None else ""
        parts.append(
            f"\n--- Visual Source {i}: {filename}{page_info} (relevance: {similarity:.0%}) ---\n"
            f"{caption or 'No caption available.'}"
        )

    return "\n".join(parts)
