/*
 * SweatShell rig firmware — ESP32.
 *
 * Reads eight DS18B20 probes (a roof-surface and an inside-air probe in each of the
 * four mini houses), a load cell under the gel tray, and a humidity sensor. POSTs
 * the lot to the backend every few seconds, then asks the backend whether to run
 * the pump.
 *
 * The device holds no logic of its own on purpose. It measures, it reports, and it
 * does what it is told. Every threshold lives in the backend, so changing when the
 * gel gets watered is a dashboard toggle, not a reflash five minutes before judging.
 *
 * Libraries (Arduino Library Manager):
 *   - OneWire            by Paul Stoffregen
 *   - DallasTemperature  by Miles Burton
 *   - HX711              by Bogdan Necula   (bogde/HX711)
 *   - Adafruit SHT31     by Adafruit        (plus Adafruit BusIO)
 *   - ArduinoJson        by Benoit Blanchon (v7)
 *
 * Board: "ESP32 Dev Module".
 *
 * WIRING
 *   DS18B20 data ------- GPIO 4   (all eight share one bus; 4.7k pull-up to 3V3)
 *   HX711 DOUT --------- GPIO 16
 *   HX711 SCK ---------- GPIO 17
 *   SHT31 SDA ---------- GPIO 21
 *   SHT31 SCL ---------- GPIO 22
 *   Relay IN ----------- GPIO 26  (drives a 12V pump on its OWN supply)
 *   Status LED --------- GPIO 2   (on-board)
 *
 * The pump runs off a separate 12V supply through the relay. Do not try to pull pump
 * current through the ESP32's 3V3 rail; it will brown out mid-demo and you will spend
 * the last hour debugging a power problem instead of the experiment. Common the
 * grounds, keep the wet side away from the board, and nothing on this rig touches
 * mains voltage.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <HX711.h>
#include <Wire.h>
#include <Adafruit_SHT31.h>
#include <ArduinoJson.h>

// ---------------------------------------------------------------- configuration

const char *WIFI_SSID = "YOUR_WIFI";
const char *WIFI_PASS = "YOUR_PASSWORD";

// The laptop running `uvicorn main:app --host 0.0.0.0`. Use its LAN IP, not
// 127.0.0.1 — that address means "the ESP32 itself".
const char *API_BASE = "http://192.168.1.50:8000";

const unsigned long POST_INTERVAL_MS = 3000;

// --------------------------------------------------------------------- hardware

#define PIN_ONEWIRE 4
#define PIN_HX711_DOUT 16
#define PIN_HX711_SCK 17
#define PIN_RELAY 26
#define PIN_LED 2

OneWire oneWire(PIN_ONEWIRE);
DallasTemperature sensors(&oneWire);
HX711 scale;
Adafruit_SHT31 sht31 = Adafruit_SHT31();
bool hasSHT = false;

/*
 * DS18B20 addresses.
 *
 * Every probe carries a unique 64-bit address and the order they enumerate in is
 * NOT the order you plugged them in. Run the rig once with PRINT_ADDRESSES set to
 * true, drop each probe in warm water one at a time to see which address moves,
 * and paste the results here. Skipping this step is how box 3 ends up reporting
 * box 1's temperature and the whole experiment quietly reads backwards.
 */
#define PRINT_ADDRESSES false

DeviceAddress PROBE[8] = {
    {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01},  // 0: box1 roof
    {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02},  // 1: box1 inside
    {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03},  // 2: box2 roof
    {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04},  // 3: box2 inside
    {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05},  // 4: box3 roof
    {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x06},  // 5: box3 inside
    {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x07},  // 6: box4 roof
    {0x28, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08},  // 7: box4 inside
};

/*
 * Load cell calibration.
 *
 * Put a known mass on the tray (a 500 mL water bottle is 500 g), read the raw
 * value, and set HX711_SCALE = raw / grams. An uncalibrated scale makes the water
 * gauge and every cooling figure derived from it meaningless.
 */
const float HX711_SCALE = 420.0f;

// ------------------------------------------------------------------- pump state

bool pumpOn = false;
unsigned long pumpOffAt = 0;
unsigned long lastPost = 0;

// ------------------------------------------------------------------------ setup

void printAddresses() {
  int n = sensors.getDeviceCount();
  Serial.printf("Found %d DS18B20 probes:\n", n);
  for (int i = 0; i < n; i++) {
    DeviceAddress a;
    if (!sensors.getAddress(a, i)) continue;
    Serial.printf("  [%d] {", i);
    for (int j = 0; j < 8; j++) Serial.printf("0x%02X%s", a[j], j < 7 ? ", " : "");
    sensors.requestTemperatures();
    Serial.printf("}  reads %.2f C\n", sensors.getTempC(a));
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(PIN_RELAY, OUTPUT);
  digitalWrite(PIN_RELAY, LOW);  // pump off before anything else happens
  pinMode(PIN_LED, OUTPUT);

  sensors.begin();
  sensors.setResolution(11);  // ~0.125 C, and a faster conversion than 12-bit
  if (PRINT_ADDRESSES) printAddresses();

  scale.begin(PIN_HX711_DOUT, PIN_HX711_SCK);
  scale.set_scale(HX711_SCALE);
  // Tare with the EMPTY tray in place, so the reported mass is water plus pad only.
  scale.tare();

  Wire.begin(21, 22);
  hasSHT = sht31.begin(0x44);
  if (!hasSHT) Serial.println("No SHT31 found — humidity will be reported as null.");

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Joining wifi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\nConnected. ESP32 is %s\n", WiFi.localIP().toString().c_str());
}

// ------------------------------------------------------------------------- loop

float readProbe(int i) {
  float c = sensors.getTempC(PROBE[i]);
  // The library returns -127 for a probe that did not answer. Send null instead of
  // a number: a fake -127 would poison every average downstream.
  return (c <= -100.0f) ? NAN : c;
}

void addTemp(JsonObject obj, const char *key, float v) {
  if (isnan(v)) obj[key] = nullptr;
  else obj[key] = roundf(v * 100) / 100.0f;
}

void postReading() {
  sensors.requestTemperatures();

  JsonDocument doc;
  JsonObject roof = doc["roof"].to<JsonObject>();
  JsonObject inside = doc["inside"].to<JsonObject>();

  addTemp(roof, "box1", readProbe(0));
  addTemp(inside, "box1", readProbe(1));
  addTemp(roof, "box2", readProbe(2));
  addTemp(inside, "box2", readProbe(3));
  addTemp(roof, "box3", readProbe(4));
  addTemp(inside, "box3", readProbe(5));
  addTemp(roof, "box4", readProbe(6));
  addTemp(inside, "box4", readProbe(7));

  if (scale.is_ready()) {
    doc["gel_mass_g"] = roundf(scale.get_units(5) * 10) / 10.0f;
  } else {
    doc["gel_mass_g"] = nullptr;
  }

  if (hasSHT) {
    float t = sht31.readTemperature();
    float h = sht31.readHumidity();
    doc["ambient_c"] = isnan(t) ? JsonVariant() : JsonVariant(roundf(t * 100) / 100.0f);
    doc["humidity"] = isnan(h) ? JsonVariant() : JsonVariant(roundf(h * 10) / 10.0f);
  }

  doc["pump_on"] = pumpOn;

  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin(String(API_BASE) + "/api/reading");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  if (code != 200) Serial.printf("POST /api/reading -> %d\n", code);
  http.end();
}

void pollPump() {
  HTTPClient http;
  http.begin(String(API_BASE) + "/api/pump/command");
  int code = http.GET();
  if (code == 200) {
    JsonDocument doc;
    if (!deserializeJson(doc, http.getString()) && doc["pump"].as<bool>()) {
      float secs = doc["seconds"] | 5.0f;
      // Hard ceiling in firmware as well as in the backend. If the network hiccups
      // and the same command arrives twice, the worst case is a short overflow, not
      // a pump that runs until the bucket is empty.
      if (secs > 20.0f) secs = 20.0f;
      digitalWrite(PIN_RELAY, HIGH);
      digitalWrite(PIN_LED, HIGH);
      pumpOn = true;
      pumpOffAt = millis() + (unsigned long)(secs * 1000);
      Serial.printf("Pump on for %.1fs\n", secs);
    }
  }
  http.end();
}

void loop() {
  // Stopping the pump is checked every pass, not on the post interval, so a stalled
  // network request can never leave it running.
  if (pumpOn && (long)(millis() - pumpOffAt) >= 0) {
    digitalWrite(PIN_RELAY, LOW);
    digitalWrite(PIN_LED, LOW);
    pumpOn = false;
    Serial.println("Pump off");
  }

  if (millis() - lastPost >= POST_INTERVAL_MS) {
    lastPost = millis();
    if (WiFi.status() == WL_CONNECTED) {
      postReading();
      pollPump();
    } else {
      Serial.println("Wifi dropped, reconnecting…");
      WiFi.reconnect();
    }
  }

  delay(20);
}
