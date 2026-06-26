from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .connection import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user") # 'user' or 'admin'
    created_at = Column(DateTime, default=datetime.utcnow)
    
    health_scores = relationship("HealthScore", back_populates="user")
    exposure_scores = relationship("ExposureScore", back_populates="user")
    routes = relationship("Route", back_populates="user")
    alerts = relationship("Alert", back_populates="user")
    feedback = relationship("Feedback", back_populates="user")
    chat_histories = relationship("ChatHistory", back_populates="user")

class Station(Base):
    __tablename__ = "stations"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    aqi_records = relationship("AQIRecord", back_populates="station")
    alerts = relationship("Alert", back_populates="station")

class AQIRecord(Base):
    __tablename__ = "aqi_records"
    
    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    aqi = Column(Float, nullable=False)
    pm25 = Column(Float, nullable=False)
    pm10 = Column(Float, nullable=True)
    pm1 = Column(Float, nullable=True)
    no2 = Column(Float, nullable=True)
    so2 = Column(Float, nullable=True)
    temp = Column(Float, nullable=True)
    humidity = Column(Float, nullable=True)
    wind_speed = Column(Float, nullable=True)
    wind_dir = Column(Float, nullable=True) # in degrees
    source = Column(String, nullable=False) # e.g. 'fusion_api', 'sensor'
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    station = relationship("Station", back_populates="aqi_records")

class WeatherRecord(Base):
    __tablename__ = "weather_records"
    
    id = Column(Integer, primary_key=True, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    temp = Column(Float, nullable=False)
    humidity = Column(Float, nullable=False)
    wind_speed = Column(Float, nullable=False)
    wind_dir = Column(Float, nullable=False)
    precipitation = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

class Prediction(Base):
    __tablename__ = "predictions"
    
    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String, nullable=False) # e.g. 'lstm', 'xgboost', 'random_forest'
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    target_time = Column(DateTime, nullable=False)
    predicted_aqi = Column(Float, nullable=False)
    confidence = Column(Float, nullable=False)
    features_used = Column(Text, nullable=True) # JSON string of inputs
    shap_values = Column(Text, nullable=True) # JSON string of shap explanation values
    timestamp = Column(DateTime, default=datetime.utcnow)

class HealthScore(Base):
    __tablename__ = "health_scores"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    age_group = Column(String, default="adult") # 'child', 'adult', 'senior'
    asthma = Column(String, default="none") # 'none', 'mild', 'severe'
    pregnant = Column(Boolean, default=False)
    cardiovascular = Column(Boolean, default=False)
    safety_score = Column(Float, nullable=False) # 0 to 100
    risk_level = Column(String, nullable=False) # 'safe', 'moderate', 'high', 'hazardous'
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="health_scores")

class ExposureScore(Base):
    __tablename__ = "exposure_scores"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    daily_exposure = Column(Float, nullable=False)
    weekly_exposure = Column(Float, nullable=False)
    monthly_exposure = Column(Float, nullable=False)
    lifetime_exposure = Column(Float, nullable=False)
    risk_level = Column(String, nullable=False)
    input_data = Column(Text, nullable=True) # JSON representation of commute routine
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="exposure_scores")

class Route(Base):
    __tablename__ = "routes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    start_lat = Column(Float, nullable=False)
    start_lng = Column(Float, nullable=False)
    end_lat = Column(Float, nullable=False)
    end_lng = Column(Float, nullable=False)
    route_type = Column(String, nullable=False) # 'shortest', 'fastest', 'lowest_pollution', 'balanced'
    travel_time = Column(Float, nullable=False) # minutes
    aqi = Column(Float, nullable=False)
    exposure_score = Column(Float, nullable=False)
    waypoints = Column(Text, nullable=True) # JSON string of route path coordinates
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="routes")

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    parameter = Column(String, nullable=False) # 'aqi', 'pm25', etc.
    threshold = Column(Float, nullable=False)
    current_value = Column(Float, nullable=True)
    status = Column(String, default="active") # 'active', 'triggered', 'dismissed'
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="alerts")
    station = relationship("Station", back_populates="alerts")

class Feedback(Base):
    __tablename__ = "feedback"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    rating = Column(Integer, nullable=False)
    comments = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="feedback")

class ChatHistory(Base):
    __tablename__ = "chat_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", back_populates="chat_histories")

class ModelVersion(Base):
    __tablename__ = "model_versions"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False) # 'lstm', 'xgboost', etc.
    version = Column(String, nullable=False)
    accuracy = Column(Float, nullable=True) # e.g. R2 or accuracy percentage
    status = Column(String, default="active") # 'active', 'archived'
    filepath = Column(String, nullable=True)
    trained_at = Column(DateTime, default=datetime.utcnow)
