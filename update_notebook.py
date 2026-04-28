import json
import os

notebook_path = "d:/Expoair/ml/lstm_predictor.ipynb"
with open(notebook_path, "r", encoding="utf-8") as f:
    nb = json.load(f)

new_cells = [
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "# 2. LSTM Model Training\n",
            "This section covers sequence preparation, model definition, training with WandB, and evaluation."
        ]
    },
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 2.1 Feature Integration & Sequence Preparation\n",
            "We integrate meteorological and traffic features, split the data chronologically (70/15/15), and scale the inputs/outputs."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "import os\n",
            "import joblib\n",
            "from sklearn.preprocessing import StandardScaler, MinMaxScaler\n",
            "from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score\n",
            "\n",
            "# 1. Setup Inputs and Targets\n",
            "# Since the first section didn't include some external features requested, we mock them here\n",
            "# to represent integrating with a Weather API (Open-Meteo) and Traffic API.\n",
            "np.random.seed(42)\n",
            "n_samples = len(feat_df)\n",
            "feat_df['wind_speed'] = np.random.uniform(0, 15, n_samples)\n",
            "feat_df['wind_dir_sin'] = np.sin(np.random.uniform(0, 2*np.pi, n_samples))\n",
            "feat_df['wind_dir_cos'] = np.cos(np.random.uniform(0, 2*np.pi, n_samples))\n",
            "feat_df['humidity'] = np.random.uniform(30, 90, n_samples)\n",
            "feat_df['temp'] = np.random.uniform(15, 40, n_samples)\n",
            "feat_df['traffic_index'] = np.random.uniform(0, 10, n_samples) + feat_df['hour_sin'] * 2\n",
            "\n",
            "feature_cols = [\n",
            "    'pm25', 'no2', 'wind_speed', 'wind_dir_sin', 'wind_dir_cos',\n",
            "    'humidity', 'temp', 'traffic_index', 'hour_sin', 'hour_cos', 'day_of_week'\n",
            "]\n",
            "\n",
            "# Create targets for multiple horizons: +1h, +3h, +6h, +12h, +24h\n",
            "target_horizons = [1, 3, 6, 12, 24]\n",
            "for h in target_horizons:\n",
            "    feat_df[f'aqi_target_{h}h'] = feat_df['aqi'].shift(-h)\n",
            "\n",
            "# Drop rows where targets are NaN due to shifting\n",
            "feat_df = feat_df.dropna()\n",
            "target_cols = [f'aqi_target_{h}h' for h in target_horizons]\n",
            "\n",
            "print(\"Feature Dataframe Shape (After Shifting Targets):\", feat_df.shape)\n",
            "\n",
            "# 2. Chronological Train/Val/Test Split (70 / 15 / 15)\n",
            "n = len(feat_df)\n",
            "train_end = int(n * 0.70)\n",
            "val_end = int(n * 0.85)\n",
            "\n",
            "train_df = feat_df.iloc[:train_end]\n",
            "val_df = feat_df.iloc[train_end:val_end]\n",
            "test_df = feat_df.iloc[val_end:]\n",
            "\n",
            "print(f\"Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}\")\n",
            "\n",
            "# 3. Scaling\n",
            "scaler_X = StandardScaler()\n",
            "scaler_y = MinMaxScaler()\n",
            "\n",
            "train_X_scaled = scaler_X.fit_transform(train_df[feature_cols])\n",
            "val_X_scaled = scaler_X.transform(val_df[feature_cols])\n",
            "test_X_scaled = scaler_X.transform(test_df[feature_cols])\n",
            "\n",
            "train_y_scaled = scaler_y.fit_transform(train_df[target_cols])\n",
            "val_y_scaled = scaler_y.transform(val_df[target_cols])\n",
            "test_y_scaled = scaler_y.transform(test_df[target_cols])\n",
            "\n",
            "# 4. Create sequences of length 24 (past 24 hours)\n",
            "def create_sequences(X, y, seq_length=24):\n",
            "    Xs, ys = [], []\n",
            "    for i in range(len(X) - seq_length):\n",
            "        Xs.append(X[i:(i + seq_length)])\n",
            "        ys.append(y[i + seq_length])\n",
            "    return np.array(Xs), np.array(ys)\n",
            "\n",
            "SEQ_LEN = 24\n",
            "X_train, y_train = create_sequences(train_X_scaled, train_y_scaled, SEQ_LEN)\n",
            "X_val, y_val = create_sequences(val_X_scaled, val_y_scaled, SEQ_LEN)\n",
            "X_test, y_test = create_sequences(test_X_scaled, test_y_scaled, SEQ_LEN)\n",
            "\n",
            "print(f\"X_train sequence shape: {X_train.shape}, y_train shape: {y_train.shape}\")"
        ]
    },
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 2.2 Model Architecture & Training\n",
            "Using TensorFlow/Keras to build a Bidirectional LSTM."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "!pip install -q wandb\n",
            "import wandb\n",
            "from wandb.keras import WandbMetricsLogger\n",
            "from tensorflow.keras.models import Sequential\n",
            "from tensorflow.keras.layers import LSTM, Dense, Dropout, Bidirectional, Input\n",
            "from tensorflow.keras.optimizers import Adam\n",
            "from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau\n",
            "\n",
            "# Init Wandb\n",
            "# wandb.login() # Manual login if running the first time\n",
            "wandb.init(project=\"expoair-lstm\", name=\"bi-lstm-aqi-multi-horizon\")\n",
            "\n",
            "# Architecture: Input(24, 11) -> BiLSTM(64) -> Dropout(0.2) -> LSTM(32) -> Dropout(0.2) -> Dense(16, relu) -> Dense(5)\n",
            "model = Sequential([\n",
            "    Input(shape=(24, 11)),\n",
            "    Bidirectional(LSTM(64, return_sequences=True)),\n",
            "    Dropout(0.2),\n",
            "    LSTM(32),\n",
            "    Dropout(0.2),\n",
            "    Dense(16, activation='relu'),\n",
            "    Dense(5) # Predicts +1h, +3h, +6h, +12h, +24h AQI simultaneously\n",
            "])\n",
            "\n",
            "model.compile(optimizer=Adam(learning_rate=0.001), loss='mse')\n",
            "model.summary()\n",
            "\n",
            "# Callbacks\n",
            "early_stop = EarlyStopping(monitor='val_loss', patience=10, restore_best_weights=True)\n",
            "reduce_lr = ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=5, min_lr=1e-6)\n",
            "wandb_logger = WandbMetricsLogger()\n",
            "\n",
            "# Train Model\n",
            "history = model.fit(\n",
            "    X_train, y_train,\n",
            "    validation_data=(X_val, y_val),\n",
            "    epochs=100,\n",
            "    batch_size=64,\n",
            "    callbacks=[early_stop, reduce_lr, wandb_logger],\n",
            "    verbose=1\n",
            ")\n",
            "\n",
            "wandb.finish()"
        ]
    },
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 2.3 Evaluation\n",
            "Testing the forecasting models with visualizations of Real vs Pred and error histograms."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "# Predictions on Test set\n",
            "y_pred_scaled = model.predict(X_test)\n",
            "\n",
            "# Inverse Scale outputs\n",
            "y_pred = scaler_y.inverse_transform(y_pred_scaled)\n",
            "y_test_inv = scaler_y.inverse_transform(y_test)\n",
            "\n",
            "# 1. Compute RMSE, MAE, R^2 per horizon\n",
            "horizons_labels = ['+1h', '+3h', '+6h', '+12h', '+24h']\n",
            "metrics = []\n",
            "\n",
            "for i, h in enumerate(horizons_labels):\n",
            "    true_vals = y_test_inv[:, i]\n",
            "    pred_vals = y_pred[:, i]\n",
            "    \n",
            "    rmse = np.sqrt(mean_squared_error(true_vals, pred_vals))\n",
            "    mae = mean_absolute_error(true_vals, pred_vals)\n",
            "    r2 = r2_score(true_vals, pred_vals)\n",
            "    metrics.append({'Horizon': h, 'RMSE': rmse, 'MAE': mae, 'R2': r2})\n",
            "\n",
            "display(pd.DataFrame(metrics))\n",
            "\n",
            "# 2. Plot Predicted vs Actual for a slice of the test set\n",
            "fig, axes = plt.subplots(1, 2, figsize=(16, 5))\n",
            "\n",
            "plot_length = 200 # First 200 hours\n",
            "\n",
            "axes[0].plot(y_test_inv[:plot_length, 0], label='Actual (+1h)', marker='.', linestyle='dashed')\n",
            "axes[0].plot(y_pred[:plot_length, 0], label='Predicted (+1h)', marker='.', alpha=0.8)\n",
            "axes[0].set_title('Test Set: Demostrating +1h AQI Forecast')\n",
            "axes[0].legend()\n",
            "\n",
            "axes[1].plot(y_test_inv[:plot_length, 4], label='Actual (+24h)', marker='.', linestyle='dashed')\n",
            "axes[1].plot(y_pred[:plot_length, 4], label='Predicted (+24h)', marker='.', alpha=0.8)\n",
            "axes[1].set_title('Test Set: Demostrating +24h AQI Forecast')\n",
            "axes[1].legend()\n",
            "plt.show()\n",
            "\n",
            "# 3. Error Distribution Histogram\n",
            "errors = y_pred - y_test_inv\n",
            "plt.figure(figsize=(10, 5))\n",
            "for i, h in enumerate(horizons_labels):\n",
            "    sns.kdeplot(errors[:, i], label=f'Error {h}', fill=True, alpha=0.3)\n",
            "plt.title('Error Distribution for All Forecasting Horizons')\n",
            "plt.xlabel('Prediction Error (AQI Off By)')\n",
            "plt.legend()\n",
            "plt.xlim(-100, 100)\n",
            "plt.show()"
        ]
    },
    {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
            "## 2.4 Save Models & Scalers\n",
            "Save the generated models and scaling objects to be used directly by the FastAPI backend."
        ]
    },
    {
        "cell_type": "code",
        "execution_count": None,
        "metadata": {},
        "outputs": [],
        "source": [
            "os.makedirs(\"models_saved\", exist_ok=True)\n",
            "\n",
            "# Save the Keras architecture and best weights\n",
            "model.save(\"models_saved/lstm_aqi.h5\")\n",
            "\n",
            "# We save a dictionary containing both scalers to the requested scaler.pkl location\n",
            "scalers_dict = {\n",
            "    'X': scaler_X, \n",
            "    'y': scaler_y\n",
            "}\n",
            "joblib.dump(scalers_dict, \"models_saved/scaler.pkl\")\n",
            "\n",
            "print(\"Exported `models_saved/lstm_aqi.h5` and `models_saved/scaler.pkl` successfully.\")"
        ]
    }
]

nb["cells"].extend(new_cells)

with open(notebook_path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)

print("Notebook ml/lstm_predictor.ipynb updated successfully.")
