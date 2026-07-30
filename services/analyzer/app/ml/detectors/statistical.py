import numpy as np
from typing import List, Tuple, Optional
from datetime import datetime, timedelta


class StatisticalDetector:
    def __init__(self, z_score_threshold: float = 3.0, ewma_alpha: float = 0.3):
        self.z_score_threshold = z_score_threshold
        self.ewma_alpha = ewma_alpha
        self.baselines: dict = {}

    def detect(self, values: List[float], timestamps: List[datetime],
               service_id: str, metric_name: str, hour_of_day: int,
               day_of_week: int) -> Tuple[bool, float]:
        baseline_key = f"{service_id}:{metric_name}:{hour_of_day}:{day_of_week}"

        if baseline_key not in self.baselines:
            if len(values) > 1:
                self._initialize_baseline(baseline_key, values)
            return False, 0.0

        baseline = self.baselines[baseline_key]
        latest_value = values[-1] if values else 0

        ewma = self._compute_ewma(values, baseline.get("ewma", latest_value))

        if baseline.get("std", 0) > 0:
            z_score = abs(latest_value - baseline["mean"]) / baseline["std"]
        else:
            z_score = 0.0

        threshold = self._adaptive_threshold(baseline, hour_of_day, day_of_week)
        is_anomaly = z_score > threshold

        score = min(1.0, z_score / (threshold * 2))

        self._update_baseline(baseline_key, ewma, latest_value)

        return is_anomaly, score

    def _initialize_baseline(self, key: str, values: List[float]):
        arr = np.array(values)
        self.baselines[key] = {
            "mean": float(np.mean(arr)),
            "std": float(max(np.std(arr), 1e-6)),
            "ewma": float(arr[-1]),
            "count": len(values),
        }

    def _compute_ewma(self, values: List[float], prev_ewma: float) -> float:
        if not values:
            return prev_ewma
        ewma = prev_ewma
        for v in values:
            ewma = self.ewma_alpha * v + (1 - self.ewma_alpha) * ewma
        return ewma

    def _adaptive_threshold(self, baseline: dict, hour: int, day: int) -> float:
        base_threshold = self.z_score_threshold

        if hour < 6:
            base_threshold *= 0.8
        elif 9 <= hour <= 17:
            base_threshold *= 1.2

        if day >= 5:
            base_threshold *= 0.7

        return base_threshold

    def _update_baseline(self, key: str, ewma: float, latest: float):
        if key in self.baselines:
            bl = self.baselines[key]
            bl["ewma"] = ewma
            bl["count"] += 1
            n = bl["count"]
            old_mean = bl["mean"]
            bl["mean"] = old_mean + (latest - old_mean) / n
            if n > 1:
                bl["std"] = float(np.sqrt(
                    (bl["std"] ** 2 * (n - 1) + (latest - old_mean) * (latest - bl["mean"])) / n
                ))
