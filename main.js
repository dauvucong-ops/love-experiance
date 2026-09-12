/**
 * Class GameController — điều khiển toàn bộ luồng game
 */

// ══════════════════════════════════════════════════════════════
// generateCoordinates(count) — tự sinh toạ độ SVG cho N scenes
//
// Tạo ra N điểm phân bố theo sóng sin 1.5 chu kỳ trong viewBox
// 1000×600, co giãn tự động dù có 3 hay 20 kỷ niệm.
// Thay thế hoàn toàn pathCoordinate hardcode trong data.js.
// ══════════════════════════════════════════════════════════════
function generateCoordinates(count) {
  const W = 1000, H = 600;
  const padX = 80, padY = 90;
  const midY = H / 2;                         // 300
  const amplitude = (H / 2 - padY) * 0.65;   // ≈ 137 — biên độ dao động

  if (count === 1) return [{ x: W / 2, y: midY }];
  if (count === 2) return [
    { x: padX,     y: midY + amplitude },
    { x: W - padX, y: midY - amplitude }
  ];

  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);                // 0 → 1
    const x = Math.round(padX + t * (W - 2 * padX));
    // 1.5 chu kỳ sin: mid → cao → mid → thấp → mid → cao → mid  (cho 7 điểm)
    const y = Math.round(midY - amplitude * Math.sin(t * Math.PI * 3));
    return {
      x,
      y: Math.max(padY, Math.min(H - padY, y))  // giữ trong vùng đệm
    };
  });
}

class GameController {
  /**
   * @param {Array<Object>} scenesData - Mảng 7 cảnh từ data.js
   */
  constructor(scenesData) {
    this.scenesData = scenesData;
    this.currentSceneIndex = 0;
    this.isEditMode = false;

    // ─── Tham chiếu DOM cố định ───────────────────────────────
    this.journeyPath    = document.getElementById('journey-path');
    this.character      = document.getElementById('character');
    this.sceneIndicator = document.getElementById('scene-indicator');
    this.sceneTitle     = document.getElementById('scene-title');
    this.journalContainer = document.getElementById('journal-container');
    this.journalText    = document.getElementById('journal-text');
    this.continueBtn    = document.getElementById('continue-btn');
    this.questionBox    = document.getElementById('question-box');
    this.questionText   = document.getElementById('question-text');
    this.optionsList    = document.getElementById('options-list');
    this.hintBox        = document.getElementById('hint-box');
    this.hintText       = document.getElementById('hint-text');
    this.feedbackMsg    = document.getElementById('feedback-message');
    this.mediaContainer = document.getElementById('media-container');
    this.quizContainer  = document.getElementById('quiz-container');
    this.epilogueContainer = document.getElementById('epilogue-container');
    this.epilogueTitle  = document.getElementById('epilogue-title');
    this.epilogueMessage = document.getElementById('epilogue-message');

    // Tham chiếu DOM chế độ chỉnh sửa & PIN modal
    this.editModeBtn    = document.getElementById('edit-mode-btn');
    this.editBadge      = document.getElementById('edit-badge');
    this.pinModal       = document.getElementById('pin-modal');
    this.pinInput       = document.getElementById('pin-input');
    this.pinConfirmBtn  = document.getElementById('pin-confirm-btn');
    this.pinCancelBtn   = document.getElementById('pin-cancel-btn');
    this.pinErrorMsg    = document.getElementById('pin-error-msg');

    // Khởi tạo chế độ chỉnh sửa & PIN modal
    this.initEditMode();

    // Đăng ký GSAP MotionPathPlugin
    if (typeof gsap !== 'undefined' && typeof MotionPathPlugin !== 'undefined') {
      gsap.registerPlugin(MotionPathPlugin);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // buildJourneyPath — tạo chuỗi d="" cho #journey-path
  //   Gọi generateCoordinates() để tính toạ độ SVG động (không
  //   còn phụ thuộc vào pathCoordinate hardcode trong data.js).
  //   Gán lại pathCoordinate cho từng scene để unlockNextScene()
  //   và _placeCharacterAt() vẫn hoạt động bình thường.
  // ══════════════════════════════════════════════════════════════
  buildJourneyPath() {
    // ── Tính toạ độ động theo số lượng scene hiện tại ─────────
    const coords = generateCoordinates(this.scenesData.length);

    // Gán lại pathCoordinate (quan trọng: unlockNextScene đọc field này)
    this.scenesData.forEach((scene, i) => {
      scene.pathCoordinate = coords[i];
    });

    const pts = coords;

    // ── Catmull-Rom → Bezier helper ───────────────────────────
    const catmullToBezier = (p0, p1, p2, p3) => {
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      return { cp1x, cp1y, cp2x, cp2y };
    };

    // Bổ sung điểm ảo ở hai đầu để cong mượt tại đầu/cuối path
    const extended = [
      { x: pts[0].x * 2 - pts[1].x, y: pts[0].y * 2 - pts[1].y },
      ...pts,
      { x: pts[pts.length - 1].x * 2 - pts[pts.length - 2].x,
        y: pts[pts.length - 1].y * 2 - pts[pts.length - 2].y }
    ];

    // Xây chuỗi d SVG
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const { cp1x, cp1y, cp2x, cp2y } =
        catmullToBezier(extended[i], extended[i+1], extended[i+2], extended[i+3]);
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)},` +
           ` ${cp2x.toFixed(2)} ${cp2y.toFixed(2)},` +
           ` ${pts[i+1].x} ${pts[i+1].y}`;
    }

    this.journeyPath.setAttribute('d', d);
    this._placeCharacterAt(pts[0]);
  }

  // ── Đặt nhân vật vào toạ độ SVG (x, y) ──────────────────────
  _placeCharacterAt({ x, y }) {
    // Xoá transform do GSAP để lại trước khi vẽ lại
    if (typeof gsap !== 'undefined') {
      gsap.set(this.character, { clearProps: 'all' });
    }
    this.character.setAttribute('transform', '');
    // Vẽ lại chấm tròn tại toạ độ mới
    this.character.innerHTML = `
      <circle cx="${x}" cy="${y}" r="10" />
      <circle cx="${x}" cy="${y}" r="16" fill="rgba(184,74,91,0.18)" />
    `;
  }

  // ══════════════════════════════════════════════════════════════
  // _resetUI — reset trạng thái ban đầu giữa các scene
  // ══════════════════════════════════════════════════════════════
  _resetUI() {
    // Ẩn các khối phụ
    this.questionBox.classList.add('hidden');
    this.hintBox.classList.add('hidden');
    this.feedbackMsg.classList.add('hidden');
    this.feedbackMsg.className = 'hidden'; // xoá class success/error cũ
    this.mediaContainer.classList.add('hidden');
    this.mediaContainer.innerHTML = '';
    this.journalContainer.classList.add('hidden');
    this.epilogueContainer.classList.add('hidden');

    // Xoá listener cũ của #continue-btn bằng clone-replace
    const newBtn = this.continueBtn.cloneNode(true);
    this.continueBtn.parentNode.replaceChild(newBtn, this.continueBtn);
    this.continueBtn = newBtn;
  }

  // ══════════════════════════════════════════════════════════════
  // loadScene(index) — tải và hiển thị một scene
  // ══════════════════════════════════════════════════════════════
  loadScene(index) {
    this.currentSceneIndex = index;
    const scene = this.scenesData[index];
    if (!scene) return;

    this._resetUI();

    // Header luôn hiện
    this.sceneIndicator.textContent = `Kỷ niệm ${index + 1} / ${this.scenesData.length}`;
    this.sceneTitle.textContent = scene.sceneName;

    // ── EPILOGUE: scene không có câu hỏi ──────────────────────
    if (scene.question === null) {
      this._showEpilogue(scene);
      return;
    }

    // ── SCENE CÓ NHẬT KÝ → hiện journal trước ────────────────
    if (scene.journalEntry) {
      this.journalText.textContent = scene.journalEntry;
      this.journalContainer.classList.remove('hidden');
      // Khởi động lại animation bằng reflow
      void this.journalContainer.offsetWidth;
      this.journalContainer.style.animation = 'none';
      this.journalContainer.offsetHeight; // trigger reflow
      this.journalContainer.style.animation = '';

      this.continueBtn.addEventListener('click', () => {
        // Ẩn journal với fade-out
        this.journalContainer.classList.add('fade-out');
        setTimeout(() => {
          this.journalContainer.classList.add('hidden');
          this.journalContainer.classList.remove('fade-out');
          // Hiện question-box với slide-up
          this.questionBox.classList.remove('hidden');
          this.questionBox.classList.add('slide-up');
          this.questionBox.addEventListener('animationend', () => {
            this.questionBox.classList.remove('slide-up');
          }, { once: true });
          this.renderScene();
        }, 300);
      }, { once: true });
    } else {
      // Không có journal → vào câu hỏi luôn
      this.questionBox.classList.remove('hidden');
      this.questionBox.classList.add('slide-up');
      this.questionBox.addEventListener('animationend', () => {
        this.questionBox.classList.remove('slide-up');
      }, { once: true });
      this.renderScene();
    }
  }

  // ── Hiện màn epilogue ─────────────────────────────────────────
  _showEpilogue(scene) {
    this.quizContainer.classList.add('hidden');
    this.epilogueTitle.textContent = scene.sceneName;
    this.epilogueMessage.textContent = scene.epilogueMessage || '';
    this.epilogueContainer.classList.remove('hidden');

    // Hiện media nếu có
    if (scene.mediaAfterUnlock && scene.mediaAfterUnlock.src) {
      this._renderMedia(scene.mediaAfterUnlock, this.epilogueContainer);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // renderScene() — điền nội dung câu hỏi + options vào DOM
  // ══════════════════════════════════════════════════════════════
  renderScene() {
    const scene = this.scenesData[this.currentSceneIndex];

    this.questionText.textContent = scene.question;
    this.hintText.textContent = scene.hint || '';

    // Render các nút lựa chọn
    this.optionsList.innerHTML = '';
    scene.options.forEach(option => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.textContent = option;
      btn.addEventListener('click', () => this.checkAnswer(option, btn));
      this.optionsList.appendChild(btn);
    });
  }

  // ══════════════════════════════════════════════════════════════
  // checkAnswer(selectedOption, btnEl) — kiểm tra đáp án
  // ══════════════════════════════════════════════════════════════
  checkAnswer(selectedOption, btnEl) {
    const scene = this.scenesData[this.currentSceneIndex];
    const isCorrect = selectedOption === scene.correctAnswer;

    if (isCorrect) {
      // ── Đáp án ĐÚNG ──
      btnEl.classList.add('is-correct');

      // Disable toàn bộ nút lựa chọn
      this.optionsList.querySelectorAll('.option-btn').forEach(b => {
        b.disabled = true;
        b.style.cursor = 'default';
      });

      // Hiện phản hồi tích cực
      this.feedbackMsg.textContent = '✓ Chính xác rồi! Hành trình tiếp tục...';
      this.feedbackMsg.className = 'success';
      this.feedbackMsg.classList.remove('hidden');

      // Ẩn hint nếu đang hiện
      this.hintBox.classList.add('hidden');

      // Đợi animation xong rồi unlock
      setTimeout(() => this.unlockNextScene(), 1200);

    } else {
      // ── Đáp án SAI ──
      // Xoá class cũ nếu đã bấm sai lần trước
      btnEl.classList.remove('is-wrong');
      void btnEl.offsetWidth; // trigger reflow để restart animation
      btnEl.classList.add('is-wrong');

      // Tự xoá class sau khi animation kết thúc (cho thử lại)
      btnEl.addEventListener('animationend', () => {
        btnEl.classList.remove('is-wrong');
      }, { once: true });

      // Hiện hint
      this.hintBox.classList.remove('hidden');

      // Phản hồi thất bại
      this.feedbackMsg.textContent = 'Chưa đúng rồi. Thử lại nhé!';
      this.feedbackMsg.className = 'error';
      this.feedbackMsg.classList.remove('hidden');

      // Ẩn feedback sau 2s
      setTimeout(() => {
        this.feedbackMsg.classList.add('hidden');
      }, 2000);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // unlockNextScene() — hiện media + animate GSAP + chuyển cảnh
  // ══════════════════════════════════════════════════════════════
  unlockNextScene() {
    const scene = this.scenesData[this.currentSceneIndex];
    const nextIndex = this.currentSceneIndex + 1;
    const hasNext = nextIndex < this.scenesData.length;

    // ── Hiện media của scene vừa mở khoá ─────────────────────
    if (scene.mediaAfterUnlock && scene.mediaAfterUnlock.src) {
      this._renderMedia(scene.mediaAfterUnlock, this.mediaContainer);
      this.mediaContainer.classList.remove('hidden');
    }

    // ── GSAP MotionPath: di chuyển nhân vật tới toạ độ tiếp theo
    if (typeof gsap !== 'undefined' && hasNext) {
      const nextCoord = this.scenesData[nextIndex].pathCoordinate;

      // Tính tiến trình dọc path (0 → 1)
      const totalSegments = this.scenesData.length - 1;
      const progressStart = this.currentSceneIndex / totalSegments;
      const progressEnd = nextIndex / totalSegments;

      gsap.to(this.character, {
        duration: 1.8,
        ease: 'power2.inOut',
        motionPath: {
          path: '#journey-path',
          start: progressStart,
          end: progressEnd,
          autoRotate: false
        },
        onComplete: () => {
          // Reset nhân vật về toạ độ cụ thể sau khi tween xong
          this._placeCharacterAt(nextCoord);

          // Nếu có media: thêm nút "Tiếp theo" để người dùng tự quyết định khi nào chuyển
          if (scene.mediaAfterUnlock && scene.mediaAfterUnlock.src) {
            const nextBtn = document.createElement('button');
            nextBtn.textContent = nextIndex < this.scenesData.length - 1
              ? '→ Kỷ niệm tiếp theo'
              : '→ Đọc lời kết';
            nextBtn.className = 'next-scene-btn';
            nextBtn.addEventListener('click', () => {
              this.loadScene(nextIndex);
            }, { once: true });
            this.mediaContainer.appendChild(nextBtn);
          } else {
            // Không có media: chuyển tự động sau 600ms
            setTimeout(() => this.loadScene(nextIndex), 600);
          }
        }
      });
    } else if (hasNext) {
      // Fallback: GSAP không tải được
      setTimeout(() => this.loadScene(nextIndex), 1200);
    }
  }

  // ── Helper: render media vào một container ───────────────────
  _renderMedia({ type, src }, container) {
    let el;
    if (type === 'image') {
      el = document.createElement('img');
      el.src = src;
      el.alt = 'Ảnh kỷ niệm';
      el.loading = 'lazy';
    } else if (type === 'audio') {
      el = document.createElement('audio');
      el.src = src;
      el.controls = true;
      el.preload = 'metadata';
    }
    if (el) {
      el.classList.add('fade-in');
      container.appendChild(el);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // handleScenesUpdate(newScenesData) — xử lý real-time update
  //   Được gọi khi Firestore gửi snapshot mới (không reload trang).
  //   Cập nhật đường path SVG và header scene hiện tại.
  //   KHÔNG reset game state (người chơi vẫn ở scene cũ).
  // ══════════════════════════════════════════════════════════════
  handleScenesUpdate(newScenesData) {
    this.scenesData = newScenesData;

    // Vẽ lại path với số lượng scene mới (pathCoordinate sẽ được tính lại)
    this.buildJourneyPath();

    // Nếu currentSceneIndex vẫn hợp lệ: cập nhật header nhẹ nhàng
    if (this.currentSceneIndex < newScenesData.length) {
      const scene = newScenesData[this.currentSceneIndex];
      this.sceneIndicator.textContent =
        `Kỷ niệm ${this.currentSceneIndex + 1} / ${newScenesData.length}`;
      this.sceneTitle.textContent = scene.sceneName;
    } else {
      // Scene hiện tại bị xoá khỏi Firestore → về scene cuối cùng còn lại
      this.loadScene(newScenesData.length - 1);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ CHẾ ĐỘ CHỈNH SỬA & XÁC THỰC PIN
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo các sự kiện và trạng thái cho chế độ chỉnh sửa
   */
  initEditMode() {
    // 1. Phục hồi trạng thái edit mode từ sessionStorage trong phiên làm việc
    const savedEditMode = sessionStorage.getItem('isEditMode') === 'true';
    this.setEditMode(savedEditMode);

    if (!this.editModeBtn) return;

    // 2. Click nút edit-mode-btn: mở modal nếu chưa bật, hoặc hỏi xác nhận tắt nếu đang bật
    this.editModeBtn.addEventListener('click', () => {
      if (this.isEditMode) {
        if (confirm('Bạn đang ở chế độ chỉnh sửa. Bạn có muốn thoát chế độ này không?')) {
          this.setEditMode(false);
        }
      } else {
        this.openPinModal();
      }
    });

    // 3. Sự kiện modal xác nhận PIN
    if (this.pinConfirmBtn) {
      this.pinConfirmBtn.addEventListener('click', () => this.verifyPin());
    }

    if (this.pinCancelBtn) {
      this.pinCancelBtn.addEventListener('click', () => this.closePinModal());
    }

    if (this.pinInput) {
      this.pinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.verifyPin();
        } else if (e.key === 'Escape') {
          this.closePinModal();
        }
      });

      this.pinInput.addEventListener('input', () => {
        if (this.pinErrorMsg) {
          this.pinErrorMsg.classList.add('hidden');
          this.pinErrorMsg.textContent = '';
        }
        this.pinInput.classList.remove('is-invalid');
      });
    }

    // Đóng modal khi click ra ngoài overlay
    if (this.pinModal) {
      this.pinModal.addEventListener('click', (e) => {
        if (e.target === this.pinModal) {
          this.closePinModal();
        }
      });
    }

    // Phím Escape đóng modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.pinModal && !this.pinModal.classList.contains('hidden')) {
        this.closePinModal();
      }
    });
  }

  /**
   * Mở modal nhập PIN
   */
  openPinModal() {
    if (!this.pinModal) return;
    if (this.pinInput) {
      this.pinInput.value = '';
      this.pinInput.classList.remove('is-invalid');
    }
    if (this.pinErrorMsg) {
      this.pinErrorMsg.classList.add('hidden');
      this.pinErrorMsg.textContent = '';
    }
    this.pinModal.classList.remove('hidden');
    setTimeout(() => {
      if (this.pinInput) this.pinInput.focus();
    }, 100);
  }

  /**
   * Đóng modal nhập PIN
   */
  closePinModal() {
    if (!this.pinModal) return;
    this.pinModal.classList.add('hidden');
    if (this.pinInput) {
      this.pinInput.value = '';
      this.pinInput.classList.remove('is-invalid');
    }
    if (this.pinErrorMsg) {
      this.pinErrorMsg.classList.add('hidden');
      this.pinErrorMsg.textContent = '';
    }
  }

  /**
   * Kiểm tra mã PIN nhập vào
   */
  verifyPin() {
    const enteredPin = this.pinInput ? this.pinInput.value.trim() : '';
    // Đọc mã PIN từ cấu hình APP_CONFIG (không hardcode trong main.js)
    const configuredPin = window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : '';

    if (!enteredPin) {
      this.showPinError('Vui lòng nhập mã PIN.');
      return;
    }

    if (configuredPin && enteredPin === configuredPin) {
      this.setEditMode(true);
      this.closePinModal();
    } else {
      this.showPinError('Mã PIN không đúng. Vui lòng thử lại.');
    }
  }

  /**
   * Hiển thị thông báo lỗi trong modal (không ném lỗi console)
   * @param {string} msg 
   */
  showPinError(msg) {
    if (this.pinErrorMsg) {
      this.pinErrorMsg.textContent = msg;
      this.pinErrorMsg.classList.remove('hidden');
    }
    if (this.pinInput) {
      this.pinInput.classList.remove('is-invalid');
      void this.pinInput.offsetWidth; // trigger reflow cho rung lắc animation
      this.pinInput.classList.add('is-invalid');
      this.pinInput.focus();
      this.pinInput.select();
    }
  }

  /**
   * Cập nhật trạng thái chế độ chỉnh sửa (isEditMode) và lưu vào sessionStorage
   * @param {boolean} isActive 
   */
  setEditMode(isActive) {
    this.isEditMode = Boolean(isActive);
    if (this.isEditMode) {
      sessionStorage.setItem('isEditMode', 'true');
      if (this.editModeBtn) {
        this.editModeBtn.classList.add('is-active');
        this.editModeBtn.setAttribute('title', 'Đang ở chế độ chỉnh sửa (Bấm để thoát)');
        this.editModeBtn.setAttribute('aria-label', 'Đang ở chế độ chỉnh sửa (Bấm để thoát)');
      }
      if (this.editBadge) {
        this.editBadge.classList.remove('hidden');
      }
      document.body.classList.add('edit-mode-active');
    } else {
      sessionStorage.removeItem('isEditMode');
      if (this.editModeBtn) {
        this.editModeBtn.classList.remove('is-active');
        this.editModeBtn.setAttribute('title', 'Bật chế độ chỉnh sửa');
        this.editModeBtn.setAttribute('aria-label', 'Bật chế độ chỉnh sửa');
      }
      if (this.editBadge) {
        this.editBadge.classList.add('hidden');
      }
      document.body.classList.remove('edit-mode-active');
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Khởi động game — dùng Firebase event, fallback về dữ liệu tĩnh
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // Helper: khởi tạo game từ một mảng scenes data
  function startGame(scenesData) {
    if (window.__LJ_GAME) return; // ngăn khởi tạo trùng lặp
    const game = new GameController(scenesData);
    game.buildJourneyPath();
    game.loadScene(0);
    window.__LJ_GAME = game;
  }

  // ── Lắng nghe Firebase: lần đầu có dữ liệu ────────────────
  window.addEventListener('lj:scenesReady', (e) => {
    console.log('[LoveJourney] Firebase: dữ liệu sẵn sàng,', e.detail.scenes.length, 'scenes.');
    startGame(e.detail.scenes);
  }, { once: true });

  // ── Lắng nghe Firebase: real-time update (Firestore thay đổi) ──
  window.addEventListener('lj:scenesUpdated', (e) => {
    if (window.__LJ_GAME) {
      console.log('[LoveJourney] Firebase: cập nhật real-time,', e.detail.scenes.length, 'scenes.');
      window.__LJ_GAME.handleScenesUpdate(e.detail.scenes);
    }
  });

  // ── Lắng nghe lỗi Firebase: kích hoạt fallback tĩnh ────────
  window.addEventListener('lj:firestoreError', () => {
    console.warn('[LoveJourney] Firestore lỗi → dùng dữ liệu tĩnh từ data.js.');
    if (!window.__LJ_GAME && typeof SCENES_DATA !== 'undefined') {
      startGame(SCENES_DATA);
    }
  }, { once: true });

  window.addEventListener('lj:firestoreEmpty', () => {
    console.warn('[LoveJourney] Firestore trống → dùng dữ liệu tĩnh từ data.js.');
    if (!window.__LJ_GAME && typeof SCENES_DATA !== 'undefined') {
      startGame(SCENES_DATA);
    }
  }, { once: true });

  // ── Timeout fallback 6 giây: nếu Firebase không phản hồi ───
  setTimeout(() => {
    if (!window.__LJ_GAME) {
      if (typeof SCENES_DATA !== 'undefined') {
        console.warn('[LoveJourney] Firebase timeout (6s) → fallback dữ liệu tĩnh.');
        startGame(SCENES_DATA);
      } else {
        console.error('[LoveJourney] Không có dữ liệu. Kiểm tra kết nối mạng và data.js.');
      }
    }
  }, 6000);
});

