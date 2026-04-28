import os
import sys
import time
import random
from datetime import datetime, timedelta, timezone

# Add backend directory to path so we can import services
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(backend_dir)

from services.firebase_service import FirebaseService

def run_test():
    print("Initializing FirebaseService...")
    service = FirebaseService()
    
    if not service.db:
        print("\n[WARNING] Firebase is not initialized.")
        print("Please ensure FIREBASE_CREDENTIALS_PATH environment variable is set")
        print("and points to a valid JSON credentials file.")
        print("Exiting test gracefully.")
        return

    session_id = f"test_session_{int(time.time())}"
    print(f"\n--- Starting Firebase Test ---")
    print(f"Session ID: {session_id}")

    # 1. Store 5 dummy readings
    print("\n1. Storing 5 dummy readings...")
    for i in range(5):
        # Storing readings 1 minute apart
        ts = datetime.now(timezone.utc) - timedelta(minutes=i)
        
        reading = {
            "lat": 18.5204 + random.uniform(-0.01, 0.01),
            "lng": 73.8567 + random.uniform(-0.01, 0.01),
            "pm25": round(random.uniform(10, 80), 2),
            "pm10": round(random.uniform(20, 150), 2),
            "pm1": round(random.uniform(5, 50), 2),
            "timestamp": ts
        }
        
        success = service.store_sensor_reading(session_id, reading)
        status = "SUCCESS" if success else "FAILED"
        print(f"  [{status}] Stored reading {i+1} at {ts.strftime('%H:%M:%S')}")

    # Small delay to ensure Firestore writes are readable sequentially
    time.sleep(1.5)

    # 2. Retrieve latest reading
    print("\n2. Retrieving latest reading (last 5 mins)...")
    latest = service.get_latest_reading(session_id)
    if latest:
        print(f"  Found latest reading: PM2.5 = {latest.get('pm25')}")
    else:
        print("  [ERROR] No recent reading found!")

    # 3. Retrieve session readings
    print("\n3. Retrieving all session readings for last 24 hours...")
    readings = service.get_session_readings(session_id, hours=24)
    print(f"  Total readings retrieved: {len(readings)}")
    for idx, r in enumerate(readings):
        print(f"    {idx+1}: PM2.5={r.get('pm25')}, Time={r.get('timestamp')}")

    # 4. Clean up test data
    print("\n4. Cleaning up test data...")
    try:
        # Fetch all documents in the test session's readings subcollection
        docs = service.db.collection("sessions").document(session_id).collection("readings").get()
        deleted_count = 0
        for doc in docs:
            doc.reference.delete()
            deleted_count += 1
            
        print(f"  Deleted {deleted_count} reading documents.")
        
        # Delete the session document itself (it may be virtually empty but good practice)
        service.db.collection("sessions").document(session_id).delete()
        print(f"  Deleted session document: {session_id}")
        
    except Exception as e:
        print(f"  [ERROR] Cleanup failed: {e}")

    print("\n--- Test Complete ---")

if __name__ == "__main__":
    run_test()
