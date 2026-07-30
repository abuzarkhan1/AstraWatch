import numpy as np
import pandas as pd
from typing import List, Dict, Tuple
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


__all__ = ["granger_causality"]
