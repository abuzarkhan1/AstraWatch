import os
import numpy as np
from typing import Tuple, Optional, List

try:
    import tensorflow as tf
    from tensorflow import keras
    HAS_TF = True
except ImportError:
    HAS_TF = False
    keras = None


class LSTMAutoencoder:
    def __init__(self, model_path: str = "/models"):
        self.model_path = model_path
        self.model = None
        self.sequence_length = 60
        self.n_features = 1
        self.threshold_percentile = 95
        if HAS_TF:
            self._load_or_init()

    def _load_or_init(self):
        if not HAS_TF:
            return
        try:
            import mlflow
            from app.core.config import settings
            mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
            self.model = mlflow.pyfunc.load_model("models:/astrawatch-lstm_autoencoder/latest")
            return
        except Exception:
            pass

        model_file = f"{self.model_path}/lstm_autoencoder.keras"
        try:
            self.model = keras.models.load_model(model_file)
        except (IOError, ValueError):
            self._build_model()

    def _build_model(self):
        if not HAS_TF:
            return
        inputs = keras.Input(shape=(self.sequence_length, self.n_features))
        encoded = keras.layers.LSTM(32, activation="relu")(inputs)
        encoded = keras.layers.Dropout(0.2)(encoded)
        encoded = keras.layers.RepeatVector(self.sequence_length)(encoded)
        decoded = keras.layers.LSTM(32, activation="relu", return_sequences=True)(encoded)
        decoded = keras.layers.TimeDistributed(
            keras.layers.Dense(self.n_features)
        )(decoded)

        self.model = keras.Model(inputs, decoded)
        self.model.compile(optimizer="adam", loss="mse")

    def train(self, data: np.ndarray, epochs: int = 50, batch_size: int = 32) -> dict:
        if not HAS_TF or self.model is None:
            return {"samples": len(data), "final_loss": 0.0, "threshold": 0.1}
        sequences = self._create_sequences(data)
        if len(sequences) == 0:
            return {"samples": 0, "error": "insufficient data"}

        history = self.model.fit(
            sequences, sequences,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.2,
            verbose=0,
        )

        os.makedirs(self.model_path, exist_ok=True)
        self.model.save(f"{self.model_path}/lstm_autoencoder.keras")

        reconstructions = self.model.predict(sequences, verbose=0)
        mse = np.mean(np.square(sequences - reconstructions), axis=(1, 2))
        self.reconstruction_threshold = np.percentile(mse, self.threshold_percentile)

        return {
            "samples": len(data),
            "final_loss": float(history.history["loss"][-1]),
            "threshold": float(self.reconstruction_threshold),
        }

    def detect(self, values: np.ndarray) -> Tuple[bool, float]:
        if not HAS_TF or self.model is None or len(values) < self.sequence_length:
            # Fallback statistical variance check if TF not present
            if len(values) > 0:
                z_score = abs(values[-1] - np.mean(values)) / (np.std(values) + 1e-6)
                return z_score > 3.0, float(min(1.0, z_score / 5.0))
            return False, 0.0

        sequence = values[-self.sequence_length:].reshape(
            1, self.sequence_length, self.n_features
        )

        reconstruction = self.model.predict(sequence, verbose=0)
        mse = float(np.mean(np.square(sequence - reconstruction)))

        threshold = getattr(self, "reconstruction_threshold", 0.1)
        is_anomaly = mse > threshold
        score = min(1.0, mse / (threshold * 2))

        return is_anomaly, score

    def _create_sequences(self, data: np.ndarray) -> np.ndarray:
        if len(data) < self.sequence_length:
            return np.array([])
        sequences = []
        for i in range(len(data) - self.sequence_length + 1):
            sequences.append(data[i : i + self.sequence_length])
        return np.array(sequences)
