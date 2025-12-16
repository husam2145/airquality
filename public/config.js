// Runtime config for static hosting (Netlify, GitHub Pages, ...).
// اكتب هنا رابط الـ backend الذي يشغل webapp/server.js على استضافة خارجية.
//
// مثال (Render/Fly/Railway):
// window.__APP_CONFIG__ = {
//   apiBase: "https://your-backend.example.com",
//   wsBase: "wss://your-backend.example.com"
// };
//
// إذا تركتها فارغة، سيحاول الموقع استخدام نفس الـ origin (مناسب للتشغيل المحلي فقط).
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  apiBase: "",
  wsBase: ""
};


