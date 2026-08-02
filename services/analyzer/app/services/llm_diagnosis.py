"""Optional LLM summarization layer for anomaly diagnoses.

Strategy gap 3: every major competitor ships an AI copilot. The deterministic
``generate_ai_diagnosis`` in ``app/ml/causal.py`` produces evidence-backed,
auditable text — which is the right core — but it reads mechanical. This module
adds an optional LLM prose pass on top of that evidence: structured facts in,
concise cited summary out. It is strictly additive and fails closed: if no
LLM endpoint is configured, the key is missing, or the call errors, the caller
keeps the deterministic diagnosis untouched.
"""

import os

import structlog

logger = structlog.get_logger(__name__)


async def llm_enhance(diagnosis: dict) -> dict:
    """Returns a copy of *diagnosis* with an LLM-written ``aiSummary`` added.

    Only called when ``LLM_API_KEY`` (and optionally ``LLM_ENDPOINT`` /
    ``LLM_MODEL``) are configured. Never raises: on any failure the original
    diagnosis is returned unchanged so the incident pipeline is not blocked.
    """
    api_key = os.getenv("LLM_API_KEY", "")
    if not api_key:
        return diagnosis

    endpoint = os.getenv("LLM_ENDPOINT", "https://api.openai.com/v1/chat/completions")
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    evidence = {
        "summary": diagnosis.get("summary", ""),
        "what": diagnosis.get("what", ""),
        "why": diagnosis.get("why", ""),
        "suggestedAction": diagnosis.get("suggestedAction"),
    }

    try:
        import httpx
        system = (
            "You are an SRE assistant inside AstraWatch. Summarize the anomaly "
            "diagnosis in 2-3 crisp sentences for an on-call engineer. State the "
            "cause, the evidence, and the suggested runbook action. Do not invent "
            "facts beyond the evidence. Keep it under 60 words."
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": str(evidence)},
                    ],
                    "temperature": 0.2,
                },
            )
            if resp.status_code != 200:
                logger.warning("LLM enhance returned HTTP %s", resp.status_code)
                return diagnosis
            data = resp.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if content:
                out = dict(diagnosis)
                out["aiSummary"] = content.strip()
                return out
    except Exception as e:  # noqa: BLE001 — fail closed, never break the pipeline
        logger.warning("LLM enhance failed, using deterministic diagnosis: %s", e)

    return diagnosis
