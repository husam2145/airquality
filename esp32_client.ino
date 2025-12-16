/*
 * ESP32 Client - إرسال البيانات إلى Node.js Server
 * DHT11 + ESP32 + WiFi
 * 
 * هذا الكود يقرأ البيانات من DHT11 ويرسلها إلى Node.js server
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ============ إعدادات WiFi ============
const char* ssid = "YOUR_WIFI_NAME";           // اسم شبكة الواي فاي
const char* password = "YOUR_WIFI_PASSWORD";   // كلمة مرور الواي فاي

// ============ إعدادات Server ============
const char* serverUrl = "http://192.168.1.100:3000/api/data";  // عنوان Node.js server
// غيّر 192.168.1.100 إلى IP الخاص بجهاز الكمبيوتر الذي يشغل Node.js

// ============ إعدادات DHT11 ============
#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);

// ============ متغيرات عامة ============
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 2000;  // إرسال كل 2 ثانية
int readingCount = 0;
bool serverAvailable = true;

// ============ الإعداد ============
void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n╔════════════════════════════════════════════╗");
  Serial.println("║   ESP32 Client - Air Quality Monitor      ║");
  Serial.println("╚════════════════════════════════════════════╝\n");
  
  // تهيئة المستشعر
  dht.begin();
  Serial.println("✓ تم تهيئة مستشعر DHT11");
  
  // الاتصال بشبكة WiFi
  connectToWiFi();
  
  Serial.println("\n════════════════════════════════════════════");
  Serial.println("🚀 جاهز لإرسال البيانات!");
  Serial.println("════════════════════════════════════════════\n");
}

// ============ الحلقة الرئيسية ============
void loop() {
  // التحقق من اتصال WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi منقطع! إعادة الاتصال...");
    connectToWiFi();
    return;
  }
  
  // إرسال البيانات كل فترة محددة
  if (millis() - lastSendTime >= sendInterval) {
    readAndSendData();
    lastSendTime = millis();
  }
  
  delay(100);
}

// ============ الاتصال بـ WiFi ============
void connectToWiFi() {
  Serial.print("🔌 الاتصال بشبكة WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ تم الاتصال بنجاح!");
    Serial.print("📡 عنوان IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("📶 قوة الإشارة: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("\n❌ فشل الاتصال بالشبكة!");
    Serial.println("تحقق من:");
    Serial.println("  - اسم الشبكة وكلمة المرور");
    Serial.println("  - أن الشبكة 2.4GHz");
    Serial.println("  - قرب الراوتر");
    delay(5000);
  }
}

// ============ قراءة وإرسال البيانات ============
void readAndSendData() {
  // قراءة البيانات من المستشعر
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  
  // التحقق من صحة القراءة
  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("❌ خطأ في قراءة المستشعر!");
    return;
  }
  
  // حساب مؤشر الحرارة
  float heatIndex = dht.computeHeatIndex(temperature, humidity, false);
  
  // طباعة البيانات
  readingCount++;
  Serial.printf("📊 قراءة #%d: %.1f°C, %.1f%%, %.1f°C HI\n", 
                readingCount, temperature, humidity, heatIndex);
  
  // إرسال البيانات إلى Server
  if (sendDataToServer(temperature, humidity, heatIndex)) {
    Serial.println("✅ تم إرسال البيانات بنجاح");
    serverAvailable = true;
  } else {
    Serial.println("❌ فشل إرسال البيانات");
    serverAvailable = false;
  }
  
  Serial.println("────────────────────────────────────────────");
}

// ============ إرسال البيانات إلى Server ============
bool sendDataToServer(float temp, float hum, float heatIdx) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }
  
  HTTPClient http;
  
  // بدء الاتصال
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  
  // إنشاء JSON
  StaticJsonDocument<200> doc;
  doc["temperature"] = round(temp * 10) / 10.0;
  doc["humidity"] = round(hum * 10) / 10.0;
  doc["heatIndex"] = round(heatIdx * 10) / 10.0;
  doc["device"] = "ESP32";
  doc["sensor"] = "DHT11";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // إرسال POST request
  int httpResponseCode = http.POST(jsonString);
  
  // معالجة الاستجابة
  bool success = false;
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    
    if (httpResponseCode == 200) {
      success = true;
      
      // طباعة استجابة Server (اختياري)
      // Serial.println("Server response:");
      // Serial.println(response);
    } else {
      Serial.printf("⚠️  HTTP Code: %d\n", httpResponseCode);
    }
  } else {
    Serial.printf("❌ خطأ في الإرسال: %s\n", http.errorToString(httpResponseCode).c_str());
  }
  
  http.end();
  return success;
}

// ============ دوال مساعدة ============

// الحصول على حالة الاتصال
String getConnectionStatus() {
  if (WiFi.status() != WL_CONNECTED) {
    return "WiFi Disconnected";
  } else if (!serverAvailable) {
    return "Server Unavailable";
  } else {
    return "Connected";
  }
}

// الحصول على معلومات النظام
void printSystemInfo() {
  Serial.println("\n╔════════════════════════════════════════════╗");
  Serial.println("║           System Information               ║");
  Serial.println("╚════════════════════════════════════════════╝");
  
  Serial.print("Chip Model: ");
  Serial.println(ESP.getChipModel());
  
  Serial.print("Chip Revision: ");
  Serial.println(ESP.getChipRevision());
  
  Serial.print("CPU Frequency: ");
  Serial.print(ESP.getCpuFreqMHz());
  Serial.println(" MHz");
  
  Serial.print("Free Heap: ");
  Serial.print(ESP.getFreeHeap() / 1024);
  Serial.println(" KB");
  
  Serial.print("Flash Size: ");
  Serial.print(ESP.getFlashChipSize() / 1024 / 1024);
  Serial.println(" MB");
  
  Serial.println("════════════════════════════════════════════\n");
}

// استدعاء معلومات النظام عند بدء التشغيل (اختياري)
// أضف printSystemInfo(); في نهاية setup() لعرضها

