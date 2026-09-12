/**
 * firebase-config.js
 * Classic script (không phải module) — expose config ra window
 * để firebase-bridge.js (module) và main.js đọc được.
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

// Cấu hình ứng dụng chung (mã PIN xác thực quyền chỉnh sửa)
window.APP_CONFIG = {
  adminPin: "20052008"
};
