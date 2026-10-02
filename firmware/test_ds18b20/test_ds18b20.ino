/*
 * DS18B20 test — one sensor, or three on the same wire.
 *
 * Nothing else. No wifi, no backend, no pump. Just: are the probes alive, and which
 * address belongs to which probe? Get this working before adding anything on top,
 * because every later bug is easier to find when you already trust the thermometers.
 *
 * LIBRARIES (Sketch > Include Library > Manage Libraries)
 *   OneWire             by Paul Stoffregen
 *   DallasTemperature   by Miles Burton
 *
 * BOARD: NodeMCU-32S, or ESP32 Dev Module.
 * SERIAL MONITOR: 115200 baud.
 *
 * WIRING — read the letters printed on the module, do not go by wire colour.
 *   S  (signal) -> GPIO 4
 *   +  (V, VCC) -> 3V3
 *   -  (G, GND) -> GND
 *
 * All the probes share those same three pins. They are on one bus and each carries
 * its own address, which is why one wire can hold eight of them.
 *
 * If a probe gets hot to the touch, unplug it now: + and - are swapped.
 */

#include <OneWire.h>
#include <DallasTemperature.h>

#define PIN_ONEWIRE 4
#define MAX_SENSORS 8

OneWire oneWire(PIN_ONEWIRE);
DallasTemperature sensors(&oneWire);

DeviceAddress addr[MAX_SENSORS];
int found = 0;

// Lowest temperature each probe has settled at, used to spot the one you are
// holding. See the note in loop().
float baseline[MAX_SENSORS];

void printAddress(const DeviceAddress a) {
  for (int i = 0; i < 8; i++) {
    if (a[i] < 16) Serial.print("0");
    Serial.print(a[i], HEX);
  }
}

/*
 * The same address in the exact form the main sketch wants pasted into PROBE[].
 * Copying hex by hand off a serial log is how probes end up swapped, so print it
 * ready to paste instead.
 */
void printAddressAsCode(const DeviceAddress a) {
  Serial.print("{");
  for (int i = 0; i < 8; i++) {
    Serial.print("0x");
    if (a[i] < 16) Serial.print("0");
    Serial.print(a[i], HEX);
    if (i < 7) Serial.print(", ");
  }
  Serial.print("}");
}

void scan() {
  sensors.begin();
  found = sensors.getDeviceCount();
  if (found > MAX_SENSORS) found = MAX_SENSORS;

  Serial.println();
  Serial.printf("Found %d DS18B20 sensor(s)\n", found);

  for (int i = 0; i < found; i++) {
    if (!sensors.getAddress(addr[i], i)) continue;
    sensors.setResolution(addr[i], 11);  // ~0.125 C, and converts faster than 12-bit
    baseline[i] = 1000.0;                // nothing measured yet

    Serial.printf("  Sensor %d address: ", i);
    printAddress(addr[i]);
    Serial.print("   paste as: ");
    printAddressAsCode(addr[i]);
    Serial.println();
  }

  if (found == 0) {
    Serial.println("  Nothing on the bus. Check S is on GPIO 4, and + and - are not");
    Serial.println("  swapped. Rescanning every few seconds — just fix the wire, no");
    Serial.println("  need to reset the board.");
  }
  Serial.println("----");
}

void setup() {
  Serial.begin(115200);
  delay(400);
  Serial.println();
  Serial.println("=== SweatShell DS18B20 test ===");
  scan();
}

void loop() {
  // Keep looking while nothing is connected, so wiggling a dupont wire is enough to
  // bring it to life. Hunting for a reset button with both hands full of jumper
  // leads is its own small misery.
  if (found == 0) {
    delay(3000);
    scan();
    return;
  }

  sensors.requestTemperatures();

  for (int i = 0; i < found; i++) {
    float c = sensors.getTempC(addr[i]);

    Serial.printf("Sensor %d: ", i);

    if (c <= -100.0) {
      // The library's "I asked and nobody answered" value.
      Serial.println("not answering — check the wire");
      continue;
    }
    if (c > 84.9 && c < 85.1) {
      // 85.00 exactly is the DS18B20's power-on default. It means the chip powered up
      // but has not completed a conversion — usually the first reading, sometimes a
      // marginal 3V3 connection.
      Serial.println("85.00 C — that is the power-on default, not a real reading");
      continue;
    }

    Serial.printf("%.2f C", c);

    /*
     * Which probe is which?
     *
     * The order they enumerate in has nothing to do with the order you plugged them
     * in, so pinching one between your fingers is how you find out. Each probe
     * remembers the coolest it has settled at, and anything more than 1.5 C above
     * that is the one in your hand. Label it, then do the next.
     */
    if (c < baseline[i]) baseline[i] = c;
    if (c > baseline[i] + 1.5) Serial.print("   <-- this one is warming");

    Serial.println();
  }

  Serial.println("----");
  delay(1000);

  // A probe pulled out mid-run should be noticed rather than reported forever.
  if (sensors.getDeviceCount() != found) {
    Serial.println("Sensor count changed — rescanning.");
    scan();
  }
}
