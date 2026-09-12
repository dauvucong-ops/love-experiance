/**
 * firebase-bridge.js  —  type="module" (luôn deferred, chạy trước DOMContentLoaded)
 * ─────────────────────────────────────────────────────────────────────────────
 * Vai trò: cầu nối giữa Firebase ES Module SDK và phần code cũ (classic scripts).
 *
 * Luồng hoạt động:
 *   1. Import Firebase từ CDN (ES module syntax — hợp lệ vì file này là module)
 *   2. Đọc window.FIREBASE_CONFIG (được set bởi firebase-config.js classic script)
 *   3. Lắng nghe collection "memories" qua onSnapshot (real-time)
 *   4. Lần đầu có data  → dispatch event  lj:scenesReady  { detail: { scenes } }
 *   5. Mỗi lần cập nhật → dispatch event  lj:scenesUpdated { detail: { scenes } }
 *   6. Expose window.__LJ_DB để migrate.html và UI ghi sau này dùng
 *
 * main.js (classic script) lắng nghe hai event trên và không cần biết Firebase.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getFirestore, collection, query, orderBy, onSnapshot, doc, setDoc, addDoc }
  from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

// ── Khởi tạo Firebase ───────────────────────────────────────────────────────
const app = initializeApp(window.FIREBASE_CONFIG);
const db  = getFirestore(app);

// Expose để admin UI dùng để ghi dữ liệu
window.__LJ_DB = db;

// Expose helper ghi/cập nhật scene lên Firestore (merge: true)
window.__LJ_UPDATE_SCENE = async function(firestoreId, sceneData) {
  const docRef = doc(db, 'memories', firestoreId);
  return await setDoc(docRef, sceneData, { merge: true });
};

// Expose helper tạo scene mới lên Firestore (addDoc tự sinh document ID)
window.__LJ_ADD_SCENE = async function(sceneData) {
  const colRef = collection(db, 'memories');
  return await addDoc(colRef, sceneData);
};

// ── Helper: đoán loại media từ đuôi file / URL ──────────────────────────────
function detectMediaType(url) {
  if (!url) return null;
  return /\.(mp3|ogg|wav|m4a|aac)$/i.test(url) ? 'audio' : 'image';
}

// ── Mapper: Firestore document → object cùng hình dạng với SCENES_DATA cũ ───
function docToScene(doc) {
  const d = doc.data();
  const mediaType = detectMediaType(d.mediaUrl);

  return {
    firestoreId:     doc.id,                          // dùng cho ghi/sửa sau này
    id:              d.order,
    isEpilogue:      Boolean(d.isEpilogue),
    sceneName:       d.sceneName || (d.isEpilogue
                       ? 'Hồi kết'
                       : `Kỷ niệm ${d.order}`),
    pathCoordinate:  null,                            // sẽ được tính bởi generateCoordinates()
    journalEntry:    d.journalEntry    ?? null,
    question:        d.isEpilogue ? null : (d.question     ?? null),
    options:         d.isEpilogue ? null : (d.options      ?? null),
    correctAnswer:   d.isEpilogue ? null : (d.correctAnswer ?? null),
    hint:            d.isEpilogue ? null : (d.hint          ?? null),
    mediaUrl:        d.mediaUrl || null,
    mediaAfterUnlock: { type: mediaType, src: d.mediaUrl || null },
    epilogueMessage: d.isEpilogue ? (d.epilogueMessage ?? '') : null
    // Trường `pin` trong Firestore bị bỏ qua ở đây
  };
}

// ── onSnapshot listener ───────────────────────────────────────────────────────
let isFirstSnapshot = true;

const memoriesQuery = query(
  collection(db, 'memories'),
  orderBy('order')           // sắp xếp theo field order (number)
);

onSnapshot(
  memoriesQuery,

  // Success callback
  (snapshot) => {
    if (snapshot.empty) {
      console.warn(
        '[LoveJourney] Firestore: collection "memories" đang trống.\n' +
        'Mở file migrate.html trong trình duyệt để nạp dữ liệu lần đầu.'
      );
      // Dispatch event báo lỗi để main.js kích hoạt fallback
      window.dispatchEvent(new CustomEvent('lj:firestoreEmpty'));
      return;
    }

    const scenes = snapshot.docs.map(docToScene);

    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      window.dispatchEvent(
        new CustomEvent('lj:scenesReady', { detail: { scenes } })
      );
    } else {
      window.dispatchEvent(
        new CustomEvent('lj:scenesUpdated', { detail: { scenes } })
      );
    }
  },

  // Error callback
  (error) => {
    console.error('[LoveJourney] Firestore lỗi:', error.code, error.message);
    window.dispatchEvent(
      new CustomEvent('lj:firestoreError', { detail: { error } })
    );
  }
);
