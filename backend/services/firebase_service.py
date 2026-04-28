import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    firebase_admin = None

logger = logging.getLogger(__name__)

class FirebaseService:
    def __init__(self):
        self.db = None
        
        if not firebase_admin:
            logger.warning("firebase_admin package not installed. Ensure it's in requirements.")
            return

        cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH")
        
        if not cred_path or not os.path.exists(cred_path):
            logger.warning(f"Firebase credentials not found at '{cred_path}'. Skipping Firebase initialization.")
            return
            
        try:
            # Check if app is already initialized to avoid duplicate initialization throws
            try:
                firebase_admin.get_app()
            except ValueError:
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            
            self.db = firestore.client()
            logger.info("Firebase DB initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase: {e}")

    def store_sensor_reading(self, session_id: str, reading: dict) -> bool:
        """
        Store reading dict: { lat, lng, pm25, pm10, pm1, timestamp }
        Path: sessions/{session_id}/readings/{timestamp_ms}
        """
        if not self.db:
            return False
            
        try:
            write_data = dict(reading)
            ts = write_data.get("timestamp")
            
            # Ensure timestamp is a timezone-aware datetime for Firestore
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            elif ts is None:
                ts = datetime.now(timezone.utc)
            elif isinstance(ts, datetime) and ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
                
            write_data["timestamp"] = ts
            ts_ms = int(ts.timestamp() * 1000)
            
            doc_id = str(ts_ms)
            doc_ref = self.db.collection("sessions").document(session_id).collection("readings").document(doc_id)
            doc_ref.set(write_data)
            return True
        except Exception as e:
            logger.error(f"Error storing sensor reading: {e}")
            return False

    def get_latest_reading(self, session_id: str) -> Optional[dict]:
        """Returns the most recent reading for a session (last 5 minutes only)."""
        if not self.db:
            return None
            
        try:
            docs = self.db.collection("sessions").document(session_id).collection("readings") \
                .order_by("timestamp", direction=firestore.Query.DESCENDING) \
                .limit(1).get()
                
            if not docs:
                return None
                
            data = docs[0].to_dict()
            ts = data.get("timestamp")
            
            valid = False
            now = datetime.now(timezone.utc)
            
            if isinstance(ts, datetime):
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if (now - ts) <= timedelta(minutes=5):
                    valid = True
            elif isinstance(ts, str):
                parsed = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                if (now - parsed) <= timedelta(minutes=5):
                    valid = True
            elif ts is None:
                # Should not happen typically, map cleanly
                pass
                
            if valid:
                return data
            return None
            
        except Exception as e:
            logger.error(f"Error retrieving latest reading: {e}")
            return None

    def get_session_readings(self, session_id: str, hours: int = 24) -> List[dict]:
        """Returns all readings in the last N hours for exposure calculation."""
        if not self.db:
            return []
            
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            
            docs = self.db.collection("sessions").document(session_id).collection("readings") \
                .where("timestamp", ">=", cutoff) \
                .order_by("timestamp", direction=firestore.Query.DESCENDING) \
                .get()
                
            return [doc.to_dict() for doc in docs]
        except Exception as e:
            logger.error(f"Error retrieving session readings (index may require building): {e}")
            return []

    def store_exposure_report(self, session_id: str, report: dict) -> bool:
        """
        Path: reports/{session_id}/daily/{date}
        Note: Subcollection named 'daily' is used to satisfy Firestore strict document depth rules 
        translating the requested `reports/{session_id}/{date}` logically.
        """
        if not self.db:
            return False
            
        try:
            date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            doc_ref = self.db.collection("reports").document(session_id).collection("daily").document(date_str)
            doc_ref.set(report)
            return True
        except Exception as e:
            logger.error(f"Error storing exposure report: {e}")
            return False
