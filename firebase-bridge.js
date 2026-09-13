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
import { getFirestore, collection, query, orderBy, onSnapshot, doc, setDoc, addDoc, deleteDoc, writeBatch }
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

// Expose helper thêm ảnh mới vào collection "gallery"
window.__LJ_ADD_GALLERY_ITEM = async function(itemData) {
  const colRef = collection(db, 'gallery');
  return await addDoc(colRef, itemData);
};

// Expose helper xoá ảnh khỏi collection "gallery"
window.__LJ_DELETE_GALLERY_ITEM = async function(firestoreId) {
  const docRef = doc(db, 'gallery', firestoreId);
  return await deleteDoc(docRef);
};

// Expose helper xoá kỷ niệm khỏi collection "memories"
window.__LJ_DELETE_MEMORY = async function(firestoreId, pin) {
  const docRef = doc(db, 'memories', firestoreId);
  return await deleteDoc(docRef);
};

// Expose helper sắp xếp lại thứ tự kỷ niệm bằng writeBatch (Hồi kết bị loại hoàn toàn)
window.__LJ_REORDER_MEMORIES = async function(orderedScenes, pin) {
  if (!Array.isArray(orderedScenes) || orderedScenes.length === 0) return;
  const batch = writeBatch(db);
  orderedScenes.forEach((scene, index) => {
    // Loại hoàn toàn Hồi kết khỏi batch, không bao giờ ghi đè order của Hồi kết
    if (scene.isEpilogue || scene.question === null) return;
    const firestoreId = scene.firestoreId || (`scene_${String(scene.id).padStart(2, '0')}`);
    const docRef = doc(db, 'memories', firestoreId);
    batch.set(docRef, {
      order: index + 1,
      pin: pin ? String(pin).trim() : ''
    }, { merge: true });
  });
  return await batch.commit();
};

// Expose helper cập nhật hồ sơ trong collection "profiles" (Phase 3)
window.__LJ_UPDATE_PROFILE = async function(personId, profileData) {
  const docRef = doc(db, 'profiles', personId);
  return await setDoc(docRef, profileData, { merge: true });
};

// Expose helper gửi góp ý mới vào collection "feedbacks" (không cần mã PIN)
window.__LJ_SEND_FEEDBACK = async function(feedbackData) {
  const colRef = collection(db, 'feedbacks');
  return await addDoc(colRef, feedbackData);
};

// Expose helper xoá góp ý khỏi collection "feedbacks" sau khi người nhận xem xong (không cần mã PIN)
window.__LJ_DELETE_FEEDBACK = async function(feedbackId) {
  const docRef = doc(db, 'feedbacks', feedbackId);
  return await deleteDoc(docRef);
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
  const isEpilogue = Boolean(d.isEpilogue);

  // Xử lý mảng questions:
  // 1. Epilogue (isEpilogue = true): questions = [] (mảng rỗng)
  // 2. Document có field "questions" (mảng >= 1): dùng trực tiếp mảng đó
  // 3. Document dữ liệu cũ (chưa có questions): tự động dựng mảng 1 phần tử
  let questions = [];
  if (!isEpilogue) {
    if (Array.isArray(d.questions) && d.questions.length >= 1) {
      questions = d.questions;
    } else {
      questions = [{
        question:      d.question      ?? null,
        options:       d.options       ?? null,
        correctAnswer: d.correctAnswer ?? null,
        hint:          d.hint          ?? null
      }];
    }
  }

  // Giữ nguyên tương thích ngược: các field rời cũ (question, options, correctAnswer, hint)
  // lấy từ phần tử đầu tiên questions[0] (nếu có) để main.js hiện tại chạy bình thường
  const firstQ = questions[0] || null;
  const question      = isEpilogue ? null : (firstQ?.question      ?? d.question      ?? null);
  const options       = isEpilogue ? null : (firstQ?.options       ?? d.options       ?? null);
  const correctAnswer = isEpilogue ? null : (firstQ?.correctAnswer ?? d.correctAnswer ?? null);
  const hint          = isEpilogue ? null : (firstQ?.hint          ?? d.hint          ?? null);

  return {
    firestoreId:     doc.id,                          // dùng cho ghi/sửa sau này
    id:              d.order,
    isEpilogue:      isEpilogue,
    sceneName:       d.sceneName || (isEpilogue
                       ? 'Hồi kết'
                       : `Kỷ niệm ${d.order}`),
    pathCoordinate:  null,                            // sẽ được tính bởi generateCoordinates()
    journalEntry:    d.journalEntry    ?? null,
    questions:       questions,                       // mảng câu hỏi (hỗ trợ nhiều câu hỏi)
    question:        question,                        // tương thích ngược cho main.js
    options:         options,                         // tương thích ngược cho main.js
    correctAnswer:   correctAnswer,                   // tương thích ngược cho main.js
    hint:            hint,                            // tương thích ngược cho main.js
    mediaUrl:        d.mediaUrl || null,
    mediaAfterUnlock: { type: mediaType, src: d.mediaUrl || null },
    epilogueMessage: isEpilogue ? (d.epilogueMessage ?? '') : null
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

// ── onSnapshot listener cho collection "gallery" (Phase 2) ───────────────────
const galleryQuery = query(
  collection(db, 'gallery'),
  orderBy('createdAt', 'desc')
);

onSnapshot(
  galleryQuery,
  (snapshot) => {
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    window.dispatchEvent(
      new CustomEvent('lj:galleryUpdated', { detail: { items } })
    );
  },
  (error) => {
    console.warn('[LoveJourney] Firestore gallery error:', error.code, error.message);
  }
);

// ── onSnapshot listener cho collection "profiles" (Phase 3) ──────────────────
const profilesQuery = collection(db, 'profiles');

onSnapshot(
  profilesQuery,
  (snapshot) => {
    const profiles = {};
    snapshot.docs.forEach(doc => {
      profiles[doc.id] = { id: doc.id, ...doc.data() };
    });
    window.dispatchEvent(
      new CustomEvent('lj:profilesUpdated', { detail: { profiles } })
    );
  },
  (error) => {
    console.warn('[LoveJourney] Firestore profiles error:', error.code, error.message);
  }
);

// ── onSnapshot listener cho collection "feedbacks" (Hộp thư góp ý) ───────────
const feedbacksQuery = query(collection(db, 'feedbacks'), orderBy('createdAt', 'desc'));

onSnapshot(
  feedbacksQuery,
  (snapshot) => {
    const feedbacks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    window.dispatchEvent(
      new CustomEvent('lj:feedbacksUpdated', { detail: { feedbacks } })
    );
  },
  (error) => {
    console.warn('[LoveJourney] Firestore feedbacks error:', error.code, error.message);
  }
);


