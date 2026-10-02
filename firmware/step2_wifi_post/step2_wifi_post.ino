/*
 * Step 2 — one sensor, over wifi, into the app.
 *
 * Step 1 proved the DS18B20 reads a temperature. This sketch takes that same
 * reading and puts it on the screen of the app. Nothing else: no load cell, no
 * humidity sensor, no pump. One thing at a time, so when it breaks you know which
 * thing broke.
 *
 * TWO COMPUTERS
 *
 * The machine that flashes this sketch and the machine that runs the backend do not
 * have to be the same one, and usually are not. The ESP32 has no idea which computer
 * compiled it. All that matters is that API_BASE points at whichever machine is
 * running `uvicorn`, and that the ESP32 can reach it over the network.
 *
 * So the wifi name, the wifi password and the API address are NOT baked into the
 * binary. They are saved on the ESP32 itself and can be retyped over the serial
 * port, from any computer, with no toolchain and no reflash:
 *
 *     show                              what is saved right now
 *     api http://192.168.1.50:8000      point it at a different machine
 *     wifi MyNetwork my-password        join a different network
 *     reboot
 *
 * On a Mac that needs nothing installed:  screen /dev/cu.usbserial-0001 115200
 * (quit with Ctrl-A then K). The Arduino IDE's Serial Monitor works too, as does
 * PuTTY on Windows. Whoever has the cable can retarget it.
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
#include <Preferences.h>

// ------------------------------------------------- defaults, used on a fresh chip

// These are only the starting values. Once anything is set over serial, the saved
// value wins and editing these does nothing until the ESP32 is erased.
const char *DEFAULT_SSID = "YOUR_WIFI";
const char *DEFAULT_PASS = "YOUR_PASSWORD";

/*
 * The machine running the backend, as the ESP32 sees it on the network.
 *
 * This must be that machine's LAN address (192.168.x.x or 10.x.x.x), NOT localhost.
 * To the ESP32, 127.0.0.1 means the ESP32 itself, so it will try to call itself and
 * fail with -1 forever.
 *
 *   Mac:      ipconfig getifaddr en0
 *   Windows:  ipconfig        (look for IPv4 Address)
 *
 * And start the backend so it listens to the network, not just to itself:
 *   uvicorn main:app --host 0.0.0.0 --port 8000
 */
const char *DEFAULT_API = "http://192.168.1.50:8000";

// --------------------------------------------------------------------- hardware

#define PIN_ONEWIRE 4

OneWire oneWire(PIN_ONEWIRE);
DallasTemperature sensors(&oneWire);
Preferences prefs;

String ssid, pass, apiBase;

const unsigned long POST_EVERY_MS = 3000;
const unsigned long WIFI_TIMEOUT_MS = 20000;
unsigned long lastPost = 0;

// ------------------------------------------------------------------- settings

void loadSettings() {
  prefs.begin("sweatshell", false);
  ssid = prefs.getString("ssid", DEFAULT_SSID);
  pass = prefs.getString("pass", DEFAULT_PASS);
  apiBase = prefs.getString("api", DEFAULT_API);
}

void showSettings() {
  Serial.println("--- settings ---");
  Serial.printf("  wifi : %s\n", ssid.c_str());
  Serial.printf("  api  : %s\n", apiBase.c_str());
  Serial.printf("  state: %s\n",
                WiFi.status() == WL_CONNECTED
                    ? WiFi.localIP().toString().c_str()
                    : "not connected");
  Serial.println("  commands: show | api <url> | wifi <ssid> <password> | reboot");
  Serial.println("----------------");
}

void connectWifi() {
  Serial.printf("Joining \"%s\"", ssid.c_str());
  WiFi.disconnect(true);
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < WIFI_TIMEOUT_MS) {
    delay(400);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConnected. This ESP32 is %s\n", WiFi.localIP().toString().c_str());
  } else {
    // Deliberately not an infinite loop. A wrong password used to mean reflashing,
    // because the sketch never reached the point where it could listen for a new
    // one. Giving up after twenty seconds leaves the serial commands reachable.
    Serial.println("\nCould not join. Fix it over serial:");
    Serial.println("  wifi <ssid> <password>");
  }
}

/** Serial commands. Reachable whether or not the wifi ever came up. */
void handleSerial() {
  if (!Serial.available()) return;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return;

  if (line == "show") {
    showSettings();
  } else if (line == "reboot") {
    Serial.println("Rebooting…");
    delay(200);
    ESP.restart();
  } else if (line.startsWith("api ")) {
    apiBase = line.substring(4);
    apiBase.trim();
    prefs.putString("api", apiBase);
    Serial.printf("Saved. Now posting to %s\n", apiBase.c_str());
  } else if (line.startsWith("wifi ")) {
    String rest = line.substring(5);
    rest.trim();
    int sp = rest.indexOf(' ');
    if (sp < 0) {
      Serial.println("Need both: wifi <ssid> <password>");
      return;
    }
    ssid = rest.substring(0, sp);
    // Everything after the first space is the password, so a password containing
    // spaces survives.
    pass = rest.substring(sp + 1);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    Serial.println("Saved. Reconnecting…");
    connectWifi();
  } else {
    Serial.println("Unknown. Try: show | api <url> | wifi <ssid> <password> | reboot");
  }
}

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

  loadSettings();
  showSettings();
  connectWifi();
}

// ------------------------------------------------------------------------- loop

void loop() {
  handleSerial();

  if (millis() - lastPost < POST_EVERY_MS) {
    delay(20);
    return;
  }
  lastPost = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No wifi. Type: wifi <ssid> <password>");
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
  http.begin(apiBase + "/api/reading");
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
