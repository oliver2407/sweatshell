/*
 * Step 2 — one sensor, over wifi, into the app.
 *
 * Step 1 proved the DS18B20 reads a temperature. This sketch takes that same
 * reading and puts it on the screen of the app. Nothing else: no load cell, no
 * humidity sensor, no pump. One thing at a time, so when it breaks you know which
 * thing broke.
 *
 * Wiring is unchanged from the step 1 test:
 *   DS18B20  S  -> GPIO 4
 *   DS18B20  +  -> 3V3
 *   DS18B20  -  -> GND
 *
 * Libraries (Sketch -> Include Library -> Manage Libraries):
 *   OneWire             by Paul Stoffregen      <- already installed in step 1
 *   DallasTemperature   by Miles Burton         <- already installed in step 1
 *   ArduinoJson         by Benoit Blanchon      <- NEW, install this one
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------- fill these in

const char *WIFI_SSID = "YOUR_WIFI";
const char *WIFI_PASS = "YOUR_PASSWORD";

/*
 * The laptop running the backend, as the ESP32 sees it on the network.
 *
 * This must be the laptop's LAN address (192.168.x.x or 10.x.x.x), NOT localhost.
 * To the ESP32, 127.0.0.1 means the ESP32 itself, so it will try to call itself and
 * fail with -1 forever.
 *
 *   Mac:      ipconfig getifaddr en0
 *   Windows:  ipconfig        (look for IPv4 Address)
 *
 * And start the backend so it listens to the network, not just to itself:
 *   uvicorn main:app --host 0.0.0.0 --port 8000
 */
const char *API_BASE = "http://192.168.1.50:8000";

// --------------------------------------------------------------------- hardware

#define PIN_ONEWIRE 4

OneWire oneWire(PIN_ONEWIRE);
DallasTemperature sensors(&oneWire);

const unsigned long POST_EVERY_MS = 3000;
unsigned long lastPost = 0;

// ------------------------------------------------------------------------ setup

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== SweatShell step 2: one sensor over wifi ===");

  sensors.begin();
  Serial.printf("Found %d DS18B20 sensor(s)\n", sensors.getDeviceCount());
  if (sensors.getDeviceCount() == 0) {
    Serial.println("No sensor. Check S is on GPIO 4 before going further.");
  }

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Joining wifi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\nConnected. This ESP32 is %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Posting to %s every %lus\n\n", API_BASE, POST_EVERY_MS / 1000);
}

// ------------------------------------------------------------------------- loop

void loop() {
  if (millis() - lastPost < POST_EVERY_MS) {
    delay(20);
    return;
  }
  lastPost = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wifi dropped, reconnecting…");
    WiFi.reconnect();
    return;
  }

  sensors.requestTemperatures();
  float c = sensors.getTempCByIndex(0);

  // The library returns -127 when a probe did not answer. Posting that would drag
  // every average on the server down, so we skip the reading instead.
  if (c <= -100.0f) {
    Serial.println("Sensor did not answer this time, skipping.");
    return;
  }

  /*
   * The JSON has to match the backend's Reading model key for key. A wrong key is
   * not an error — the backend accepts the request and quietly stores nothing, and
   * the app shows a dash. So: "inside", not "insides"; "box3", not "box_3".
   *
   * box3 is the house with SweatShell on it, which is the number the app puts on
   * screen. While there is one probe, send it as box3 so there is something to see.
   */
  JsonDocument doc;
  doc["inside"]["box3"] = roundf(c * 100) / 100.0f;
  doc["roof"]["box3"] = nullptr;   // no roof probe yet
  doc["gel_mass_g"] = nullptr;     // no load cell yet
  doc["humidity"] = nullptr;       // no humidity sensor yet
  doc["pump_on"] = false;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(API_BASE) + "/api/reading");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);

  Serial.printf("%.2f C  ->  HTTP %d", c, code);
  if (code == 200) {
    Serial.println("  OK, check the app");
  } else if (code < 0) {
    Serial.println("  could not connect: wrong IP, wrong network, or firewall");
  } else if (code == 422) {
    Serial.println("  reached the server but the JSON was the wrong shape");
  } else if (code == 404) {
    Serial.println("  wrong path, should be /api/reading");
  } else {
    Serial.println();
  }
  http.end();
}
