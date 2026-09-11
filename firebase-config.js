/**
 * firebase-config.js
 * Classic script (không phải module) — expose config ra window
 * để firebase-bridge.js (module) đọc được qua window.FIREBASE_CONFIG.
 *
 * KHÔNG đặt logic Firebase ở đây — chỉ chứa config thuần.
 */
window.FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAPfPdLP0G_96Mot8j5r8re4Anngqp7kac",
  authDomain:        "love-experiance.firebaseapp.com",
  projectId:         "love-experiance",
  storageBucket:     "love-experiance.firebasestorage.app",
  messagingSenderId: "205040850791",
  appId:             "1:205040850791:web:7872b7079ac5cdb15f01c2"
};
