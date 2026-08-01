import os
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime
import numpy as np
from scipy import stats as scipy_stats
import structlog

import pandas as pd

from app.ml.detectors.statistical import StatisticalDetector
from app.ml.detectors.isolation_forest import IsolationForestDetector
from app.ml.detectors.lstm_autoencoder import LSTMAutoencoder
from app.ml.features.feature_engineering import FeatureEngineering

logger = structlog.get_logger(__name__)


class EnsembleDetector:
    def __init__(self, default_threshold: float = 0.5, thresholds: Optional[Dict[str, float]] = None):
        self.statistical = StatisticalDetector()
        self.isolation_forest = IsolationForestDetector()
        self.lstm = LSTMAutoencoder()
        self.feature_engineering = FeatureEngineering()

        self.default_threshold = default_threshold
        self.thresholds: Dict[str, float] = thresholds or {}

        self._lstm_ts_model = None
        self._lstm_ts_model_trained = False

        self.weights = {
            "statistical": 0.25,
            "isolation_forest": 0.30,
            "deep_learning": 0.35,
            "causal": 0.10,
        }

    def set_threshold(self, key: str, threshold: float):
        """Set custom anomaly threshold for a service_id or tenant_id."""
        self.thresholds[key] = threshold

    def get_threshold(
        self,
        service_id: str,
        tenant_id: Optional[str] = None,
        explicit_threshold: Optional[float] = None,
    ) -> float:
        if explicit_threshold is not None:
            return explicit_threshold
        if tenant_id and f"{tenant_id}:{service_id}" in self.thresholds:
            return self.thresholds[f"{tenant_id}:{service_id}"]
        if service_id in self.thresholds:
            return self.thresholds[service_id]
        if tenant_id and tenant_id in self.thresholds:
            return self.thresholds[tenant_id]
        return self.default_threshold

    def detect(
        self,
        service_id: str,
        metrics: List[Dict[str, Any]],
        window_seconds: int = 300,
        use_deep_learning: bool = False,
        threshold: Optional[float] = None,
        tenant_id: Optional[str] = None,
    ) -> dict:
        if not metrics:
            return {"isAnomaly": False, "score": 0.0, "details": {}}

        metric_groups: Dict[str, List[float]] = {}
        timestamps: Dict[str, List[datetime]] = {}

        for m in metrics:
            name = m.get("name", "unknown")
            if name not in metric_groups:
                metric_groups[name] = []
                timestamps[name] = []
            metric_groups[name].append(m.get("value", 0))
            timestamps[name].append(m.get("ts", datetime.utcnow()))

        metrics_to_check = list(metric_groups.keys())
        if not metrics_to_check:
            return {"isAnomaly": False, "score": 0.0, "details": {}}

        primary_metric = metrics_to_check[0]
        values = metric_groups[primary_metric]
        ts = timestamps[primary_metric]

        features = self.feature_engineering.compute_features(values, ts)

        stat_anomaly, stat_score = self.statistical.detect(
            values, ts, service_id, primary_metric,
            features.get("hour_of_day", 0),
            features.get("day_of_week", 0),
        )

        ifo_anomaly, ifo_score = False, 0.0
        X = self.feature_engineering.prepare_training_data([{
            "values": values, "timestamps": ts
        }])
        if len(X) > 0:
            ifo_anomaly, ifo_score = self.isolation_forest.detect(X)

        lstm_anomaly, lstm_score = False, 0.0
        if use_deep_learning and len(values) >= 60:
            arr = np.array(values, dtype=np.float32)
            lstm_anomaly, lstm_score = self.lstm.detect(arr)

        contributing_metrics = self._compute_contributions_shap(
            metric_groups, timestamps, service_id, features, values
        )

        causal_score = 0.0
        if len(metric_groups) >= 2:
            from app.ml.causal import granger_causality
            metric_vals = {k: v for k, v in metric_groups.items()}
            causal_results = granger_causality(metric_vals, max_lag=3)
            for r in causal_results:
                if r["effect"] == primary_metric:
                    causal_score = max(causal_score, r["score"])
                    break

        weights = self.weights
        stat_w = weights["statistical"]
        ifo_w = weights["isolation_forest"]
        dl_w = weights["deep_learning"] if (use_deep_learning and len(values) >= 60) else 0.0
        causal_w = weights["causal"] if causal_score > 0 else 0.0

        total_w = stat_w + ifo_w + dl_w + causal_w
        if total_w > 0:
            stat_w /= total_w
            ifo_w /= total_w
            dl_w /= total_w
            causal_w /= total_w

        final_score = (
            stat_w * stat_score
            + ifo_w * ifo_score
            + dl_w * lstm_score
            + causal_w * causal_score
        )

        active_layers = 2
        if use_deep_learning and len(values) >= 60:
            active_layers = 3
        if causal_score > 0:
            active_layers += 1

        final_score = min(1.0, max(0.0, final_score))
        effective_threshold = self.get_threshold(service_id, tenant_id, threshold)

        return {
            "isAnomaly": final_score > effective_threshold,
            "score": round(final_score, 4),
            "contributingMetrics": contributing_metrics,
            "details": {
                "statistical": {"anomaly": stat_anomaly, "score": round(stat_score, 4)},
                "isolation_forest": {"anomaly": ifo_anomaly, "score": round(ifo_score, 4)},
                "lstm": {"anomaly": lstm_anomaly, "score": round(lstm_score, 4)},
                "active_layers": active_layers,
                "primary_metric": primary_metric,
                "threshold": effective_threshold,
            },
        }

    def _compute_contributions_shap(
        self,
        metric_groups: Dict[str, List[float]],
        timestamps: Dict[str, List[datetime]],
        service_id: str,
        features: dict,
        primary_values: List[float],
    ) -> List[dict]:
        try:
            import shap
            import numpy as np

            names = list(metric_groups.keys())
            n_metrics = len(names)
            if n_metrics < 2:
                raise ValueError("need at least 2 metrics for SHAP")

            aligned = []
            max_len = max(len(v) for v in metric_groups.values())
            for name in names:
                vals = metric_groups[name]
                padded = list(vals) + [vals[-1]] * (max_len - len(vals))
                aligned.append(padded[-30:])

            X = np.array(aligned, dtype=float).T
            if X.shape[0] < 5:
                raise ValueError("too few time points for SHAP")

            def model_fn(x):
                scores = []
                for row in x:
                    score = 0.0
                    for i, name in enumerate(names):
                        val = float(row[i])
                        mean_val = float(np.mean(metric_groups[name]))
                        std_val = float(np.std(metric_groups[name])) or 1.0
                        z = abs(val - mean_val) / std_val
                        score += z * 0.1
                    scores.append(min(1.0, score))
                return np.array(scores)

            explainer = shap.Explainer(model_fn, X, feature_names=names)
            shap_values = explainer(X)

            results = []
            for i, name in enumerate(names):
                sv = float(np.mean(np.abs(shap_values.values[:, i])))
                if sv > 0.01:
                    results.append({
                        "metric": name,
                        "score": round(sv, 4),
                        "contribution": round(sv * 100, 1),
                    })
            results.sort(key=lambda x: abs(x["score"]), reverse=True)
            return results
        except Exception as e:
            logger.warning(f"SHAP contribution computation failed: {e}")

        results = []
        for name, vals in metric_groups.items():
            _, s = self.statistical.detect(
                vals, timestamps[name], service_id, name,
                features.get("hour_of_day", 0),
                features.get("day_of_week", 0),
            )
            if s > 0.2:
                results.append({
                    "metric": name,
                    "score": round(s, 4),
                    "contribution": round(s * 100, 1),
                })
        return results

    def predict_timeseries(
        self, values: List[float], horizon_minutes: int = 30
    ) -> List[dict]:
        if len(values) < 2:
            return []

        arr = np.array(values, dtype=float)
        n = len(arr)
        last_ts = datetime.utcnow()

        predictions = []

        try:
            import tensorflow as tf
            from tensorflow import keras

            model_dir = "/models"
            model_path = os.path.join(model_dir, "lstm_ts_model.keras")

            if self._lstm_ts_model is None:
                if os.path.exists(model_path):
                    try:
                        self._lstm_ts_model = keras.models.load_model(model_path)
                        self._lstm_ts_model_trained = True
                    except Exception as e:
                        logger.warning(f"Failed to load saved LSTM model: {e}")

                if self._lstm_ts_model is None:
                    self._lstm_ts_model = keras.Sequential([
                        keras.layers.LSTM(32, activation='relu', input_shape=(10, 1)),
                        keras.layers.Dense(1),
                    ])
                    self._lstm_ts_model.compile(optimizer='adam', loss='mse')

            model = self._lstm_ts_model

            if n > 20:
                X, y = [], []
                for i in range(len(arr) - 10):
                    X.append(arr[i:i+10])
                    y.append(arr[i+10])
                X = np.array(X).reshape(-1, 10, 1)
                y = np.array(y)

                if not self._lstm_ts_model_trained:
                    model.fit(X, y, epochs=5, verbose=0)
                    self._lstm_ts_model_trained = True
                    try:
                        os.makedirs(model_dir, exist_ok=True)
                        model.save(model_path)
                    except Exception as e:
                        logger.warning(f"Failed to save LSTM model: {e}")
                else:
                    # Fine-tune with 1 epoch when reused
                    model.fit(X, y, epochs=1, verbose=0)

                last_seq = arr[-10:].reshape(1, 10, 1)
                for i in range(horizon_minutes):
                    pred = float(model.predict(last_seq, verbose=0)[0, 0])
                    ts = last_ts + (i + 1) * np.timedelta64(1, "m").item()
                    predictions.append({
                        "ts": ts.isoformat(),
                        "value": round(pred, 4),
                        "confidenceInterval": [
                            round(pred * 0.9, 4),
                            round(pred * 1.1, 4),
                        ],
                    })
                    last_seq = np.roll(last_seq, -1)
                    last_seq[0, -1, 0] = pred
                return predictions
        except Exception as e:
            logger.warning(f"LSTM timeseries prediction failed: {e}")

        try:
            from prophet import Prophet

            df = pd.DataFrame({
                'ds': pd.date_range(end=last_ts, periods=n, freq='min'),
                'y': arr,
            })
            model = Prophet()
            model.fit(df)
            future = model.make_future_dataframe(periods=horizon_minutes, freq='min')
            forecast = model.predict(future)
            for i in range(horizon_minutes):
                row = forecast.iloc[n + i]
                ts = row['ds'].to_pydatetime()
                predictions.append({
                    "ts": ts.isoformat(),
                    "value": round(float(row['yhat']), 4),
                    "confidenceInterval": [
                        round(float(row['yhat_lower']), 4),
                        round(float(row['yhat_upper']), 4),
                    ],
                })
            return predictions
        except Exception:
            pass

        try:
            from statsmodels.tsa.arima.model import ARIMA

            model = ARIMA(arr, order=(1, 0, 1))
            fitted = model.fit()
            forecast_result = fitted.forecast(steps=horizon_minutes)
            for i in range(horizon_minutes):
                ts = last_ts + (i + 1) * np.timedelta64(1, "m").item()
                pred_val = float(forecast_result.iloc[i]) if hasattr(forecast_result, 'iloc') else float(forecast_result[i])
                residual_std = float(np.std(fitted.resid))
                predictions.append({
                    "ts": ts.isoformat(),
                    "value": round(pred_val, 4),
                    "confidenceInterval": [
                        round(pred_val - 1.96 * residual_std, 4),
                        round(pred_val + 1.96 * residual_std, 4),
                    ],
                })
            return predictions
        except Exception:
            pass

        slope, intercept, _, _, _ = scipy_stats.linregress(
            np.arange(n), arr
        )

        for i in range(horizon_minutes):
            pred_idx = n + i
            predicted = slope * pred_idx + intercept
            residual_std = np.std(arr - (slope * np.arange(n) + intercept))
            ts = last_ts + (i + 1) * np.timedelta64(1, "m").item()
            predictions.append({
                "ts": ts.isoformat(),
                "value": round(predicted, 4),
                "confidenceInterval": [
                    round(predicted - 1.96 * residual_std, 4),
                    round(predicted + 1.96 * residual_std, 4),
                ],
            })

        return predictions

    def causal_analysis(
        self, metrics: Dict[str, List[float]]
    ) -> List[dict]:
        results = []
        metric_names = list(metrics.keys())

        for i, cause_name in enumerate(metric_names):
            for j, effect_name in enumerate(metric_names):
                if i == j:
                    continue

                cause_vals = np.array(metrics[cause_name])
                effect_vals = np.array(metrics[effect_name])
                min_len = min(len(cause_vals), len(effect_vals))
                cause_vals = cause_vals[-min_len:]
                effect_vals = effect_vals[-min_len:]

                if min_len < 3:
                    continue

                corr = np.corrcoef(cause_vals, effect_vals)[0, 1]
                if np.isnan(corr):
                    corr = 0

                lag = 0
                max_lag = min(10, min_len // 2)
                best_corr = abs(corr)
                for l in range(1, max_lag):
                    if min_len > l:
                        c = np.corrcoef(
                            cause_vals[:-l], effect_vals[l:]
                        )[0, 1]
                        if not np.isnan(c) and abs(c) > best_corr:
                            best_corr = abs(c)
                            lag = l

                results.append({
                    "cause": cause_name,
                    "effect": effect_name,
                    "confidence": round(abs(corr), 4),
                    "laggedBy": lag,
                })

        results.sort(key=lambda x: x["confidence"], reverse=True)
        return results[:10]
