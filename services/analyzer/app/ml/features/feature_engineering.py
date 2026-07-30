import numpy as np
from typing import List, Dict, Any, Tuple
from datetime import datetime
from scipy import stats
from sklearn.preprocessing import StandardScaler


class FeatureEngineering:
    def __init__(self):
        self.scaler = StandardScaler()
        self._fitted = False

    def compute_features(
        self, values: List[float], timestamps: List[datetime]
    ) -> Dict[str, float]:
        arr = np.array(values)
        if len(arr) < 2:
            return {"mean": float(arr[0]) if len(arr) > 0 else 0}

        features = {
            "mean": float(np.mean(arr)),
            "std": float(np.std(arr)),
            "min": float(np.min(arr)),
            "max": float(np.max(arr)),
            "p50": float(np.percentile(arr, 50)),
            "p95": float(np.percentile(arr, 95)),
            "p99": float(np.percentile(arr, 99)),
            "rate_of_change": self._compute_rate_of_change(arr),
            "skewness": float(stats.skew(arr)) if len(arr) > 2 else 0,
            "kurtosis": float(stats.kurtosis(arr)) if len(arr) > 2 else 0,
        }

        if timestamps and len(timestamps) > 1:
            last_ts = timestamps[-1]
            features["hour_of_day"] = last_ts.hour
            features["day_of_week"] = last_ts.weekday()
            features["is_business_hours"] = 1 if 9 <= last_ts.hour <= 17 else 0
            features["is_weekend"] = 1 if last_ts.weekday() >= 5 else 0

        return features

    def _compute_rate_of_change(self, arr: np.ndarray) -> float:
        if len(arr) < 2:
            return 0.0
        diffs = np.diff(arr)
        if np.any(arr[:-1] != 0):
            return float(np.mean(diffs / np.abs(arr[:-1] + 1e-10)))
        return float(np.mean(diffs))

    def compute_cross_metric_ratios(
        self, metrics: Dict[str, List[float]]
    ) -> Dict[str, float]:
        ratios = {}
        if "latency" in metrics and "throughput" in metrics:
            l = np.mean(metrics["latency"])
            t = np.mean(metrics["throughput"])
            if t > 0:
                ratios["latency_per_throughput"] = l / t

        if "error_rate" in metrics and "throughput" in metrics:
            e = np.mean(metrics["error_rate"])
            t = np.mean(metrics["throughput"])
            if t > 0:
                ratios["error_rate_per_throughput"] = e / t

        return ratios

    def prepare_training_data(
        self, historical_data: List[Dict[str, Any]]
    ) -> np.ndarray:
        features = []
        for record in historical_data:
            feat = self.compute_features(
                record.get("values", []), record.get("timestamps", [])
            )
            features.append([
                feat.get("mean", 0), feat.get("std", 0),
                feat.get("p50", 0), feat.get("p95", 0),
                feat.get("rate_of_change", 0),
                feat.get("hour_of_day", 0), feat.get("day_of_week", 0),
            ])

        X = np.array(features)
        if len(X) > 0:
            X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
            if not self._fitted:
                self.scaler.fit(X)
                self._fitted = True
            X = self.scaler.transform(X)

        return X
