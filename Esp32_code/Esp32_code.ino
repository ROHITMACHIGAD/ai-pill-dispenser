#include <WiFi.h>
#include <HTTPClient.h>
#include <ESP32Servo.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <ArduinoJson.h>
#include <PulseSensorPlayground.h>
#include <vector>
struct PillSchedule {
  String time;
  String pill;
  int quantity;
  bool dispensed;
};
// Hardware Configuration
#define SERVO_A_PIN 13
#define SERVO_B_PIN 14
#define BUZZER_PIN 12
#define IR_PIN 15
#define DISPENSE_IR_PIN 2  // New IR sensor pin
bool awaitingDispense = false;  // Added state flag
PillSchedule currentSchedule;   // Added to track current dosage
#define PULSE_PIN 34
PulseSensorPlayground pulseSensor;
bool measurementAllowed = false; // Starts disabled
unsigned long lastTrigger = 0;
// Servo Objects
Servo dispenserServoA;
Servo dispenserServoB;

// Sensor Objects

WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 19800); // IST offset

// WiFi Credentials
const char* ssid = "machigad_4G";
const char* password = "Machigad@123";

// API Configuration
const char* serverURL = "http://192.168.29.158:5001/api/pills";
const char* API_URL = "http://192.168.29.158:5001/api/bpm";


std::vector<PillSchedule> pillSchedules;

unsigned long lastCheck = 0;
const unsigned long checkInterval = 60000; // Check every 3 seconds

void setup() {
  Serial.begin(115200);
  
  // Initialize Hardware
    pulseSensor.analogInput(PULSE_PIN);

  pulseSensor.setThreshold(550);
  pulseSensor.begin();
  pinMode(IR_PIN, INPUT_PULLUP);
  pinMode(DISPENSE_IR_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  dispenserServoA.attach(SERVO_A_PIN);
  dispenserServoB.attach(SERVO_B_PIN);
  
  // Initialize Pulse Sensor


  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  
  // Initialize Time Client
  timeClient.begin();
  timeClient.forceUpdate();
}

void loop() {
  timeClient.update();
   handleWiFi();      // Non-blocking connection check
  handleIRSensor();   // Strict IR trigger control
  handlePulse();   
  handleDispenseConfirmation();

  unsigned long currentMillis = millis();
  if (currentMillis - lastCheck >= checkInterval) {
    lastCheck = currentMillis;
    checkMedicationSchedule();
  }
}


void handleWiFi() {
  static bool wifiConnected = false;
  if(!wifiConnected && WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    wifiConnected = true;
  }
}

void handleDispenseConfirmation() {
  static unsigned long lastDebounce = 0;
  static bool lastIRState = HIGH;
  bool currentIRState = digitalRead(DISPENSE_IR_PIN);

  // Only check if we're awaiting dispense
  if(!awaitingDispense) return;

  // Debounce logic
  if(currentIRState != lastIRState) {
    lastDebounce = millis();
  }

  if((millis() - lastDebounce) > 50) {
    if(currentIRState == LOW) {
      Serial.println("Dispense confirmed via IR");
      dispensePills(currentSchedule.quantity, currentSchedule.pill.charAt(0));
      currentSchedule.dispensed = true;
      awaitingDispense = false;
    }
  }
  
  lastIRState = currentIRState;
}


void handleIRSensor() {
  static unsigned long lastDebounce = 0;
  static bool lastIRState = HIGH;
  
  bool currentIRState = digitalRead(IR_PIN);
  
  // Detect stable LOW (active) for at least 50ms
  if(currentIRState != lastIRState) {
    lastDebounce = millis();
  }
  
  if((millis() - lastDebounce) > 50) {
    if(currentIRState == LOW && !measurementAllowed) {
      measurementAllowed = true;
      lastTrigger = millis();
      Serial.println("IR TRIGGERED - Measurement enabled");
    }
  }
  
  // Auto-disable after 30 seconds
  if(measurementAllowed && (millis() - lastTrigger > 30000)) {
    measurementAllowed = false;
    Serial.println("Measurement disabled");
  }
  
  lastIRState = currentIRState;
}

void handlePulse() {
  static int lastBPM = 0;
  
  int BPM = pulseSensor.getBeatsPerMinute();
  
  if(pulseSensor.sawStartOfBeat()) {
    if(measurementAllowed && BPM != lastBPM) {
      Serial.print("BPM: ");
      Serial.println(BPM);
      sendToAPI(BPM);
      lastBPM = BPM;
    }
  }
}

void sendToAPI(int bpm) {
  if(WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  
  String payload = "{\"bpm\":" + String(bpm) + "}";
  int code = http.POST(payload);
  
  if(code == HTTP_CODE_OK) {
    Serial.println("API update successful");
  }
  http.end();
}



void checkMedicationSchedule() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Skipping medication check.");
    return;
  }

  Serial.println("Checking medication schedule...");
  HTTPClient http;
  http.begin(serverURL);
  int httpCode = http.GET();

  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    processSchedule(payload);
  } else {
    Serial.printf("HTTP Error: %d\n", httpCode);
  }
  http.end();
}

void processSchedule(String payload) {
  DynamicJsonDocument doc(2048);
  DeserializationError error = deserializeJson(doc, payload);
  
  if (error) {
    Serial.print("deserializeJson() failed: ");
    Serial.println(error.c_str());
    return;
  }

  pillSchedules.clear(); // Clear previous schedules

  String currentTime = timeClient.getFormattedTime().substring(0, 5);
  
  // Reset dispensed flag at midnight
  if (currentTime == "00:00") {
    for (auto& schedule : pillSchedules) {
      schedule.dispensed = false;
    }
  }

  Serial.println("Fetched pill schedule:");
  for (JsonVariant entry : doc.as<JsonArray>()) {
    PillSchedule schedule;
    schedule.time = entry["time"].as<String>();
    schedule.pill = entry["pill"].as<String>();
    schedule.quantity = entry["quantity"].as<int>();
    schedule.dispensed = false; // Initialize as not dispensed
    pillSchedules.push_back(schedule);

    // Print pill details
    Serial.print("Time: ");
    Serial.print(schedule.time);
    Serial.print(", Pill: ");
    Serial.print(schedule.pill);
    Serial.print(", Quantity: ");
    Serial.println(schedule.quantity);
  }

  // Check and dispense pills
for (auto& schedule : pillSchedules) {
    if (checkTimeMatch(schedule.time) && !schedule.dispensed) {
      Serial.println("Time match found. Awaiting confirmation...");
      currentSchedule = schedule;  // Store current schedule
      triggerAlert();
      awaitingDispense = true;  // Set flag instead of dispensing immediately
      return;
    }
  }
}


bool checkTimeMatch(const String& targetTime) {
  String currentTime = timeClient.getFormattedTime().substring(0, 5);
  
  // Convert times to minutes since midnight
  int targetMinutes = (targetTime.substring(0, 2).toInt() * 60) + targetTime.substring(3, 5).toInt();
  int currentMinutes = (currentTime.substring(0, 2).toInt() * 60) + currentTime.substring(3, 5).toInt();
  
  // Allow a 2-minute window for dispensing
  return (currentMinutes >= targetMinutes && currentMinutes < targetMinutes + 1);
}

// Add these to your existing servo control section
void dispensePills(int qty, char pill) {
  Serial.println("Dispensing " + String(qty) + " pills of type " + pill);
  qty = constrain(qty, 1, 5);
  Servo &activeServo = (pill == 'A') ? dispenserServoA : dispenserServoB;
  int pin = (pill == 'A') ? SERVO_A_PIN : SERVO_B_PIN;

  // Common setup
  int initialPos = (pill == 'A') ? 30 : 45;
  activeServo.attach(pin);
  activeServo.write(initialPos);
  delay(1000);  // Initial stabilization

  for(int i=0; i<qty; i++) {
    if(pill == 'A') {
      // Pill A: Original unchanged pattern 30° → 62° → 11° → 30°
      for(int angle = 11; angle <= 62; angle++) {
        activeServo.write(angle);
        delay(20);
      }
      for(int angle = 62; angle >= 11; angle--) {
        activeServo.write(angle);
        delay(20);
      }
      activeServo.write(30);
    } else {
      // Pill B: New sequence 45° →5° →90° →45°
      // Move to pickup position
      for(int angle = 45; angle >= 5; angle--) {
        activeServo.write(constrain(angle, 5, 90));
        delay(10);
      }
      // Dispensing movement
      for(int angle = 5; angle <= 90; angle++) {
        activeServo.write(constrain(angle, 5, 90));
        delay(10);
      }
      // Return to rest position
      for(int angle = 90; angle >= 45; angle--) {
        activeServo.write(constrain(angle, 45, 90));
        delay(10);
      }
    }
    
    sendDispenseEvent(pill);
    Serial.println("Dispensed 1 " + String(pill) + " pill");
    delay(500);  // Inter-pill pause
  }

  activeServo.detach();
}




void triggerAlert() {
  for(int i=0; i<5; i++) {  // 4 beeps
    digitalWrite(BUZZER_PIN, HIGH);
    delay(200);
    digitalWrite(BUZZER_PIN, LOW);
    delay(200);
  }
}



void sendDispenseEvent(char pill) {
  HTTPClient http;
  http.begin("http://192.168.29.158:5001/api/dispense");
  http.addHeader("Content-Type", "application/json");
  
  String pillString = String(pill);
  pillString.toLowerCase();  // Ensure the pill is lowercase
  String payload = "{\"pill\":\"" + pillString + "\"}";
  int httpCode = http.POST(payload);
  
  if (httpCode == HTTP_CODE_OK) {
    Serial.println("Dispense recorded");
  } else {
    Serial.println("Failed to record dispense. HTTP Error: " + String(httpCode));
  }
  http.end();
}


void emergencyStop() {
  digitalWrite(BUZZER_PIN, LOW);
  dispenserServoA.detach();
  dispenserServoB.detach();
}
