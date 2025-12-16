/*
 * Air Quality Monitor - Client Side JavaScript
 * Real-time data display with WebSocket
 */

// ============================================
// Configuration
// ============================================

function normalizeBaseUrl(value) {
    if (!value) return '';
    try {
        return new URL(value).toString().replace(/\/$/, '');
    } catch {
        return '';
    }
}

function deriveWsBaseFromApiBase(apiBase) {
    try {
        const u = new URL(apiBase);
        const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${u.host}`;
    } catch {
        return '';
    }
}

// يمكن ضبط القيم بطريقتين:
// 1) webapp/public/config.js عبر window.__APP_CONFIG__
// 2) باراميتر URL: ?api=https://YOUR-BACKEND&ws=wss://YOUR-BACKEND
const params = new URLSearchParams(window.location.search);
const apiFromQuery = normalizeBaseUrl(params.get('api'));
const wsFromQuery = normalizeBaseUrl(params.get('ws'));

const apiFromConfig = normalizeBaseUrl(window.__APP_CONFIG__ && window.__APP_CONFIG__.apiBase);
const wsFromConfig = normalizeBaseUrl(window.__APP_CONFIG__ && window.__APP_CONFIG__.wsBase);

const apiBase = apiFromQuery || apiFromConfig || window.location.origin;
const wsBase = wsFromQuery || wsFromConfig || deriveWsBaseFromApiBase(apiBase);

const config = {
    apiBase,
    wsBase,
    chartMaxPoints: 100,
    updateInterval: 2000
};

// ============================================
// Global State
// ============================================

let ws = null;
let chart = null;
let chartData = {
    labels: [],
    temperature: [],
    humidity: []
};
let chartRange = 100;
let isConnected = false;
let pollingTimer = null;

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 تهيئة التطبيق...');
    
    initWebSocket();
    initChart();
    loadInitialData();
    startClock();
    
    console.log('✅ التطبيق جاهز');
});

// ============================================
// Polling Fallback (for Vercel / when WS not available)
// ============================================

function startPolling() {
    if (pollingTimer) return;
    console.log(`🕒 تفعيل التحديث التلقائي (Polling) كل ${config.updateInterval}ms`);
    pollingTimer = setInterval(() => {
        loadInitialData();
    }, config.updateInterval);
}

function stopPolling() {
    if (!pollingTimer) return;
    clearInterval(pollingTimer);
    pollingTimer = null;
}

// ============================================
// WebSocket Connection
// ============================================

function initWebSocket() {
    console.log('🔌 الاتصال بـ WebSocket...');
    
    // إذا wsBase غير متاح أو تم تعطيل WebSocket من config.js
    const disableWs = !!(window.__APP_CONFIG__ && window.__APP_CONFIG__.disableWebSocket);
    if (!config.wsBase || disableWs) {
        console.log('ℹ️ WebSocket غير مفعّل، سيتم استخدام Polling بدلاً منه');
        updateConnectionStatus(false);
        startPolling();
        return;
    }

    ws = new WebSocket(config.wsBase);
    
    ws.onopen = () => {
        console.log('✅ متصل بـ WebSocket');
        isConnected = true;
        updateConnectionStatus(true);
        stopPolling(); // لو كان polling شغال، أوقفه
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'initial') {
                console.log('📊 استقبال البيانات الأولية');
                updateDisplay(message.data, message.stats);
            } else if (message.type === 'update') {
                console.log('🔄 تحديث البيانات');
                updateDisplay(message.data, message.stats);
                addToChart(message.data);
            }
        } catch (error) {
            console.error('خطأ في معالجة رسالة WebSocket:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('❌ خطأ في WebSocket:', error);
        isConnected = false;
        updateConnectionStatus(false);
        // على Vercel غالباً WS يفشل → فعّل polling
        startPolling();
    };
    
    ws.onclose = () => {
        console.log('❌ انقطع الاتصال بـ WebSocket');
        isConnected = false;
        updateConnectionStatus(false);
        startPolling();
        
        // إعادة المحاولة بعد 5 ثواني
        setTimeout(() => {
            console.log('🔄 إعادة الاتصال...');
            initWebSocket();
        }, 5000);
    };
}

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('connectionStatus');
    const text = document.getElementById('connectionText');
    
    if (connected) {
        indicator.classList.add('connected');
        text.textContent = 'متصل';
    } else {
        indicator.classList.remove('connected');
        text.textContent = 'غير متصل';
    }
}

// ============================================
// Data Loading
// ============================================

async function loadInitialData() {
    try {
        // تحميل البيانات الحالية
        const currentResponse = await fetch(`${config.apiBase}/api/current`);
        const currentData = await currentResponse.json();
        
        if (currentData.success) {
            updateDisplay(currentData.data, currentData.stats);
        }
        
        // تحميل البيانات التاريخية للرسم البياني
        const historyResponse = await fetch(`${config.apiBase}/api/history?limit=50`);
        const historyData = await historyResponse.json();
        
        if (historyData.success) {
            initChartData(historyData.data);
        }
        
    } catch (error) {
        console.error('خطأ في تحميل البيانات:', error);
    }
}

async function refreshData() {
    console.log('🔄 تحديث البيانات...');
    await loadInitialData();
}

// ============================================
// Display Updates
// ============================================

function updateDisplay(data, stats) {
    // تحديث القيم الرئيسية
    document.getElementById('temperature').textContent = data.temperature.toFixed(1);
    document.getElementById('humidity').textContent = data.humidity.toFixed(1);
    
    // تحديث حالات القيم
    updateTempStatus(data.temperature);
    updateHumStatus(data.humidity);
    updateOverallStatus(data.temperature, data.humidity);
    
    // تحديث الإحصائيات
    if (stats) {
        document.getElementById('maxTemp').textContent = stats.maxTemp !== -999 ? stats.maxTemp.toFixed(1) + '°C' : '--';
        document.getElementById('minTemp').textContent = stats.minTemp !== 999 ? stats.minTemp.toFixed(1) + '°C' : '--';
        document.getElementById('avgTemp').textContent = stats.avgTemp ? stats.avgTemp.toFixed(1) + '°C' : '--';
        document.getElementById('maxHum').textContent = stats.maxHum ? stats.maxHum.toFixed(1) + '%' : '--';
        document.getElementById('minHum').textContent = stats.minHum !== 100 ? stats.minHum.toFixed(1) + '%' : '--';
        document.getElementById('avgHum').textContent = stats.avgHum ? stats.avgHum.toFixed(1) + '%' : '--';
        document.getElementById('totalReadings').textContent = stats.totalReadings || 0;
    }
    
    // تحديث وقت آخر قراءة
    const lastUpdate = new Date(data.timestamp);
    document.getElementById('lastUpdate').textContent = lastUpdate.toLocaleTimeString('ar-SA');
}

function updateTempStatus(temp) {
    const statusEl = document.getElementById('tempStatus');
    
    if (temp < 18) {
        statusEl.textContent = 'بارد ❄️';
        statusEl.className = 'status-badge warning';
    } else if (temp >= 18 && temp <= 26) {
        statusEl.textContent = 'مثالي ✅';
        statusEl.className = 'status-badge excellent';
    } else if (temp > 26 && temp <= 30) {
        statusEl.textContent = 'دافئ 🌡️';
        statusEl.className = 'status-badge good';
    } else {
        statusEl.textContent = 'حار 🔥';
        statusEl.className = 'status-badge danger';
    }
}

function updateHumStatus(hum) {
    const statusEl = document.getElementById('humStatus');
    
    if (hum < 30) {
        statusEl.textContent = 'جاف 🏜️';
        statusEl.className = 'status-badge warning';
    } else if (hum >= 30 && hum <= 60) {
        statusEl.textContent = 'مثالي ✅';
        statusEl.className = 'status-badge excellent';
    } else if (hum > 60 && hum <= 80) {
        statusEl.textContent = 'رطب 💧';
        statusEl.className = 'status-badge good';
    } else {
        statusEl.textContent = 'رطب جداً 💦';
        statusEl.className = 'status-badge danger';
    }
}

function updateOverallStatus(temp, hum) {
    const statusEl = document.getElementById('overallStatus');
    const iconEl = document.getElementById('statusIcon');
    const titleEl = document.getElementById('statusTitle');
    const messageEl = document.getElementById('statusMessage');
    
    if (temp >= 18 && temp <= 26 && hum >= 30 && hum <= 60) {
        statusEl.className = 'overall-status excellent';
        iconEl.textContent = '✅';
        titleEl.textContent = 'البيئة ممتازة!';
        messageEl.textContent = 'درجة الحرارة والرطوبة في المستوى المثالي';
    } else if (temp > 30 || hum > 80) {
        statusEl.className = 'overall-status poor';
        iconEl.textContent = '❌';
        titleEl.textContent = 'البيئة غير مناسبة';
        messageEl.textContent = 'ننصح بتشغيل التكييف أو تحسين التهوية';
    } else if (temp < 15 || hum < 25) {
        statusEl.className = 'overall-status warning';
        iconEl.textContent = '⚠️';
        titleEl.textContent = 'البيئة باردة/جافة';
        messageEl.textContent = 'ننصح بالتدفئة أو ترطيب الجو';
    } else {
        statusEl.className = 'overall-status good';
        iconEl.textContent = '👍';
        titleEl.textContent = 'البيئة مقبولة';
        messageEl.textContent = 'القراءات ضمن النطاق المقبول';
    }
}

// ============================================
// Chart Management
// ============================================

function initChart() {
    const ctx = document.getElementById('dataChart').getContext('2d');
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'درجة الحرارة (°C)',
                    data: [],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'الرطوبة (%)',
                    data: [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function initChartData(data) {
    chartData.labels = [];
    chartData.temperature = [];
    chartData.humidity = [];
    
    data.forEach(item => {
        const time = new Date(item.timestamp).toLocaleTimeString('ar-SA', {
            hour: '2-digit',
            minute: '2-digit'
        });
        chartData.labels.push(time);
        chartData.temperature.push(item.temperature);
        chartData.humidity.push(item.humidity);
    });
    
    updateChart();
}

function addToChart(data) {
    const time = new Date(data.timestamp).toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    chartData.labels.push(time);
    chartData.temperature.push(data.temperature);
    chartData.humidity.push(data.humidity);
    
    // الحفاظ على عدد النقاط
    if (chartData.labels.length > config.chartMaxPoints) {
        chartData.labels.shift();
        chartData.temperature.shift();
        chartData.humidity.shift();
    }
    
    updateChart();
}

function updateChart() {
    const start = Math.max(0, chartData.labels.length - chartRange);
    
    chart.data.labels = chartData.labels.slice(start);
    chart.data.datasets[0].data = chartData.temperature.slice(start);
    chart.data.datasets[1].data = chartData.humidity.slice(start);
    chart.update('none'); // تحديث بدون animation للأداء الأفضل
}

function changeChartRange(range) {
    chartRange = range;
    updateChart();
    
    // تحديث الزر النشط
    document.querySelectorAll('.chart-controls .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

// ============================================
// Export Functions
// ============================================

async function exportCSV() {
    try {
        const response = await fetch(`${config.apiBase}/api/export/csv`);
        const blob = await response.blob();
        downloadFile(blob, 'airquality_data.csv');
        showNotification('✅ تم تصدير البيانات بنجاح!');
    } catch (error) {
        console.error('خطأ في التصدير:', error);
        showNotification('❌ فشل تصدير البيانات', 'error');
    }
}

async function exportJSON() {
    try {
        const response = await fetch(`${config.apiBase}/api/export/json`);
        const blob = await response.blob();
        downloadFile(blob, 'airquality_data.json');
        showNotification('✅ تم تصدير البيانات بنجاح!');
    } catch (error) {
        console.error('خطأ في التصدير:', error);
        showNotification('❌ فشل تصدير البيانات', 'error');
    }
}

function downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// ============================================
// Clear Data
// ============================================

async function clearData() {
    if (!confirm('هل أنت متأكد من مسح جميع البيانات؟')) {
        return;
    }
    
    try {
        const response = await fetch(`${config.apiBase}/api/clear`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            // مسح الرسم البياني
            chartData.labels = [];
            chartData.temperature = [];
            chartData.humidity = [];
            updateChart();
            
            showNotification('✅ تم مسح البيانات بنجاح!');
            
            // إعادة تحميل البيانات
            setTimeout(refreshData, 1000);
        }
    } catch (error) {
        console.error('خطأ في مسح البيانات:', error);
        showNotification('❌ فشل مسح البيانات', 'error');
    }
}

// ============================================
// Helper Functions
// ============================================

function startClock() {
    setInterval(() => {
        const now = new Date();
        const el = document.getElementById('serverTime');
        if (!el) return;
        el.textContent =
            now.toLocaleString('ar-SA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
    }, 1000);
}

function showNotification(message, type = 'success') {
    // يمكن استبدالها بمكتبة notifications أفضل
    alert(message);
}

// ============================================
// Window Events
// ============================================

window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
});

// منع النوم على الهاتف (اختياري)
if ('wakeLock' in navigator) {
    let wakeLock = null;
    
    async function requestWakeLock() {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('🔒 Wake Lock active');
        } catch (err) {
            console.log('Wake Lock error:', err);
        }
    }
    
    requestWakeLock();
}

