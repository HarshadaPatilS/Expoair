#include "wifi_mqtt.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <time.h>

Preferences preferences;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;

String stored_ssid = "";
String stored_pass = "";
String device_mac = "";
String mqtt_client_id = "";
String mqtt_topic = "";

unsigned long lastMqttPublish = 0;
unsigned long lastMqttReconnect = 0;

void setupWiFiAndMQTT() {
    device_mac = WiFi.macAddress();
    device_mac.replace(":", "");
    // client id: expoair_ + last 4 bytes (8 hex chars). MAC is 6 bytes (12 chars). Last 4 bytes = last 8 chars.
    if (device_mac.length() == 12) {
        mqtt_client_id = "expoair_" + device_mac.substring(4);
    } else {
        mqtt_client_id = "expoair_unknown";
    }
    
    mqtt_topic = "expoair/readings/" + device_mac;

    preferences.begin("wifi_creds", false);
    stored_ssid = preferences.getString("ssid", "");
    stored_pass = preferences.getString("pass", "");
    preferences.end();

    mqttClient.setServer(mqtt_server, mqtt_port);

    if (stored_ssid != "") {
        Serial.print("Connecting to WiFi: ");
        Serial.println(stored_ssid);
        WiFi.begin(stored_ssid.c_str(), stored_pass.c_str());
        
        unsigned long startAttemptTime = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 15000) {
            delay(500);
            Serial.print(".");
        }
        Serial.println();

        if (WiFi.status() == WL_CONNECTED) {
            Serial.println("WiFi connected.");
            Serial.print("IP address: ");
            Serial.println(WiFi.localIP());
            
            // Set up time sync for timestamps (optional, but good for "ts" field)
            configTime(0, 0, "pool.ntp.org", "time.nist.gov");
        } else {
            Serial.println("WiFi connection timeout. Continuing in BLE-only mode.");
            WiFi.disconnect(true);
            WiFi.mode(WIFI_OFF);
        }
    } else {
        Serial.println("No WiFi credentials found. Continuing in BLE-only mode.");
        WiFi.mode(WIFI_OFF);
    }
}

void saveWiFiCredentials(String ssid, String pass) {
    preferences.begin("wifi_creds", false);
    preferences.putString("ssid", ssid);
    preferences.putString("pass", pass);
    preferences.end();
    
    stored_ssid = ssid;
    stored_pass = pass;
    
    Serial.print("New WiFi credentials saved. Connecting to ");
    Serial.println(ssid);
    
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    WiFi.begin(stored_ssid.c_str(), stored_pass.c_str());
}

bool isWiFiConnected() {
    return WiFi.status() == WL_CONNECTED;
}

void reconnectMQTT() {
    if (!mqttClient.connected()) {
        Serial.print("Attempting MQTT connection to ");
        Serial.print(mqtt_server);
        Serial.print(" as ");
        Serial.print(mqtt_client_id);
        Serial.print("...");
        
        if (mqttClient.connect(mqtt_client_id.c_str())) {
            Serial.println("connected");
        } else {
            Serial.print("failed, rc=");
            Serial.print(mqttClient.state());
            Serial.println(" try again later");
        }
    }
}

void loopWiFiAndMQTT() {
    if (isWiFiConnected()) {
        if (!mqttClient.connected()) {
            if (millis() - lastMqttReconnect > 5000) {
                lastMqttReconnect = millis();
                reconnectMQTT();
            }
        }
        mqttClient.loop();
    }
}

void publishMQTT(float pm1_0, float pm2_5, float pm10_0, float aqi, bool sensor_fault) {
    if (isWiFiConnected()) {
        unsigned long currentMillis = millis();
        // Publish every 30 seconds
        if (currentMillis - lastMqttPublish >= 30000) {
            lastMqttPublish = currentMillis;

            if (mqttClient.connected()) {
                StaticJsonDocument<256> doc;
                doc["pm25"] = pm2_5;
                doc["pm10"] = pm10_0;
                doc["pm1"] = pm1_0;
                doc["aqi"] = aqi;
                if (sensor_fault) {
                    doc["sensor_fault"] = true;
                }
                
                time_t now;
                time(&now);
                doc["ts"] = now; // If NTP not synced, this will just be seconds since boot + 1970
                doc["lat"] = 0;
                doc["lng"] = 0;

                char jsonBuffer[256];
                serializeJson(doc, jsonBuffer);
                
                mqttClient.publish(mqtt_topic.c_str(), jsonBuffer, false); // QoS 0
                Serial.print("MQTT Published to ");
                Serial.print(mqtt_topic);
                Serial.print(": ");
                Serial.println(jsonBuffer);
            }
        }
    }
}
