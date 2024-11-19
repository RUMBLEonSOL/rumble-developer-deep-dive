import os
import pandas as pd
import numpy as np
from typing import List, Tuple
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestRegressor
import joblib
from sqlalchemy import create_engine
import redis

class AiService:
    def __init__(self):
        self.model_path = os.getenv('MODEL_PATH', 'models/trading_model.pkl')
        self.scaler_path = os.getenv('SCALER_PATH', 'models/scaler.pkl')
        self.engine = create_engine(os.getenv('DATABASE_URL'))
        self.redis_client = redis.Redis.from_url(os.getenv('REDIS_URL'))
        self.model = joblib.load(self.model_path)
        self.scaler = joblib.load(self.scaler_path)

    def fetch_trading_data(self, player_keys: List[str]) -> pd.DataFrame:
        query = f"""
        SELECT player_key, hold_duration, buy_volume, sell_volume, transaction_frequency
        FROM trading_data
        WHERE player_key IN :player_keys
        """
        df = pd.read_sql_query(query, self.engine, params={"player_keys": tuple(player_keys)})
        return df

    def preprocess_data(self, df: pd.DataFrame) -> np.ndarray:
        features = df[['hold_duration', 'buy_volume', 'sell_volume', 'transaction_frequency']].values
        scaled_features = self.scaler.transform(features)
        return scaled_features

    def compute_trading_scores(self, player_keys: List[str]) -> List[Tuple[str, int]]:
        df = self.fetch_trading_data(player_keys)
        if df.empty:
            return [(key, 0) for key in player_keys]

        scaled_features = self.preprocess_data(df)
        predictions = self.model.predict(scaled_features)
        trading_scores = predictions.astype(int)

        df['trading_score'] = trading_scores
        scores = list(zip(df['player_key'], df['trading_score']))
        return scores

    def detect_anomalies(self, player_key: str) -> bool:
        cached = self.redis_client.get(player_key)
        if cached:
            return bool(int(cached))

        query = f"""
        SELECT SUM(buy_volume + sell_volume) as total_volume
        FROM trading_data
        WHERE player_key = :player_key
        """
        result = pd.read_sql_query(query, self.engine, params={"player_key": player_key})
        total_volume = result['total_volume'].iloc[0]

        is_anomalous = total_volume > 100000
        self.redis_client.set(player_key, int(is_anomalous), ex=3600)
        return is_anomalous

    def compute_scores_with_anomaly_detection(self, player_keys: List[str]) -> List[Tuple[str, int]]:
        scores = self.compute_trading_scores(player_keys)
        validated_scores = []
        for key, score in scores:
            if not self.detect_anomalies(key):
                validated_scores.append((key, score))
            else:
                validated_scores.append((key, 0))
        return validated_scores

if __name__ == "__main__":
    ai_service = AiService()
    players = ['PlayerPubKey1', 'PlayerPubKey2', 'PlayerPubKey3']
    scores = ai_service.compute_scores_with_anomaly_detection(players)
    print(scores)

