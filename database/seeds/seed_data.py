import os
import sys
from datetime import datetime, timedelta
import random

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))

from database.connection import SessionLocal, Base
from database.schema import User, Station, AQIRecord, WeatherRecord, ModelVersion, Alert
import bcrypt

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def seed_db():
    db = SessionLocal()
    try:
        print("Starting database seeding...")
        
        # 1. Seed Users (if not already present)
        if not db.query(User).filter(User.email == "admin@airsense.ai").first():
            admin = User(
                email="admin@airsense.ai",
                password_hash=get_password_hash("admin123"),
                role="admin"
            )
            db.add(admin)
            print("Added admin user: admin@airsense.ai / admin123")
            
        if not db.query(User).filter(User.email == "user@airsense.ai").first():
            user = User(
                email="user@airsense.ai",
                password_hash=get_password_hash("user123"),
                role="user"
            )
            db.add(user)
            print("Added standard user: user@airsense.ai / user123")
            
        # 2. Seed Stations
        stations_data = [
            {"name": "Anand Vihar Environmental Station", "latitude": 28.6476, "longitude": 77.3158},
            {"name": "DTU Campus Air Lab", "latitude": 28.7501, "longitude": 77.1176},
            {"name": "Pusa Environmental Observatory", "latitude": 28.6358, "longitude": 77.1524},
            {"name": "Dwarka Sector 8 Station", "latitude": 28.5704, "longitude": 77.0658}
        ]
        
        station_objects = []
        for s in stations_data:
            existing = db.query(Station).filter(Station.name == s["name"]).first()
            if not existing:
                station = Station(name=s["name"], latitude=s["latitude"], longitude=s["longitude"])
                db.add(station)
                station_objects.append(station)
                print(f"Added station: {s['name']}")
            else:
                station_objects.append(existing)
                
        db.commit()  # commit stations to get IDs
        
        # 3. Seed Model Versions
        model_versions_data = [
            {"name": "LSTM", "version": "v1.0.0", "accuracy": 0.88, "status": "active", "filepath": "ml/models_saved/lstm_aqi.keras"},
            {"name": "XGBoost", "version": "v1.2.0", "accuracy": 0.85, "status": "active", "filepath": "ml/models_saved/source_fingerprinter.json"},
            {"name": "Random Forest", "version": "v1.0.1", "accuracy": 0.82, "status": "active", "filepath": None}
        ]
        for m in model_versions_data:
            existing = db.query(ModelVersion).filter(ModelVersion.name == m["name"], ModelVersion.version == m["version"]).first()
            if not existing:
                mv = ModelVersion(
                    name=m["name"],
                    version=m["version"],
                    accuracy=m["accuracy"],
                    status=m["status"],
                    filepath=m["filepath"]
                )
                db.add(mv)
                print(f"Added model version: {m['name']} {m['version']}")
                
        # 4. Seed AQI and Weather Records (past 7 days hourly, and future predictions)
        base_time = datetime.utcnow()
        for station in station_objects:
            # Check if records already exist
            existing_record = db.query(AQIRecord).filter(AQIRecord.station_id == station.id).first()
            if existing_record:
                continue
                
            print(f"Seeding historical data for station: {station.name}")
            # Generate past 7 days hourly records
            for hour_offset in range(24 * 7):
                record_time = base_time - timedelta(hours=hour_offset)
                
                # Dynamic AQI values representing daily diurnal patterns (rising in morning/evening)
                hour = record_time.hour
                diurnal_factor = 1.0 + 0.3 * random.uniform(0.7, 1.3) if hour in [8, 9, 10, 18, 19, 20, 21] else 0.8 * random.uniform(0.8, 1.2)
                
                # Different stations have different pollution profiles (Anand Vihar is higher)
                station_base = 150 if "Anand Vihar" in station.name else 70
                pm25 = station_base * diurnal_factor + random.uniform(-10, 15)
                pm25 = max(5.0, pm25)
                
                aqi = pm25 * 2.1 # simplistic proxy
                
                # Weather variables
                temp = 25.0 + 8.0 * random.uniform(-1, 1) + (5.0 if 12 <= hour <= 16 else -4.0)
                humidity = 60.0 - 15.0 * random.uniform(-1, 1) - (10.0 if 12 <= hour <= 16 else -10.0)
                wind_speed = 5.0 + 10.0 * random.random()
                
                aqi_rec = AQIRecord(
                    station_id=station.id,
                    lat=station.latitude,
                    lng=station.longitude,
                    aqi=round(aqi, 1),
                    pm25=round(pm25, 1),
                    pm10=round(pm25 * 1.6, 1),
                    pm1=round(pm25 * 0.6, 1),
                    no2=round(random.uniform(15, 60), 1),
                    so2=round(random.uniform(5, 25), 1),
                    temp=round(temp, 1),
                    humidity=round(humidity, 1),
                    wind_speed=round(wind_speed, 1),
                    wind_dir=random.uniform(0, 360),
                    source="station_feed",
                    timestamp=record_time
                )
                db.add(aqi_rec)
                
                # Seed corresponding weather records
                weather_rec = WeatherRecord(
                    lat=station.latitude,
                    lng=station.longitude,
                    temp=round(temp, 1),
                    humidity=round(humidity, 1),
                    wind_speed=round(wind_speed, 1),
                    wind_dir=random.uniform(0, 360),
                    precipitation=0.0 if random.random() > 0.05 else random.uniform(0.1, 5.0),
                    timestamp=record_time
                )
                db.add(weather_rec)
                
        # 5. Seed active alerts
        for station in station_objects[:2]:
            alert = Alert(
                user_id=1,
                station_id=station.id,
                parameter="pm25",
                threshold=100.0,
                current_value=120.5,
                status="active"
            )
            db.add(alert)
            
        db.commit()
        print("Database seeding completed successfully!")
        
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
