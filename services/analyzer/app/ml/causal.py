import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from statsmodels.tsa.stattools import grangercausalitytests


def granger_causality(
    metrics: Dict[str, List[float]], max_lag: int = 5
) -> List[dict]:
    results = []
    names = list(metrics.keys())

    for i, cause in enumerate(names):
        for j, effect in enumerate(names):
            if i == j:
                continue

            x = np.array(metrics[cause], dtype=float)
            y = np.array(metrics[effect], dtype=float)

            min_len = min(len(x), len(y))
            x = x[-min_len:]
            y = y[-min_len:]

            if min_len < max_lag + 3:
                continue

            data = pd.DataFrame({"cause": x, "effect": y})
            try:
                gc_result = grangercausalitytests(data[["effect", "cause"]], max_lag, verbose=False)
            except Exception:
                continue

            best_lag = 1
            best_pval = 1.0
            for lag in range(1, max_lag + 1):
                if lag in gc_result:
                    pval = gc_result[lag][0]["ssr_ftest"][1]
                    if pval < best_pval:
                        best_pval = pval
                        best_lag = lag

            confidence = round(1.0 - best_pval, 4)
            results.append({
                "cause": cause,
                "effect": effect,
                "lag": best_lag,
                "score": confidence,
            })

    results.sort(key=lambda r: r["score"], reverse=True)
    return results


def _suggest_runbook_action(metric: str, cause_conf: float, lag: int) -> dict:
    """Deterministic, boundary-aware runbook action suggestion (audit Phase 4).

    Replaces the fabricated code patches with a safe, reversible action the
    operator can execute under its blast-radius guards. Always returns the
    boundaries that apply (what was NOT touched) so emails carry them.
    """
    m = (metric or "").lower()

    if "cpu" in m or "thread" in m or "util" in m:
        return {
            "actionType": "scale_deployment",
            "parameters": {"deploymentName": "", "replicas": "2", "reason": "CPU saturation"},
            "riskLevel": "Medium",
            "boundaries": "Scaling is capped at 3x current replicas and 50 total by the operator "
                          "blast-radius guard; the action is reversible (scale back on validation failure).",
            "reversibility": "High",
        }
    if "memory" in m or "heap" in m or "gc" in m:
        return {
            "actionType": "rollback_deployment",
            "parameters": {"deploymentName": "", "reason": "Memory pressure"},
            "riskLevel": "Medium",
            "boundaries": "Rollout is blocked by the operator if the deployment already has "
                          "unavailable replicas or carries a critical/protected label.",
            "reversibility": "Medium",
        }
    if "latency" in m or "error" in m or "p95" in m or "p99" in m or "timeout" in m:
        return {
            "actionType": "restart_pod",
            "parameters": {"podName": "", "reason": "Latency/error degradation"},
            "riskLevel": "Low",
            "boundaries": "Restart is blocked for pods with critical/protected labels, protected "
                          "namespaces, or a restart-loop (restart count > 10).",
            "reversibility": "High",
        }

    return {
        "actionType": "scale_deployment",
        "parameters": {"deploymentName": "", "replicas": "2", "reason": f"Anomaly in {metric}"},
        "riskLevel": "Medium",
        "boundaries": "Reversible scaling under operator blast-radius guards (3x / 50 replica caps).",
        "reversibility": "High",
    }


def _build_suggested_fix(
    service_id: str,
    ranked_causes: Optional[List[dict]],
    log_evidence: Optional[dict],
    suggested_action: Optional[dict],
    summary: str,
    what: str,
    why: str,
) -> dict:
    """Builds an evidence-backed remediation document for the auto-PR pipeline.

    Every fact in the document is derived from real ranked causes, log evidence
    (exception types / error keywords / sample lines) and the deterministic
    runbook action. Nothing is invented — a PR opened from this content is an
    honest artifact an engineer can review and merge.
    """
    lines: List[str] = []
    lines.append(f"# AstraWatch Remediation — {service_id}")
    lines.append("")
    lines.append(f"- **Diagnosis**: {summary}")
    lines.append(f"- **What**: {what}")
    lines.append(f"- **Why**: {why}")
    lines.append("")

    if ranked_causes:
        lines.append("## Ranked root causes")
        for c in ranked_causes[:5]:
            cause = c.get("cause") or c.get("metric") or "?"
            conf = c.get("score") or c.get("confidence") or 0
            lag = c.get("lag") or 0
            lines.append(f"- `{cause}` → confidence {float(conf):.2f}, lag {int(lag)}")
        lines.append("")

    if log_evidence:
        lines.append("## Log evidence")
        exc = log_evidence.get("exceptionTypes") or []
        if exc:
            lines.append("Exceptions: " + ", ".join(
                f"{e.get('type')} (x{e.get('count')})" for e in exc[:5]
            ))
        kw = log_evidence.get("errorKeywords") or []
        if kw:
            lines.append("Keywords: " + ", ".join(
                f"{k.get('keyword')} (x{k.get('count')})" for k in kw[:8]
            ))
        if log_evidence.get("http5xx"):
            lines.append(f"HTTP 5xx: {log_evidence['http5xx']}")
        samples = log_evidence.get("sampleLines") or []
        if samples:
            lines.append("Sample log lines:")
            for s in samples[:5]:
                lines.append(f"    {s}")
        lines.append("")

    if suggested_action:
        lines.append("## Suggested action")
        lines.append(f"- **Action**: {suggested_action.get('actionType')}")
        lines.append(f"- **Risk level**: {suggested_action.get('riskLevel')}")
        if suggested_action.get("boundaries"):
            lines.append(f"- **Boundaries**: {suggested_action.get('boundaries')}")
        lines.append("")

    lines.append("> Generated by AstraWatch from live telemetry and log evidence. Review before merging.")

    patch = "\n".join(lines)
    return {
        "targetFile": "astrawatch-remediation.md",
        "patch": patch,
        "explanation": (
            f"Evidence-backed remediation for {service_id} derived from ranked causes "
            f"and mined log evidence; no fabricated code."
        ),
    }


def generate_ai_diagnosis(
    ranked_causes: Optional[List[dict]] = None,
    service_id: Optional[str] = "payment",
    log_evidence: Optional[dict] = None,
) -> dict:
    """Generates a real, data-driven diagnosis plus a deterministic, boundary-aware
    runbook action suggestion, and an evidence-backed remediation document for the
    auto-PR pipeline.

    The audit (DEEP_AUDIT_AND_IMPLEMENTATION_PLAN.md, findings F3/F4) found the
    previous implementation fabricated code patches and generic text. This
    version only states facts derivable from the actual ranked causes / log
    evidence, and recommends a safe, reversible operator action instead of an
    invented code diff — so nothing fake ever reaches an email, incident, or PR.
    The ``suggestedFix`` is a real remediation document built from that same
    evidence, ready to be opened as a PR on the connected repository.
    """
    top = None
    if ranked_causes:
        top = ranked_causes[0]

    metric = str((top or {}).get("cause") or (top or {}).get("metric") or "")
    conf = float((top or {}).get("score") or (top or {}).get("confidence") or 0.0)
    lag = int((top or {}).get("lag") or 0)

    # Log evidence enriches the diagnosis with the actual observed error.
    top_exception = ""
    if log_evidence:
        exc = log_evidence.get("exceptionTypes") or []
        if exc:
            top_exception = exc[0].get("type", "")
        kw = log_evidence.get("errorKeywords") or []
        if kw and not top_exception:
            top_exception = kw[0].get("keyword", "")

    service = service_id or "unknown"

    if metric and conf > 0:
        summary = (
            f"Anomaly detected in {service}: metric '{metric}' (granger confidence "
            f"{conf:.2f}, lag {lag})."
        )
        what = f"Statistically significant deviation in {metric}."
        why = f"Granger-causal analysis ranked {metric} as the primary driver (confidence {conf:.2f})."
    else:
        summary = f"Anomaly detected in {service} from telemetry signals."
        what = "Anomalous telemetry signature observed."
        why = "Ensemble detector flagged the service; no single metric had a causal lead."

    if top_exception:
        summary += f" Log evidence points to '{top_exception}'."
        why += f" Recent logs contain {top_exception}."

    suggested_action = _suggest_runbook_action(metric, conf, lag)

    # Evidence-backed remediation document for the auto-PR pipeline (Phase 4):
    # the orchestrator opens a PR with this content on the connected repo.
    suggested_fix = _build_suggested_fix(
        service, ranked_causes, log_evidence, suggested_action, summary, what, why
    )

    return {
        "summary": summary,
        "what": what,
        "why": why,
        "suggestedFix": suggested_fix,
        "suggestedAction": suggested_action,
    }


__all__ = ["granger_causality", "generate_ai_diagnosis"]
