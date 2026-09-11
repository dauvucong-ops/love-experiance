/**
 * =============================================================================
 * DATA.JS — Dữ liệu kỹ thuật của 7 cảnh trong Love Journey
 * =============================================================================
 * File này chỉ chứa các trường kỹ thuật:
 *   id, sceneName, pathCoordinate, mediaAfterUnlock
 *
 * NỘI DUNG văn bản (journalEntry, question, options, correctAnswer, hint,
 * epilogueMessage) được quản lý riêng trong content.js.
 *
 * Ở cuối file, SCENES_TECHNICAL và SCENES_CONTENT được merge thành
 * SCENES_DATA — biến duy nhất mà main.js cần đọc.
 *
 * LƯU Ý: content.js phải được load TRƯỚC file này (xem index.html).
 * =============================================================================
 */
const SCENES_TECHNICAL = [
  {
    id: 1,
    sceneName: "Kỷ niệm 1: Ngày đầu gặp gỡ",
    // Toạ độ (x, y) trên SVG viewBox 1000×600 — dùng để vẽ path và đặt nhân vật.
    pathCoordinate: { x: 80, y: 300 },
    // Ảnh/audio hiển thị SAU KHI người chơi trả lời đúng.
    // type: "image" | "audio" | null
    // src: đường dẫn tương đối từ thư mục gốc, bắt đầu bằng ./assets/
    mediaAfterUnlock: { type: "image", src: "./assets/scene_1.jpg" }
  },
  {
    id: 2,
    sceneName: "Kỷ niệm 2: Buổi hẹn hò đầu tiên",
    pathCoordinate: { x: 220, y: 180 },
    mediaAfterUnlock: { type: "image", src: "./assets/scene_2.jpg" }
  },
  {
    id: 3,
    sceneName: "Kỷ niệm 3: Lần đầu đi xem phim",
    pathCoordinate: { x: 380, y: 360 },
    mediaAfterUnlock: { type: "image", src: "./assets/scene_3.jpg" }
  },
  {
    id: 4,
    sceneName: "Kỷ niệm 4: Chuyến đi xa đầu tiên",
    pathCoordinate: { x: 540, y: 160 },
    mediaAfterUnlock: { type: "image", src: "./assets/scene_4.jpg" }
  },
  {
    id: 5,
    sceneName: "Kỷ niệm 5: Cùng nhau vượt qua thử thách",
    pathCoordinate: { x: 700, y: 340 },
    mediaAfterUnlock: { type: "image", src: "./assets/scene_5.jpg" }
  },
  {
    id: 6,
    sceneName: "Kỷ niệm 6: Lời hứa bên hoàng hôn",
    pathCoordinate: { x: 840, y: 220 },
    // type: "audio" — scene này dùng nhạc thay vì ảnh
    mediaAfterUnlock: { type: "audio", src: "./assets/scene_6.mp3" }
  },
  {
    id: 7,
    sceneName: "Hồi kết: Lời nhắn gửi từ trái tim",
    pathCoordinate: { x: 920, y: 300 },
    mediaAfterUnlock: { type: "image", src: "./assets/scene_7.jpg" }
  }
];

// =============================================================================
// MERGE: Kết hợp dữ liệu kỹ thuật (SCENES_TECHNICAL) với nội dung văn bản
// (SCENES_CONTENT từ content.js) để tạo ra SCENES_DATA — biến duy nhất
// mà main.js đọc. Cấu trúc cuối cùng giữ nguyên 100% so với trước khi tách.
// =============================================================================
const SCENES_DATA = SCENES_TECHNICAL.map(scene => {
  const content = SCENES_CONTENT[scene.id];
  if (!content) {
    console.warn(`[LoveJourney] Không tìm thấy content cho scene id=${scene.id} trong content.js`);
    return scene;
  }
  return {
    id:              scene.id,
    sceneName:       scene.sceneName,
    pathCoordinate:  scene.pathCoordinate,
    journalEntry:    content.journalEntry,
    question:        content.question,
    options:         content.options,
    correctAnswer:   content.correctAnswer,
    hint:            content.hint,
    mediaAfterUnlock: scene.mediaAfterUnlock,
    epilogueMessage: content.epilogueMessage
  };
});
