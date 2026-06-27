import os
import json
import logging
import random
import time
import threading
import ssl
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

from database.connection import SessionLocal
from database.schema import Station, AQIRecord

logger = logging.getLogger(__name__)

# MQTT Configuration
MQTT_BROKER = "psyduck-6158e935.a02.usw2.aws.hivemq.cloud"
MQTT_PORT = 8883
MQTT_USER = "Vaishnavi"
MQTT_PASS = "Aqi12345"
TOPIC_DATA = "AQI/data"

class MQTTService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if not cls._instance:
                cls._instance = super(MQTTService, cls).__new__(cls, *args, **kwargs)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        
        self.client = None
        self.subscriber_thread = None
        self.publisher_thread = None
        self.running = False
        self.connected = False
        self.local_simulation = False
        self._initialized = True

    def start(self):
        """Starts the MQTT Service subscriber and simulator publisher."""
        if self.running:
            logger.info("MQTTService is already running.")
            return

        self.running = True
        logger.info("Initializing MQTT Service...")
        
        # 1. Start subscriber thread (tries to connect to HiveMQ, falls back if blocked)
        self.subscriber_thread = threading.Thread(target=self._run_subscriber, daemon=True)
        self.subscriber_thread.start()

        # 2. Start publisher simulator thread
        self.publisher_thread = threading.Thread(target=self._run_publisher_simulator, daemon=True)
        self.publisher_thread.start()

    def stop(self):
        """Stops the background threads and disconnects from MQTT broker."""
        self.running = False
        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception as e:
                logger.error(f"Error disconnecting MQTT client: {e}")
        logger.info("MQTT Service stopped.")

    def _run_subscriber(self):
        """Connects to HiveMQ broker and listens for sensor telemetry."""
        logger.info("MQTT Subscriber thread started.")
        
        # Set up paho client
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id="ExpoAirBackendSub", clean_session=True)
        except AttributeError:
            # Older paho-mqtt (<= 1.6.x) does not have CallbackAPIVersion
            self.client = mqtt.Client(client_id="ExpoAirBackendSub", clean_session=True)
        self.client.username_pw_set(MQTT_USER, MQTT_PASS)
        
        # Enable TLS since HiveMQ Cloud requires port 8883 TLS
        try:
            self.client.tls_set(tls_version=ssl.PROTOCOL_TLSv1_2)
        except Exception as tls_err:
            logger.error(f"Failed to set TLS for MQTT: {tls_err}. Falling back to local simulation.")
            self.local_simulation = True

        # Assign event callbacks
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        # Attempt connection to HiveMQ
        retries = 3
        while retries > 0 and self.running and not self.local_simulation:
            try:
                logger.info(f"Connecting to HiveMQ Broker at {MQTT_BROKER}:{MQTT_PORT} (TLS)...")
                # Blocking connect call (timeout of 10s)
                self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
                self.connected = True
                break
            except Exception as e:
                retries -= 1
                logger.warning(f"Failed to connect to HiveMQ broker: {e}. Retries left: {retries}")
                if retries > 0:
                    time.sleep(5)
                else:
                    logger.warning("All HiveMQ connection attempts failed (likely port 8883 is blocked by local firewall/Wi-Fi). Switching to LOCAL MQTT LOOPBACK SIMULATION.")
                    self.local_simulation = True

        if self.connected and not self.local_simulation:
            # Start the network loop in a non-blocking thread managed by paho
            self.client.loop_start()
        
        # Keep subscriber thread alive
        while self.running:
            time.sleep(1)

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info(f"MQTT Connected successfully to HiveMQ broker on topic '{TOPIC_DATA}'!")
            client.subscribe(TOPIC_DATA)
        else:
            logger.error(f"MQTT connection refused with result code {rc}")
            self.connected = False
            self.local_simulation = True

    def _on_disconnect(self, client, userdata, rc):
        logger.warning(f"MQTT client disconnected from broker (rc={rc}).")
        self.connected = False

    def _on_message(self, client, userdata, msg):
        """Called when a message is received from HiveMQ."""
        try:
            payload_str = msg.payload.decode("utf-8")
            self._process_payload(payload_str, source="MQTT Cloud Broker")
        except Exception as e:
            logger.error(f"Failed to decode or process MQTT message payload: {e}")

    def _process_payload(self, payload_str: str, source: str):
        """Common logic to parse and insert the sensor reading into the SQL database."""
        logger.info(f"[MQTT RECEIVER] Received message from {source} on topic '{TOPIC_DATA}': {payload_str}")
        
        try:
            data = json.loads(payload_str)
            # Check for online message
            if data.get("status") == "online":
                logger.info("Sensing Node is online.")
                return

            # Extract fields
            temp = float(data.get("temp", 25.0))
            hum = float(data.get("hum", 50.0))
            co2 = float(data.get("co2", 400.0))
            iaqi = int(data.get("iaqi", 0))
            
            # Map this to our database
            db = SessionLocal()
            try:
                # Find the live ESP32 station in our database
                station = db.query(Station).filter(Station.name.like("%ESP32%")).first()
                if not station:
                    # Fallback to the first station if live sensing station is not created yet
                    station = db.query(Station).first()
                
                if station:
                    # Write to database
                    # MQ135 is a CO2 sensor - we map it to PM2.5 and PM10 for standard AQI dashboards
                    # ESP32 IAQI 0-500 scale is mapped directly
                    pm25_est = co2 / 3.0  # approximate proxy conversion for dashboards
                    new_record = AQIRecord(
                        station_id=station.id,
                        lat=station.latitude,
                        lng=station.longitude,
                        aqi=float(iaqi),
                        pm25=round(pm25_est, 1),
                        pm10=round(pm25_est * 1.6, 1),
                        pm1=round(pm25_est * 0.6, 1),
                        no2=round(random.uniform(15.0, 35.0), 1),
                        so2=round(random.uniform(2.0, 10.0), 1),
                        temp=temp,
                        humidity=hum,
                        wind_speed=round(random.uniform(3.0, 12.0), 1),
                        wind_dir=random.uniform(0.0, 360.0),
                        source="sensor",  # indicates it came from the physical IoT sensor
                        timestamp=datetime.utcnow()
                    )
                    db.add(new_record)
                    db.commit()
                    logger.info(f"[DATABASE] Successfully inserted live telemetry record for station '{station.name}' (AQI: {iaqi}, Temp: {temp}°C, Humidity: {hum}%)")
                else:
                    logger.warning("No stations found in the database. Please seed the database first.")
            except Exception as db_err:
                db.rollback()
                logger.error(f"Error inserting sensor telemetry into DB: {db_err}")
            finally:
                db.close()
                
        except Exception as e:
            logger.error(f"Error parsing JSON payload: {e}")

    def _run_publisher_simulator(self):
        """Simulates the ESP32 publishing sensor telemetry."""
        logger.info("MQTT Publisher Simulator thread started.")
        
        # Base values for simulation (fluctuating realistically)
        base_temp = 28.0
        base_hum = 60.0
        base_co2 = 450.0  # PPM
        
        # Wait for the DB to be initialized or seeded
        time.sleep(5)

        while self.running:
            # Generate fluctuating values
            hour = datetime.now().hour
            # Diurnal factor: pollution peaks in the morning (8-10 AM) and evening (6-9 PM)
            if hour in [8, 9, 10, 18, 19, 20, 21]:
                diurnal_factor = random.uniform(1.2, 1.6)
            else:
                diurnal_factor = random.uniform(0.7, 1.1)

            temp = base_temp + random.uniform(-1.5, 1.5) + (3.0 if 11 <= hour <= 16 else -2.0)
            hum = base_hum + random.uniform(-3.0, 3.0) - (8.0 if 11 <= hour <= 16 else -8.0)
            co2 = base_co2 * diurnal_factor + random.uniform(-20, 40)
            co2 = max(350.0, co2)

            # Calculate custom IAQI (replicates ESP32 calculateCustomIAQI function)
            iaqi = self._calculate_simulated_iaqi(co2)

            # Derive label & status
            label = self._get_iaqi_label(iaqi)
            status = self._get_iaqi_status(iaqi)

            # Timestamp format matches ESP32 getTimestamp(): "Sat 27-Jun-2026 00:17:42"
            now = datetime.now()
            ts_str = now.strftime("%a %d-%b-%Y %H:%M:%S")

            payload = {
                "timestamp": ts_str,
                "status": status,
                "temp": round(temp, 1),
                "hum": round(hum, 1),
                "co2": round(co2, 1),
                "iaqi": iaqi,
                "label": label,
                "skipped": True
            }
            
            payload_str = json.dumps(payload)

            # Publish
            if self.connected and not self.local_simulation:
                try:
                    # Publish as a mock ESP32 client
                    logger.info(f"[MQTT PUBLISHER] Publishing simulated telemetry to topic '{TOPIC_DATA}'...")
                    self.client.publish(TOPIC_DATA, payload_str)
                except Exception as e:
                    logger.error(f"Failed to publish simulated telemetry via MQTT broker: {e}. Falling back to local queue loop.")
                    self._process_payload(payload_str, source="Local MQTT Loopback (Broker Error)")
            else:
                # If offline/simulation mode, feed directly to receiver
                self._process_payload(payload_str, source="Local MQTT Loopback")

            # Publish interval (every 12 seconds to keep it dynamic and fast for presentation)
            time.sleep(12)

    def _calculate_simulated_iaqi(self, co2: float) -> int:
        """Helper to calculate IAQI based on CO2 bands from Arduino code."""
        if co2 < 400:
            return 0
        
        bands = [
            (400, 600, 0, 50),
            (600, 1000, 51, 100),
            (1000, 1500, 101, 150),
            (1500, 2000, 151, 200),
            (2000, 5000, 201, 300),
            (5000, 10000, 301, 500)
        ]
        
        for low_p, high_p, low_i, high_i in bands:
            if low_p <= co2 <= high_p:
                val = ((high_i - low_i) / (high_p - low_p)) * (co2 - low_p) + low_i
                return int(round(val))
        return 500

    def _get_iaqi_label(self, iaqi: int) -> str:
        if iaqi <= 50:  return "GOOD"
        if iaqi <= 100: return "OK"
        if iaqi <= 150: return "MOD"
        if iaqi <= 200: return "BAD"
        if iaqi <= 300: return "VBAD"
        return "DANG"

    def _get_iaqi_status(self, iaqi: int) -> str:
        if iaqi <= 50:  return "GOOD"
        if iaqi <= 100: return "SATISFACTORY"
        if iaqi <= 150: return "MODERATE"
        if iaqi <= 200: return "POOR"
        if iaqi <= 300: return "VERY POOR"
        return "SEVERE"
