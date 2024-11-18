import os
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import joblib
from sqlalchemy import create_engine

def train_model():
    engine = create_engine(os.getenv('DATABASE_URL'))
    query = "SELECT hold_duration, buy_volume, sell_volume, transaction_frequency, trading_score FROM trading_data"
    df = pd.read_sql_query(query, engine)

    df.fillna(0, inplace=True)

    X = df[['hold_duration', 'buy_volume', 'sell_volume', 'transaction_frequency']]
    y = df['trading_score']

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

    model = RandomForestRegressor(n_estimators=200, max_depth=10, random_state=42)
    model.fit(X_train, y_train)

    print(f"Model Training Score: {model.score(X_test, y_test)}")

    joblib.dump(model, 'models/trading_model.pkl')
    joblib.dump(scaler, 'models/scaler.pkl')
    print("Model and scaler saved successfully.")

if __name__ == "__main__":
    train_model()

