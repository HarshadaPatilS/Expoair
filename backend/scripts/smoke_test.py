import os
import time
import requests
import sys

# You can override the BASE_URL using an environment variable
BASE_URL = os.environ.get("EXPOAIR_API_URL", "https://expoair-backend.onrender.com")

def check_response(name, url, method="GET", json_payload=None):
    start = time.time()
    try:
        if method == "GET":
            response = requests.get(url, timeout=10)
        else:
            response = requests.post(url, json=json_payload, timeout=10)
            
        elapsed = time.time() - start
        
        # Check both status and timing
        if response.status_code == 200 and elapsed < 3.0:
            print(f"✅ {name} PASSED in {elapsed:.2f}s")
            return True
        elif response.status_code == 200:
            print(f"⚠️ {name} PASSED but SLOW (Status: {response.status_code}, Time: {elapsed:.2f}s)")
            return False
        else:
            print(f"❌ {name} FAILED (Status: {response.status_code}, Time: {elapsed:.2f}s)")
            try:
                print(f"   Response: {response.json()}")
            except:
                print(f"   Response: {response.text}")
            return False
    except Exception as e:
        elapsed = time.time() - start
        print(f"❌ {name} FAILED with exception in {elapsed:.2f}s: {e}")
        return False


def run_smoke_tests():
    print(f"Starting smoke tests against {BASE_URL}...\n")
    
    results = []
    
    # 1. Current AQI (Mode API)
    results.append(check_response(
        "Current AQI (Mode API)",
        f"{BASE_URL}/api/aqi/current?lat=18.5204&lng=73.8567&mode=api"
    ))
    
    # 2. Source Fingerprint
    results.append(check_response(
        "Source Fingerprint",
        f"{BASE_URL}/api/predict/source?lat=18.5204&lng=73.8567"
    ))
    
    # 3. Health Score
    results.append(check_response(
        "Health Score",
        f"{BASE_URL}/api/health-score",
        method="POST",
        json_payload={
            "current_aqi": 145,
            "health_profile": {"age_group": "child", "asthma": "severe", "pregnant": False, "cardiovascular": False}
        }
    ))
    
    print("\n--- Smoke Test Summary ---")
    if all(results):
        print("All tests passed within latency limits! 🚀")
        sys.exit(0)
    else:
        print("Some tests failed or were too slow. Check logs above. ❌")
        sys.exit(1)

if __name__ == "__main__":
    run_smoke_tests()
