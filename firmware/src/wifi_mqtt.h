#ifndef WIFI_MQTT_H
#define WIFI_MQTT_H

#include <Arduino.h>

void setupWiFiAndMQTT();
void loopWiFiAndMQTT();
bool isWiFiConnected();
void publishMQTT(float pm1_0, float pm2_5, float pm10_0, float aqi, bool sensor_fault);
void saveWiFiCredentials(String ssid, String pass);

#endif
