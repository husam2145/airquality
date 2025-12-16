/*
 * Node.js Server لاستقبال وعرض بيانات DHT11
 * Air Quality Monitoring Web Application
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

// إنشاء التطبيق
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// تخزين البيانات (في الذاكرة)
let currentData = {
  temperature: 0,
  humidity: 0,
  heatIndex: 0,
  timestamp: Date.now(),
  status: 'waiting'
};

// تخزين البيانات التاريخية (آخر 100 قراءة)
let historyData = [];
const MAX_HISTORY = 100;

// إحصائيات
let stats = {
  maxTemp: -999,
  minTemp: 999,
  maxHum: 0,
  minHum: 100,
  avgTemp: 0,
  avgHum: 0,
  totalReadings: 0
};

// ============ Routes ============

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: الحصول على البيانات الحالية
app.get('/api/current', (req, res) => {
  res.json({
    success: true,
    data: currentData,
    stats: stats
  });
});

// API: الحصول على البيانات التاريخية
app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const data = historyData.slice(-limit);
  
  res.json({
    success: true,
    data: data,
    count: data.length
  });
});

// API: الحصول على الإحصائيات
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: stats
  });
});

// API: استقبال البيانات من ESP32
app.post('/api/data', (req, res) => {
  try {
    const { temperature, humidity, heatIndex } = req.body;
    
    // التحقق من صحة البيانات
    if (temperature === undefined || humidity === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // تحديث البيانات الحالية
    currentData = {
      temperature: parseFloat(temperature),
      humidity: parseFloat(humidity),
      heatIndex: parseFloat(heatIndex) || parseFloat(temperature),
      timestamp: Date.now(),
      status: 'active'
    };
    
    // إضافة إلى السجل التاريخي
    historyData.push({
      ...currentData,
      id: historyData.length + 1
    });
    
    // الحفاظ على حجم السجل
    if (historyData.length > MAX_HISTORY) {
      historyData.shift();
    }
    
    // تحديث الإحصائيات
    updateStats(currentData);
    
    // إرسال البيانات إلى جميع العملاء المتصلين عبر WebSocket
    broadcastData(currentData);
    
    console.log(`📊 قراءة جديدة: ${temperature}°C, ${humidity}%`);
    
    res.json({
      success: true,
      message: 'Data received successfully',
      data: currentData
    });
    
  } catch (error) {
    console.error('خطأ في معالجة البيانات:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// API: مسح البيانات
app.post('/api/clear', (req, res) => {
  historyData = [];
  stats = {
    maxTemp: -999,
    minTemp: 999,
    maxHum: 0,
    minHum: 100,
    avgTemp: 0,
    avgHum: 0,
    totalReadings: 0
  };
  
  res.json({
    success: true,
    message: 'Data cleared'
  });
});

// API: تصدير البيانات كـ CSV
app.get('/api/export/csv', (req, res) => {
  let csv = 'Timestamp,Temperature (°C),Humidity (%),Heat Index (°C)\n';
  
  historyData.forEach(item => {
    const date = new Date(item.timestamp).toISOString();
    csv += `${date},${item.temperature},${item.humidity},${item.heatIndex}\n`;
  });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=airquality_data.csv');
  res.send(csv);
});

// API: تصدير البيانات كـ JSON
app.get('/api/export/json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=airquality_data.json');
  res.json({
    exportDate: new Date().toISOString(),
    stats: stats,
    data: historyData
  });
});

// ============ WebSocket Server ============

// دالة للحصول على IP Address
function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      // تجاهل IPv6 و loopback
      if (alias.family === 'IPv4' && !alias.internal) {
        addresses.push({
          name: interfaceName,
          address: alias.address
        });
      }
    }
  }
  
  return addresses;
}

const server = app.listen(PORT, () => {
  // الحصول على عناوين IP
  const ipAddresses = getLocalIPAddress();
  
  console.log('╔════════════════════════════════════════════╗');
  console.log('║   🌡️  Air Quality Monitoring Server      ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log('');
  console.log('🌐 Network Information:');
  console.log(`   Local:    http://localhost:${PORT}`);
  console.log(`   Local:    http://127.0.0.1:${PORT}`);
  
  if (ipAddresses.length > 0) {
    console.log('');
    console.log('📡 Access from other devices:');
    ipAddresses.forEach((ip, index) => {
      console.log(`   ${index + 1}. http://${ip.address}:${PORT}  (${ip.name})`);
    });
    console.log('');
    console.log('💡 Use this IP in ESP32 code:');
    console.log(`   const char* serverUrl = "http://${ipAddresses[0].address}:${PORT}/api/data";`);
  } else {
    console.log('   ⚠️  No network interface found');
  }
  
  console.log('');
  console.log('📡 API endpoint:');
  console.log(`   POST http://localhost:${PORT}/api/data`);
  if (ipAddresses.length > 0) {
    console.log(`   POST http://${ipAddresses[0].address}:${PORT}/api/data`);
  }
  console.log('');
  console.log('📊 Available endpoints:');
  console.log('   GET  /                    - Web Interface');
  console.log('   GET  /api/current         - Current readings');
  console.log('   GET  /api/history         - Historical data');
  console.log('   GET  /api/stats           - Statistics');
  console.log('   POST /api/data            - Post new reading');
  console.log('   GET  /api/export/csv      - Export as CSV');
  console.log('   GET  /api/export/json     - Export as JSON');
  console.log('');
  console.log('⏳ Waiting for ESP32 data...');
  console.log('════════════════════════════════════════════');
});

const wss = new WebSocket.Server({ server });

// WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('✅ عميل جديد متصل');
  clients.add(ws);
  
  // إرسال البيانات الحالية للعميل الجديد
  ws.send(JSON.stringify({
    type: 'initial',
    data: currentData,
    stats: stats
  }));
  
  ws.on('close', () => {
    console.log('❌ عميل مفصول');
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// دالة لبث البيانات إلى جميع العملاء
function broadcastData(data) {
  const message = JSON.stringify({
    type: 'update',
    data: data,
    stats: stats
  });
  
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ============ Helper Functions ============

function updateStats(data) {
  const { temperature, humidity } = data;
  
  // تحديث القيم القصوى والدنيا
  if (temperature > stats.maxTemp) stats.maxTemp = temperature;
  if (temperature < stats.minTemp) stats.minTemp = temperature;
  if (humidity > stats.maxHum) stats.maxHum = humidity;
  if (humidity < stats.minHum) stats.minHum = humidity;
  
  // حساب المتوسطات
  stats.totalReadings++;
  stats.avgTemp = historyData.reduce((sum, item) => sum + item.temperature, 0) / historyData.length;
  stats.avgHum = historyData.reduce((sum, item) => sum + item.humidity, 0) / historyData.length;
}

// التحقق من اتصال ESP32 (إذا لم يصل بيانات خلال دقيقة)
setInterval(() => {
  const timeSinceLastUpdate = Date.now() - currentData.timestamp;
  if (timeSinceLastUpdate > 60000 && currentData.status !== 'disconnected') {
    currentData.status = 'disconnected';
    console.log('⚠️  لا توجد بيانات من ESP32');
    broadcastData(currentData);
  }
}, 30000); // فحص كل 30 ثانية

// معالجة إيقاف التطبيق
process.on('SIGINT', () => {
  console.log('\n\n👋 إيقاف السيرفر...');
  server.close(() => {
    console.log('✅ تم إيقاف السيرفر بنجاح');
    process.exit(0);
  });
});

