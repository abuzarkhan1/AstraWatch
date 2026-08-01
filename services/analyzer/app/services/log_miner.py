"""Log mining for the analyzer.

The audit (DEEP_AUDIT_AND_IMPLEMENTATION_PLAN.md) found that logs were ingested
and stored but never analyzed. This module gives the analyzer a real
content-level view of the log stream: it consumes `raw-logs`, keeps a small
per-(tenant, service) buffer, and produces structured `LogEvidence` — error
keywords, stack traces, HTTP 4xx/5xx counts, log-level spikes — that is attached
to anomaly events so incidents and emails carry the actual error, not a
hardcoded diagnosis.
"""
import logging
import re
import threading
import time
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Buffer window: keep ~5 minutes of logs per (tenant, service) key.
LOG_WINDOW_SECONDS = 300
MAX_ENTRIES_PER_SERVICE = 2000

# Signals we mine from log lines.
ERROR_KEYWORDS = [
    "exception", "error", "failed", "fatal", "panic", "timeout", "timed out",
    "connection refused", "out of memory", "oom", "max_connections", "crash",
    "unreachable", "null pointer", "stacktrace", "stack trace",
]
HTTP_ERROR_PATTERN = re.compile(r"\b(4\d\d|5\d\d)\b")
EXCEPTION_PATTERN = re.compile(
    r"(?:^|\s)([\w.$]+(?:Exception|Error|Fatal|Panic|Abort))\b"
)
STACK_FRAME_PATTERN = re.compile(r"^\s*at\s+[\w.$]+\([\w$.]+:\d+\)$")


class _ServiceLogWindow:
    """Rolling window of recent log entries for one (tenant, service) key."""

    __slots__ = ("entries",)

    def __init__(self) -> None:
        self.entries: deque[Dict[str, Any]] = deque()

    def push(self, entry: Dict[str, Any]) -> None:
        ts = entry.get("_ts", time.time())
        # Drop entries older than the window, comparing against the current head
        # (the window's oldest surviving entry).
        while self.entries and ts - self.entries[0]["_ts"] > LOG_WINDOW_SECONDS:
            self.entries.popleft()
        self.entries.append(entry)
        while len(self.entries) > MAX_ENTRIES_PER_SERVICE:
            self.entries.popleft()


class LogMiner:
    def __init__(self) -> None:
        self._windows: Dict[str, _ServiceLogWindow] = defaultdict(_ServiceLogWindow)
        self._lock = threading.RLock()

    def key(self, tenant_id: str, service_id: str) -> str:
        return f"{tenant_id}:{service_id}"

    def ingest(self, entry: Dict[str, Any]) -> None:
        """Record a raw-logs message into the per-service window."""
        tenant_id = entry.get("tenantId") or (entry.get("labels") or {}).get("tenantId") or "default"
        service_id = entry.get("serviceId") or "unknown"
        level = (entry.get("level") or "info").lower()
        message = entry.get("message") or ""

        ts = time.time()
        raw_ts = entry.get("ts")
        if raw_ts is not None:
            try:
                # Handles ISO strings and epoch-millis floats.
                if isinstance(raw_ts, str):
                    from datetime import datetime
                    parsed = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                    ts = parsed.timestamp()
                else:
                    ts = float(raw_ts) / 1000.0 if abs(float(raw_ts)) > 1e12 else float(raw_ts)
            except Exception:
                pass

        with self._lock:
            window = self._windows[self.key(tenant_id, service_id)]
            window.push({
                "_ts": ts,
                "level": level,
                "message": message,
                "traceId": entry.get("traceId") or "",
            })

    def evidence(self, tenant_id: str, service_id: str, window_seconds: int = 300) -> Optional[Dict[str, Any]]:
        """Build structured LogEvidence for (tenant, service) within the window.

        Returns None when there is nothing notable (no error-level signals).
        """
        with self._lock:
            window = self._windows.get(self.key(tenant_id, service_id))
            if window is None or not window.entries:
                return None

            now = time.time()
            recent = [e for e in window.entries if now - e["_ts"] <= window_seconds]
            if not recent:
                return None

            level_counts: Dict[str, int] = defaultdict(int)
            error_keywords: Dict[str, int] = defaultdict(int)
            exception_types: Dict[str, int] = defaultdict(int)
            http_4xx = 0
            http_5xx = 0
            stack_frames = 0
            sample_lines: List[str] = []
            trace_ids = set()

            for e in recent:
                level = e["level"]
                level_counts[level] += 1
                msg = e["message"]

                lowered = msg.lower()
                for kw in ERROR_KEYWORDS:
                    if kw in lowered:
                        error_keywords[kw] += 1

                for m in EXCEPTION_PATTERN.finditer(msg):
                    exception_types[m.group(1)] += 1

                for code in HTTP_ERROR_PATTERN.findall(msg):
                    if code.startswith("5"):
                        http_5xx += 1
                    elif code.startswith("4"):
                        http_4xx += 1

                if STACK_FRAME_PATTERN.match(msg):
                    stack_frames += 1

                if e["traceId"]:
                    trace_ids.add(e["traceId"])

                if len(sample_lines) < 5 and level in ("error", "warn", "critical", "fatal"):
                    sample_lines.append(msg[:300])

            has_errors = (level_counts.get("error", 0) + level_counts.get("critical", 0)
                          + level_counts.get("fatal", 0) + http_5xx) > 0
            if not has_errors and not error_keywords and not exception_types:
                return None

            top_errors = sorted(error_keywords.items(), key=lambda kv: kv[1], reverse=True)[:8]
            top_exceptions = sorted(exception_types.items(), key=lambda kv: kv[1], reverse=True)[:5]

            return {
                "serviceId": service_id,
                "tenantId": tenant_id,
                "windowSeconds": window_seconds,
                "levelCounts": dict(level_counts),
                "errorKeywords": [{"keyword": k, "count": c} for k, c in top_errors],
                "exceptionTypes": [{"type": k, "count": c} for k, c in top_exceptions],
                "http4xx": http_4xx,
                "http5xx": http_5xx,
                "stackFrames": stack_frames,
                "traceIds": sorted(trace_ids)[:10],
                "sampleLines": sample_lines,
            }


log_miner = LogMiner()
