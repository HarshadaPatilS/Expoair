#include <Arduino.h>
#include <NimBLEDevice.h>
#include <PMS.h>
#include <ArduinoJson.h>
#include "wifi_mqtt.h"

#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "12345678-1234-1234-1234-123456789abd"
#define CONFIG_CHAR_UUID    "12345678-1234-1234-1234-123456789abe"
#define LED_PIN             2 // Built-in LED on ESP32 Dev board

NimBLEServer* pServer = nullptr;
NimBLECharacteristic* pCharacteristic = nullptr;
NimBLECharacteristic* pConfigCharacteristic = nullptr;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// UART2 for PMS5003 (RX=16, TX=17)
HardwareSerial pmsSerial(2);
PMS pms(pmsSerial);
PMS::DATA data;

unsigned long previousMillis = 0;
const long interval = 10000;

unsigned long ledPreviousMillis = 0;
int ledState = LOW;

// --- Sensor Accuracy & Filtering Components ---

// 1. Humidity correction
float correctPM25(float raw_pm25, float humidity) {
    if (humidity > 0.0 && humidity < 100.0) {
        float kappa = 0.25;  // hygroscopic growth factor
        float correction = raw_pm25 / (1.0 + kappa * (humidity / (100.0 - humidity)));
        return correction;
    }
    return raw_pm25;
}

float estimateHumidity(float pm25, float pm10) {
    // Software estimate: high PM2.5/PM10 ratio often indicates water droplet interference
    if (pm10 > 0 && pm25 > pm10 * 0.8) {
        return 80.0;
    }
    return 45.0; // Assume normal humidity
}

// 2. Rolling Average Filter
#define BUFFER_SIZE 5
float pm1_buffer[BUFFER_SIZE] = {0};
float pm25_buffer[BUFFER_SIZE] = {0};
float pm10_buffer[BUFFER_SIZE] = {0};
int buf_idx = 0;
bool buffer_filled = false;

void sortArray(float* array, int size) {
    for (int i = 0; i < size - 1; i++) {
        for (int j = 0; j < size - i - 1; j++) {
            if (array[j] > array[j+1]) {
                float temp = array[j];
                array[j] = array[j+1];
                array[j+1] = temp;
            }
        }
    }
}

float getMedian(float* buffer, int size) {
    if (size <= 0) return 0;
    float tempBuffer[BUFFER_SIZE];
    for(int i = 0; i < size; i++) tempBuffer[i] = buffer[i];
    sortArray(tempBuffer, size);
    return tempBuffer[size / 2];
}

// 3. AQI Conversion
float pm25ToAQI(float pm25) {
    float cLow, cHigh, aLow, aHigh;
    if (pm25 <= 12.0) {
        cLow = 0.0; cHigh = 12.0; aLow = 0; aHigh = 50;
    } else if (pm25 <= 35.4) {
        cLow = 12.1; cHigh = 35.4; aLow = 51; aHigh = 100;
    } else if (pm25 <= 55.4) {
        cLow = 35.5; cHigh = 55.4; aLow = 101; aHigh = 150;
    } else if (pm25 <= 150.4) {
        cLow = 55.5; cHigh = 150.4; aLow = 151; aHigh = 200;
    } else if (pm25 <= 250.4) {
        cLow = 150.5; cHigh = 250.4; aLow = 201; aHigh = 300;
    } else if (pm25 <= 350.4) {
        cLow = 250.5; cHigh = 350.4; aLow = 301; aHigh = 400;
    } else {
        cLow = 350.5; cHigh = 500.4; aLow = 401; aHigh = 500;
        if (pm25 > 500.4) pm25 = 500.4;
    }
    return ((aHigh - aLow) / (cHigh - cLow)) * (pm25 - cLow) + aLow;
}

// 4. Self-test state
int self_test_count = 0;
int self_test_fail_count = 0;
bool sensor_fault = false;

// --- BLE Callbacks ---

class MyServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer) {
        deviceConnected = true;
    }

    void onDisconnect(NimBLEServer* pServer) {
        deviceConnected = false;
    }
};

class ConfigCharCallbacks: public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pCharacteristic) {
        std::string rxValue = pCharacteristic->getValue();
        if (rxValue.length() > 0) {
            Serial.print("Received Config via BLE: ");
            Serial.println(rxValue.c_str());
            
            StaticJsonDocument<200> doc;
            DeserializationError error = deserializeJson(doc, rxValue);
            if (!error) {
                const char* ssid = doc["ssid"];
                const char* pass = doc["pass"];
                if (ssid && pass) {
                    saveWiFiCredentials(String(ssid), String(pass));
                }
            } else {
                Serial.println("Failed to parse config JSON");
            }
        }
    }
};

void setup() {
    Serial.begin(115200);
    pmsSerial.begin(9600, SERIAL_8N1, 16, 17);
    
    pinMode(LED_PIN, OUTPUT);

    // Initialize WiFi and MQTT
    setupWiFiAndMQTT();

    // Initialize BLE
    NimBLEDevice::init("ExpoAir");
    
    pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    NimBLEService *pService = pServer->createService(SERVICE_UUID);

    // Notify characteristic for readings
    pCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        NIMBLE_PROPERTY::NOTIFY
    );
    
    // Write characteristic for WiFi config
    pConfigCharacteristic = pService->createCharacteristic(
        CONFIG_CHAR_UUID,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
    );
    pConfigCharacteristic->setCallbacks(new ConfigCharCallbacks());

    pService->start();

    // Start advertising
    NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->start();
    
    Serial.println("ExpoAir BLE Peripheral started. Waiting for connections...");
}

void loop() {
    unsigned long currentMillis = millis();
    
    // Handle WiFi/MQTT logic in background
    loopWiFiAndMQTT();
    
    // LED status indicator:
    // Fast blink (200ms): No BLE client
    // Slow blink (1000ms): BLE client connected
    // Error blink (100ms): Sensor fault
    long blinkInterval;
    if (sensor_fault) {
        blinkInterval = 100;
    } else {
        blinkInterval = deviceConnected ? 1000 : 200;
    }
    
    if (currentMillis - ledPreviousMillis >= blinkInterval) {
        ledPreviousMillis = currentMillis;
        ledState = (ledState == LOW) ? HIGH : LOW;
        digitalWrite(LED_PIN, ledState);
    }

    // BLE disconnect logic
    if (!deviceConnected && oldDeviceConnected) {
        delay(500); 
        pServer->startAdvertising(); 
        Serial.println("Client disconnected. Restarted advertising.");
        oldDeviceConnected = deviceConnected;
    }
    
    // BLE connect logic
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
        Serial.println("Client connected.");
    }

    // PMS5003 reading every 10 seconds
    if (currentMillis - previousMillis >= interval) {
        previousMillis = currentMillis;
        
        // Solid on: Reading in progress (only if no sensor fault, otherwise let it blink fast)
        if (!sensor_fault) {
            digitalWrite(LED_PIN, HIGH);
        }
        
        Serial.println("Attempting to read from PMS5003...");
        if (pms.readUntil(data)) {
            Serial.println("--- PMS5003 Reading ---");
            
            float raw_pm1 = data.PM_AE_UG_1_0;
            float raw_pm25 = data.PM_AE_UG_2_5;
            float raw_pm10 = data.PM_AE_UG_10_0;
            
            // 4. Self-test on boot
            if (self_test_count < 3) {
                if (raw_pm25 > 500.0 || raw_pm25 == 0.0) {
                    self_test_fail_count++;
                }
                self_test_count++;
                if (self_test_count == 3) {
                    if (self_test_fail_count == 3) {
                        sensor_fault = true;
                        Serial.println("SENSOR FAULT DETECTED: Unreasonable PM2.5 values.");
                    } else {
                        Serial.println("Sensor self-test passed.");
                    }
                }
            }
            
            // 1. Humidity correction
            float estimated_humidity = estimateHumidity(raw_pm25, raw_pm10);
            float corrected_pm25 = correctPM25(raw_pm25, estimated_humidity);
            
            // 2. Rolling average filter
            pm1_buffer[buf_idx] = raw_pm1;
            pm25_buffer[buf_idx] = corrected_pm25;
            pm10_buffer[buf_idx] = raw_pm10;
            buf_idx++;
            if (buf_idx >= BUFFER_SIZE) {
                buf_idx = 0;
                buffer_filled = true;
            }
            
            int elements_to_sort = buffer_filled ? BUFFER_SIZE : buf_idx;
            
            float med_pm1 = getMedian(pm1_buffer, elements_to_sort);
            float med_pm25 = getMedian(pm25_buffer, elements_to_sort);
            float med_pm10 = getMedian(pm10_buffer, elements_to_sort);
            
            Serial.print("Median PM 1.0 (ug/m3): "); Serial.println(med_pm1);
            Serial.print("Median PM 2.5 (ug/m3): "); Serial.println(med_pm25);
            Serial.print("Median PM 10.0 (ug/m3): "); Serial.println(med_pm10);
            
            // 3. AQI conversion
            float aqi = pm25ToAQI(med_pm25);
            Serial.print("Calculated AQI: "); Serial.println(aqi);
            
            // Multiply each by 10 (send as uint16, preserve 1 decimal)
            uint16_t pm1_send  = med_pm1 * 10;
            uint16_t pm25_send = med_pm25 * 10;
            uint16_t pm10_send = med_pm10 * 10;
            
            // Pack into 6-byte array: [pm25_high, pm25_low, pm10_high, pm10_low, pm1_high, pm1_low]
            uint8_t payload[6];
            payload[0] = (pm25_send >> 8) & 0xFF;
            payload[1] = pm25_send & 0xFF;
            payload[2] = (pm10_send >> 8) & 0xFF;
            payload[3] = pm10_send & 0xFF;
            payload[4] = (pm1_send >> 8) & 0xFF;
            payload[5] = pm1_send & 0xFF;
            
            if (deviceConnected) {
                pCharacteristic->setValue(payload, sizeof(payload));
                pCharacteristic->notify();
                Serial.println("Notified BLE clients.");
            }
            
            // Publish to MQTT (if connected, throttled to 30s internally)
            publishMQTT(med_pm1, med_pm25, med_pm10, aqi, sensor_fault);
            
        } else {
            Serial.println("No data from PMS5003.");
        }
        
        // Deep sleep between readings (only if no BLE client connected AND WiFi is OFF)
        if (!deviceConnected && !isWiFiConnected()) {
            Serial.println("No BLE client and No WiFi. Entering light sleep for 10 seconds...");
            Serial.flush();
            
            esp_sleep_enable_timer_wakeup(10 * 1000000);  // 10 sec
            esp_light_sleep_start();
            
            // Adjust the timer after waking up. 
            previousMillis = millis() - interval; 
        }
    }
}
