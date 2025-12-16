// ============================================
// Runtime Configuration
// ============================================

// إعدادات Supabase
window.__SUPABASE_CONFIG__ = {
  url: "https://ljouypfbrbbivvroevjf.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxqb3V5cGZicmJiaXZ2cm9ldmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MzE5MTcsImV4cCI6MjA4MTQwNzkxN30.QhtnOqhQgfKGjJymI9-ycg77XgGcv9WmIdB2wu_KQ18"
};

// إعدادات Backend (للتشغيل المحلي أو استضافة خارجية)
// اتركها فارغة للتشغيل المحلي
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBase: "",   // مثال: "https://your-backend.render.com"
  wsBase: ""     // مثال: "wss://your-backend.render.com"
};

