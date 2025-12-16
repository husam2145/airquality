/*
 * Supabase Client Configuration
 * ربط التطبيق مع قاعدة بيانات Supabase
 */

// ============================================
// إعدادات Supabase
// ============================================

// إعدادات Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ljouypfbrbbivvroevjf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxqb3V5cGZicmJiaXZ2cm9ldmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzE5MTcsImV4cCI6MjA4MTQwNzkxN30.QhtnOqhQgfKGjJymI9-ycg77XgGcv9WmIdB2wu_KQ18';

// ============================================
// Supabase Client (for Node.js)
// ============================================

let supabase = null;

try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ تم الاتصال بـ Supabase');
} catch (error) {
    console.log('⚠️ Supabase client not available - using memory storage');
    supabase = null;
}

// ============================================
// Database Functions
// ============================================

// إضافة قراءة جديدة
async function addReading(deviceApiKey, temperature, humidity, heatIndex) {
    if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
    }
    
    try {
        const { data, error } = await supabase.rpc('add_reading', {
            p_api_key: deviceApiKey,
            p_temperature: temperature,
            p_humidity: humidity,
            p_heat_index: heatIndex
        });
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error adding reading:', error);
        return { success: false, error: error.message };
    }
}

// جلب آخر القراءات
async function getLatestReadings(limit = 50) {
    if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
    }
    
    try {
        const { data, error } = await supabase
            .from('readings')
            .select(`
                id,
                temperature,
                humidity,
                heat_index,
                recorded_at,
                devices (name, location)
            `)
            .order('recorded_at', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching readings:', error);
        return { success: false, error: error.message };
    }
}

// جلب آخر قراءة لكل جهاز
async function getLatestReadingPerDevice() {
    if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
    }
    
    try {
        const { data, error } = await supabase
            .from('latest_readings')
            .select('*');
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching latest readings:', error);
        return { success: false, error: error.message };
    }
}

// جلب إحصائيات جهاز
async function getDeviceStats(deviceId) {
    if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
    }
    
    try {
        const { data, error } = await supabase.rpc('get_device_stats', {
            p_device_id: deviceId
        });
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching stats:', error);
        return { success: false, error: error.message };
    }
}

// جلب التنبيهات غير المقروءة
async function getUnreadAlerts() {
    if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
    }
    
    try {
        const { data, error } = await supabase
            .from('unread_alerts')
            .select('*');
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching alerts:', error);
        return { success: false, error: error.message };
    }
}

// جلب الأجهزة
async function getDevices() {
    if (!supabase) {
        return { success: false, error: 'Supabase not configured' };
    }
    
    try {
        const { data, error } = await supabase
            .from('devices')
            .select('id, name, location, device_type, sensor_type, is_active, last_seen_at')
            .eq('is_active', true);
        
        if (error) throw error;
        return { success: true, data };
    } catch (error) {
        console.error('Error fetching devices:', error);
        return { success: false, error: error.message };
    }
}

// الاشتراك في التحديثات الحية
function subscribeToReadings(callback) {
    if (!supabase) {
        console.log('⚠️ Realtime not available without Supabase');
        return null;
    }
    
    const channel = supabase
        .channel('readings-channel')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'readings'
        }, (payload) => {
            console.log('📊 قراءة جديدة من Supabase:', payload.new);
            callback(payload.new);
        })
        .subscribe();
    
    return channel;
}

// ============================================
// Exports
// ============================================

module.exports = {
    supabase,
    SUPABASE_URL,
    addReading,
    getLatestReadings,
    getLatestReadingPerDevice,
    getDeviceStats,
    getUnreadAlerts,
    getDevices,
    subscribeToReadings
};

