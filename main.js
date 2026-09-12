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

// ══════════════════════════════════════════════════════════════
// stripSceneOrdinalPrefix(name) — loại bỏ tiền tố số thứ tự cứng
//
// Loại bỏ các tiền tố như "Kỷ niệm 1: ", "Kỷ niệm số 2: ", "2: ",
// "Kỷ niệm 1 - " khỏi chuỗi tiêu đề khi hiển thị lên giao diện,
// tránh xung đột với số đếm động "KỶ NIỆM {index+1} / {total}".
// Không làm thay đổi dữ liệu gốc trong scenesData hoặc Firestore.
// ══════════════════════════════════════════════════════════════
function stripSceneOrdinalPrefix(name) {
  if (!name || typeof name !== 'string') return '';
  const cleaned = name.replace(/^(?:kỷ\s*niệm(?:\s+số)?\s*\d*|\d+)\s*[:\-–—]\s*/i, '').trim();
  return cleaned || name.trim();
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

    // Khởi tạo cử chỉ vuốt chuyển cảnh (Swipe Navigation - Phase 2)
    this.initSwipeNavigation();

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
    this.quizContainer.classList.remove('hidden');

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
    this.sceneIndicator.textContent = `Kỷ niệm ${index + 1}`;
    this.sceneTitle.textContent = stripSceneOrdinalPrefix(scene.sceneName);

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
    this.epilogueTitle.textContent = stripSceneOrdinalPrefix(scene.sceneName);
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
      this.sceneIndicator.textContent = `Kỷ niệm ${this.currentSceneIndex + 1}`;
      this.sceneTitle.textContent = stripSceneOrdinalPrefix(scene.sceneName);

      // Cập nhật nội dung văn bản hiển thị nếu đang xem scene này
      if (scene.journalEntry && this.journalText) {
        this.journalText.textContent = scene.journalEntry;
      }
      if (scene.question && this.questionText) {
        this.questionText.textContent = scene.question;
      }
      if (scene.hint && this.hintText) {
        this.hintText.textContent = scene.hint;
      }
      if (this.epilogueTitle) {
        this.epilogueTitle.textContent = stripSceneOrdinalPrefix(scene.sceneName);
      }
      if (scene.epilogueMessage && this.epilogueMessage) {
        this.epilogueMessage.textContent = scene.epilogueMessage;
      }
    } else {
      // Scene hiện tại bị xoá khỏi Firestore → về scene cuối cùng còn lại
      this.loadScene(newScenesData.length - 1);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ĐIỀU HƯỚNG BẰNG CỬ CHỈ VUỐT DỌC (SWIPE NAVIGATION - Phase 2)
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo bắt sự kiện touch trên container để điều hướng vuốt
   */
  initSwipeNavigation() {
    const container = document.querySelector('.scene-container');
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
      if (e.changedTouches.length !== 1) return;

      // 1. Không bắt cử chỉ vuốt khi đang mở bất kỳ modal nào (PIN, Sửa, Thêm)
      const isAnyModalOpen =
        (this.pinModal && !this.pinModal.classList.contains('hidden')) ||
        (this.editSceneModal && !this.editSceneModal.classList.contains('hidden')) ||
        (this.addSceneModal && !this.addSceneModal.classList.contains('hidden'));
      if (isAnyModalOpen) return;

      // 2. Không bắt cử chỉ vuốt khi tương tác với cụm nút admin, form controls
      const target = e.target;
      if (target.closest('#edit-controls-container, input, textarea, select')) return;

      const touch = e.changedTouches[0];
      const deltaX = startX - touch.clientX;
      const deltaY = startY - touch.clientY;
      const duration = Date.now() - startTime;

      // 3. Tiêu chí vuốt LÊN:
      //    - Quãng đường vuốt lên >= 60px
      //    - Định hướng chủ yếu theo phương dọc (deltaY > 1.4 * |deltaX|)
      //    - Thao tác dứt khoát (< 650ms) để không nhầm với giữ/chạm chậm
      const isSwipeUp = deltaY > 60 && Math.abs(deltaY) > Math.abs(deltaX) * 1.4 && duration < 650;
      if (!isSwipeUp) return;

      // 4. Đảm bảo không xung đột cuộn tự nhiên:
      //    Nếu phần tử chứa văn bản dài và chưa được cuộn tới đáy,
      //    để người dùng cuộn đọc hết trước, không kích hoạt chuyển cảnh sớm.
      if (!this._isScrolledToBottom(target)) return;

      this._handleSwipeUp();
    }, { passive: true });
  }

  /**
   * Kiểm tra xem phần tử (hoặc các cha scrollable của nó) đã cuộn tới sát đáy chưa
   * @param {HTMLElement} target
   * @returns {boolean}
   */
  _isScrolledToBottom(target) {
    let el = target;
    while (el && el !== document.body && el !== document.documentElement) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        // Dung sai 10px để tính việc đã cuộn tới đáy hay chưa
        if (el.scrollHeight - el.clientHeight > 10) {
          const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
          if (distanceToBottom > 10) {
            return false; // Vẫn còn nội dung bên dưới, ưu tiên cuộn tự nhiên
          }
        }
      }
      el = el.parentElement;
    }
    return true;
  }

  /**
   * Xử lý chuyển cảnh khi người dùng vuốt LÊN
   */
  _handleSwipeUp() {
    // 1. Nếu đang ở màn Nhật ký (chưa sang câu hỏi):
    //    Gọi lại đúng nút #continue-btn để thực thi chung 1 luồng animation và render
    if (this.journalContainer && !this.journalContainer.classList.contains('hidden')) {
      if (this.journalContainer.classList.contains('fade-out')) return; // Đang chuyển dở
      if (this.continueBtn) {
        this.continueBtn.click();
      }
      return;
    }

    // 2. Nếu đang ở màn Câu hỏi:
    if (this.questionBox && !this.questionBox.classList.contains('hidden')) {
      const nextBtn = document.querySelector('.next-scene-btn');
      if (nextBtn) {
        // Đã trả lời đúng và mở khoá: gọi nút next-scene-btn để sang scene kế tiếp
        nextBtn.click();
      } else {
        // Chưa trả lời đúng: rung nhẹ cảnh báo (không cho phép skip câu hỏi)
        this._bounceLockedQuestion();
      }
      return;
    }

    // 3. Trường hợp màn hình đang có nút .next-scene-btn
    const nextBtn = document.querySelector('.next-scene-btn');
    if (nextBtn) {
      nextBtn.click();
    }
  }

  /**
   * Rung nhẹ (bounce) câu hỏi báo hiệu chưa thể vuốt chuyển tiếp khi chưa trả lời đúng
   */
  _bounceLockedQuestion() {
    if (!this.questionBox) return;
    this.questionBox.classList.remove('swipe-locked-bounce');
    void this.questionBox.offsetWidth; // Trigger reflow để khởi động lại animation
    this.questionBox.classList.add('swipe-locked-bounce');
    this.questionBox.addEventListener('animationend', () => {
      this.questionBox.classList.remove('swipe-locked-bounce');
    }, { once: true });
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ CHẾ ĐỘ CHỈNH SỬA & XÁC THỰC PIN
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo các sự kiện và trạng thái cho chế độ chỉnh sửa
   */
  initEditMode() {
    // Khởi tạo các thành phần form sửa scene
    this.initEditSceneModal();
    // Khởi tạo các thành phần form thêm scene mới
    this.initAddSceneModal();

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
      this.renderEditSceneButton();
      this.renderAddSceneButton();
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
      this.removeEditSceneButton();
      this.removeAddSceneButton();
      this.closeEditSceneModal();
      this.closeAddSceneModal();
    }
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ FORM & NÚT CHỈNH SỬA SCENE HIỆN TẠI
  // ══════════════════════════════════════════════════════════════

  /**
   * Render nút "Sửa" vào DOM khi edit mode bật
   * (Chỉ render khi isEditMode === true, tránh lộ UI khi tắt)
   */
  renderEditSceneButton() {
    if (document.getElementById('edit-scene-btn')) return;

    const container = document.getElementById('edit-controls-container') || document.querySelector('.scene-container');
    if (!container) return;

    const btn = document.createElement('button');
    btn.id = 'edit-scene-btn';
    btn.className = 'edit-scene-btn';
    btn.type = 'button';
    btn.title = 'Chỉnh sửa nội dung kỷ niệm đang xem';
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
      </svg>
      <span>Sửa</span>
    `;

    btn.addEventListener('click', () => this.openEditSceneModal());
    container.appendChild(btn);
  }

  /**
   * Xoá hoàn toàn nút "Sửa" khỏi DOM khi edit mode tắt
   */
  removeEditSceneButton() {
    const btn = document.getElementById('edit-scene-btn');
    if (btn) btn.remove();
  }

  /**
   * Khởi tạo tham chiếu và sự kiện cho modal chỉnh sửa scene
   */
  initEditSceneModal() {
    this.editSceneModal    = document.getElementById('edit-scene-modal');
    this.editSceneForm     = document.getElementById('edit-scene-form');
    this.editSceneCloseX   = document.getElementById('edit-scene-close-x');
    this.editSceneCancelBtn = document.getElementById('edit-scene-cancel-btn');
    this.editSceneSaveBtn  = document.getElementById('edit-scene-save-btn');
    this.editSceneErrorMsg = document.getElementById('edit-scene-error-msg');

    this.editIsEpilogue    = document.getElementById('edit-is-epilogue');
    this.editQuizFields    = document.getElementById('edit-quiz-fields');
    this.editEpilogueFields = document.getElementById('edit-epilogue-fields');

    this.editJournalEntry  = document.getElementById('edit-journal-entry');
    this.editQuestion      = document.getElementById('edit-question');
    this.editOptionInputs  = [
      document.getElementById('edit-option-0'),
      document.getElementById('edit-option-1'),
      document.getElementById('edit-option-2'),
      document.getElementById('edit-option-3')
    ];
    this.editCorrectAnswer = document.getElementById('edit-correct-answer');
    this.editHint          = document.getElementById('edit-hint');
    this.editEpilogueMsg   = document.getElementById('edit-epilogue-message');
    this.editMediaUrl      = document.getElementById('edit-media-url');

    if (this.editSceneCloseX) {
      this.editSceneCloseX.addEventListener('click', () => this.closeEditSceneModal());
    }

    if (this.editSceneCancelBtn) {
      this.editSceneCancelBtn.addEventListener('click', () => this.closeEditSceneModal());
    }

    if (this.editSceneForm) {
      this.editSceneForm.addEventListener('submit', (e) => this.saveSceneEdit(e));
    }

    // Cập nhật dropdown đáp án đúng khi gõ vào 4 options
    this.editOptionInputs.forEach(input => {
      if (input) {
        input.addEventListener('input', () => this.syncCorrectAnswerOptions());
      }
    });
  }

  /**
   * Đồng bộ 4 lựa chọn nhập vào danh sách dropdown đáp án đúng
   * @param {string|null} preserveAnswer
   */
  syncCorrectAnswerOptions(preserveAnswer = null) {
    if (!this.editCorrectAnswer) return;
    const currentVal = preserveAnswer !== null ? preserveAnswer : this.editCorrectAnswer.value;
    const letters = ['A', 'B', 'C', 'D'];

    this.editCorrectAnswer.innerHTML = '<option value="">-- Chọn đáp án đúng từ 4 lựa chọn trên --</option>';

    this.editOptionInputs.forEach((input, i) => {
      const val = input ? input.value.trim() : '';
      if (val) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = `[${letters[i]}] ${val}`;
        if (val === currentVal) {
          opt.selected = true;
        }
        this.editCorrectAnswer.appendChild(opt);
      }
    });
  }

  /**
   * Mở form chỉnh sửa, nạp dữ liệu hiện tại của scene vào các trường
   */
  openEditSceneModal() {
    if (!this.editSceneModal) return;
    const scene = this.scenesData[this.currentSceneIndex];
    if (!scene) return;

    const isEpilogue = Boolean(scene.isEpilogue || scene.question === null);

    // Tiêu đề modal
    const titleEl = document.getElementById('edit-scene-modal-title');
    if (titleEl) {
      titleEl.textContent = `Chỉnh sửa: ${stripSceneOrdinalPrefix(scene.sceneName) || ('Kỷ niệm ' + (this.currentSceneIndex + 1))}`;
    }

    // Checkbox isEpilogue (chỉ đọc)
    if (this.editIsEpilogue) {
      this.editIsEpilogue.checked = isEpilogue;
    }

    // Rẽ nhánh các trường hiển thị theo loại scene
    if (isEpilogue) {
      if (this.editQuizFields) this.editQuizFields.classList.add('hidden');
      if (this.editEpilogueFields) this.editEpilogueFields.classList.remove('hidden');
      if (this.editEpilogueMsg) this.editEpilogueMsg.value = scene.epilogueMessage || '';
    } else {
      if (this.editQuizFields) this.editQuizFields.classList.remove('hidden');
      if (this.editEpilogueFields) this.editEpilogueFields.classList.add('hidden');
      if (this.editJournalEntry) this.editJournalEntry.value = scene.journalEntry || '';
      if (this.editQuestion) this.editQuestion.value = scene.question || '';

      const opts = Array.isArray(scene.options) ? scene.options : ['', '', '', ''];
      this.editOptionInputs.forEach((input, i) => {
        if (input) input.value = opts[i] || '';
      });

      this.syncCorrectAnswerOptions(scene.correctAnswer || '');
      if (this.editHint) this.editHint.value = scene.hint || '';
    }

    // Media Url
    if (this.editMediaUrl) {
      this.editMediaUrl.value = scene.mediaUrl || (scene.mediaAfterUnlock ? scene.mediaAfterUnlock.src : '') || '';
    }

    // Xoá lỗi cũ và hiển thị modal
    this.hideEditSceneError();
    this.editSceneModal.classList.remove('hidden');
  }

  /**
   * Đóng form chỉnh sửa
   */
  closeEditSceneModal() {
    if (!this.editSceneModal) return;
    this.editSceneModal.classList.add('hidden');
    this.hideEditSceneError();
  }

  /**
   * Hiển thị thông báo lỗi trong form
   * @param {string} msg 
   */
  showEditSceneError(msg) {
    if (this.editSceneErrorMsg) {
      this.editSceneErrorMsg.textContent = msg;
      this.editSceneErrorMsg.classList.remove('hidden');
    }
  }

  /**
   * Ẩn thông báo lỗi
   */
  hideEditSceneError() {
    if (this.editSceneErrorMsg) {
      this.editSceneErrorMsg.textContent = '';
      this.editSceneErrorMsg.classList.add('hidden');
    }
  }

  /**
   * Validate và gửi payload cập nhật scene lên Firestore
   * @param {Event} e 
   */
  async saveSceneEdit(e) {
    e.preventDefault();
    this.hideEditSceneError();

    const scene = this.scenesData[this.currentSceneIndex];
    if (!scene) return;

    const isEpilogue = Boolean(scene.isEpilogue || scene.question === null);

    // 1. Validate cơ bản
    let journal = '';
    let question = '';
    let options = [];
    let correctAnswer = '';
    let hint = '';
    let epilogueMsg = '';

    if (!isEpilogue) {
      journal = this.editJournalEntry ? this.editJournalEntry.value.trim() : '';
      question = this.editQuestion ? this.editQuestion.value.trim() : '';
      options = this.editOptionInputs.map(input => input ? input.value.trim() : '');
      correctAnswer = this.editCorrectAnswer ? this.editCorrectAnswer.value.trim() : '';
      hint = this.editHint ? this.editHint.value.trim() : '';

      if (!journal) {
        this.showEditSceneError('Vui lòng nhập đoạn nhật ký.');
        return;
      }
      if (!question) {
        this.showEditSceneError('Vui lòng nhập câu hỏi trắc nghiệm.');
        return;
      }
      if (options.some(o => !o)) {
        this.showEditSceneError('Vui lòng nhập đầy đủ cả 4 lựa chọn trắc nghiệm.');
        return;
      }
      if (!correctAnswer) {
        this.showEditSceneError('Vui lòng chọn 1 đáp án đúng từ danh sách.');
        return;
      }
      if (!hint) {
        this.showEditSceneError('Vui lòng nhập gợi ý khi trả lời sai.');
        return;
      }
    } else {
      epilogueMsg = this.editEpilogueMsg ? this.editEpilogueMsg.value.trim() : '';
      if (!epilogueMsg) {
        this.showEditSceneError('Vui lòng nhập lời nhắn kết thúc.');
        return;
      }
    }

    const mediaUrl = this.editMediaUrl ? this.editMediaUrl.value.trim() : '';

    // 2. Chuẩn bị payload đúng schema Firestore (kèm field pin để khớp Security Rules)
    const payload = {
      order: Number(scene.id),
      sceneName: scene.sceneName,
      isEpilogue: isEpilogue,
      mediaUrl: mediaUrl || null,
      pin: window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : ''
    };

    if (!isEpilogue) {
      payload.journalEntry = journal;
      payload.question = question;
      payload.options = options;
      payload.correctAnswer = correctAnswer;
      payload.hint = hint;
      payload.epilogueMessage = null;
    } else {
      payload.journalEntry = null;
      payload.question = null;
      payload.options = null;
      payload.correctAnswer = null;
      payload.hint = null;
      payload.epilogueMessage = epilogueMsg;
    }

    // 3. Document ID trong collection "memories"
    const firestoreId = scene.firestoreId || (`scene_${String(scene.id).padStart(2, '0')}`);

    // 4. Gọi hàm ghi Firestore
    if (this.editSceneSaveBtn) {
      this.editSceneSaveBtn.disabled = true;
      this.editSceneSaveBtn.textContent = 'Đang lưu...';
    }

    try {
      if (typeof window.__LJ_UPDATE_SCENE !== 'function') {
        throw new Error('Chức năng ghi Firestore chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng.');
      }

      await window.__LJ_UPDATE_SCENE(firestoreId, payload);
      console.log(`[LoveJourney] Đã cập nhật ${firestoreId} thành công.`);
      this.closeEditSceneModal();
    } catch (err) {
      console.warn('[LoveJourney] Lỗi lưu scene:', err);
      let errorText = 'Lỗi lưu dữ liệu: ';
      if (err && err.code === 'permission-denied') {
        errorText += 'Không có quyền ghi (mã PIN không khớp Security Rules).';
      } else {
        errorText += (err.message || 'Vui lòng thử lại sau.');
      }
      this.showEditSceneError(errorText);
    } finally {
      if (this.editSceneSaveBtn) {
        this.editSceneSaveBtn.disabled = false;
        this.editSceneSaveBtn.textContent = 'Lưu';
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ FORM & NÚT THÊM KỶ NIỆM MỚI (FRACTIONAL INDEXING)
  // ══════════════════════════════════════════════════════════════

  /**
   * Render nút "+ Thêm" vào DOM khi edit mode bật
   * (Chỉ render khi isEditMode === true, tránh lộ UI khi tắt)
   */
  renderAddSceneButton() {
    if (document.getElementById('add-scene-btn')) return;

    const container = document.getElementById('edit-controls-container') || document.querySelector('.scene-container');
    if (!container) return;

    const btn = document.createElement('button');
    btn.id = 'add-scene-btn';
    btn.className = 'add-scene-btn';
    btn.type = 'button';
    btn.title = 'Thêm kỷ niệm mới';
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      <span>+ Thêm</span>
    `;

    btn.addEventListener('click', () => this.openAddSceneModal());
    container.appendChild(btn);
  }

  /**
   * Xoá hoàn toàn nút "+ Thêm" khỏi DOM khi edit mode tắt
   */
  removeAddSceneButton() {
    const btn = document.getElementById('add-scene-btn');
    if (btn) btn.remove();
  }

  /**
   * Khởi tạo tham chiếu và sự kiện cho modal thêm scene mới
   */
  initAddSceneModal() {
    this.addSceneModal     = document.getElementById('add-scene-modal');
    this.addSceneForm      = document.getElementById('add-scene-form');
    this.addSceneCloseX    = document.getElementById('add-scene-close-x');
    this.addSceneCancelBtn = document.getElementById('add-scene-cancel-btn');
    this.addSceneSaveBtn   = document.getElementById('add-scene-save-btn');
    this.addSceneErrorMsg  = document.getElementById('add-scene-error-msg');

    this.addInsertPosition = document.getElementById('add-insert-position');
    this.addSceneName      = document.getElementById('add-scene-name');
    this.addJournalEntry   = document.getElementById('add-journal-entry');
    this.addQuestion       = document.getElementById('add-question');
    this.addOptionInputs   = [
      document.getElementById('add-option-0'),
      document.getElementById('add-option-1'),
      document.getElementById('add-option-2'),
      document.getElementById('add-option-3')
    ];
    this.addCorrectAnswer  = document.getElementById('add-correct-answer');
    this.addHint           = document.getElementById('add-hint');
    this.addMediaUrl       = document.getElementById('add-media-url');

    if (this.addSceneCloseX) {
      this.addSceneCloseX.addEventListener('click', () => this.closeAddSceneModal());
    }

    if (this.addSceneCancelBtn) {
      this.addSceneCancelBtn.addEventListener('click', () => this.closeAddSceneModal());
    }

    if (this.addSceneForm) {
      this.addSceneForm.addEventListener('submit', (e) => this.saveNewScene(e));
    }

    // Cập nhật dropdown đáp án đúng khi gõ vào 4 options
    this.addOptionInputs.forEach(input => {
      if (input) {
        input.addEventListener('input', () => this.syncAddCorrectAnswerOptions());
      }
    });
  }

  /**
   * Điền danh sách các vị trí chèn khả dụng vào select
   * (Chỉ cho chèn 'Đầu tiên' hoặc 'Sau các scene thường', KHÔNG cho chèn sau epilogue)
   */
  populateInsertPositionDropdown() {
    if (!this.addInsertPosition) return;
    this.addInsertPosition.innerHTML = '<option value="__first__">Đầu tiên (trước tất cả)</option>';

    // Liệt kê các scene KHÔNG PHẢI epilogue
    this.scenesData.forEach((scene, index) => {
      const isEpilogue = Boolean(scene.isEpilogue || scene.question === null);
      if (!isEpilogue) {
        const opt = document.createElement('option');
        opt.value = String(index);
        opt.textContent = `Sau: ${scene.sceneName || ('Kỷ niệm ' + (index + 1))}`;
        // Mặc định chọn vị trí ngay sau scene đang xem nếu scene đang xem không phải epilogue
        if (index === this.currentSceneIndex) {
          opt.selected = true;
        }
        this.addInsertPosition.appendChild(opt);
      }
    });
  }

  /**
   * Đồng bộ 4 lựa chọn nhập vào danh sách dropdown đáp án đúng của form thêm mới
   */
  syncAddCorrectAnswerOptions() {
    if (!this.addCorrectAnswer) return;
    const currentVal = this.addCorrectAnswer.value;
    const letters = ['A', 'B', 'C', 'D'];

    this.addCorrectAnswer.innerHTML = '<option value="">-- Chọn đáp án đúng từ 4 lựa chọn trên --</option>';

    this.addOptionInputs.forEach((input, i) => {
      const val = input ? input.value.trim() : '';
      if (val) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = `[${letters[i]}] ${val}`;
        if (val === currentVal) {
          opt.selected = true;
        }
        this.addCorrectAnswer.appendChild(opt);
      }
    });
  }

  /**
   * Mở modal thêm kỷ niệm mới
   */
  openAddSceneModal() {
    if (!this.addSceneModal) return;

    // Reset các trường nhập
    if (this.addSceneName) this.addSceneName.value = '';
    if (this.addJournalEntry) this.addJournalEntry.value = '';
    if (this.addQuestion) this.addQuestion.value = '';
    this.addOptionInputs.forEach(input => { if (input) input.value = ''; });
    if (this.addHint) this.addHint.value = '';
    if (this.addMediaUrl) this.addMediaUrl.value = '';

    // Cập nhật dropdown vị trí và đáp án đúng
    this.populateInsertPositionDropdown();
    this.syncAddCorrectAnswerOptions();
    this.hideAddSceneError();

    // Mở modal
    this.addSceneModal.classList.remove('hidden');
  }

  /**
   * Đóng modal thêm kỷ niệm mới
   */
  closeAddSceneModal() {
    if (!this.addSceneModal) return;
    this.addSceneModal.classList.add('hidden');
    this.hideAddSceneError();
  }

  showAddSceneError(msg) {
    if (this.addSceneErrorMsg) {
      this.addSceneErrorMsg.textContent = msg;
      this.addSceneErrorMsg.classList.remove('hidden');
    }
  }

  hideAddSceneError() {
    if (this.addSceneErrorMsg) {
      this.addSceneErrorMsg.textContent = '';
      this.addSceneErrorMsg.classList.add('hidden');
    }
  }

  /**
   * Tính toán field 'order' bằng kỹ thuật Fractional Indexing
   * @returns {number}
   */
  calculateNewSceneOrder() {
    const posVal = this.addInsertPosition ? this.addInsertPosition.value : '__first__';
    const getOrder = (scene) => Number(scene.id ?? scene.order);

    if (this.scenesData.length === 0) {
      return 1;
    }

    if (posVal === '__first__') {
      const firstOrder = getOrder(this.scenesData[0]);
      let newOrder;
      if (firstOrder <= 0) {
        newOrder = firstOrder - 1;
      } else {
        newOrder = firstOrder / 2;
      }

      if (Math.abs(firstOrder - newOrder) < 0.0001 || newOrder < 0.0001) {
        throw new Error('Khoảng cách thứ tự ở vị trí đầu tiên quá nhỏ (< 0.0001). Vui lòng chọn vị trí khác.');
      }
      return newOrder;
    }

    // Chọn chèn sau scene tại sorted index idx
    const idx = parseInt(posVal, 10);
    if (isNaN(idx) || idx < 0 || idx >= this.scenesData.length) {
      throw new Error('Vị trí chèn không hợp lệ.');
    }

    const orderX = getOrder(this.scenesData[idx]);

    // Scene ngay sau scene X trong danh sách đã sort (nếu X là scene thường cuối, scene sau chính là epilogue)
    if (idx + 1 < this.scenesData.length) {
      const orderY = getOrder(this.scenesData[idx + 1]);
      if (Math.abs(orderY - orderX) < 0.0001) {
        throw new Error('Khoảng cách thứ tự giữa 2 kỷ niệm quá nhỏ (< 0.0001). Vui lòng chọn vị trí khác.');
      }
      return (orderX + orderY) / 2;
    } else {
      // Trường hợp không có scene nào sau (không xảy ra vì luôn có epilogue ở cuối)
      return orderX + 1;
    }
  }

  /**
   * Validate và gửi document mới lên Firestore bằng addDoc
   * @param {Event} e 
   */
  async saveNewScene(e) {
    e.preventDefault();
    this.hideAddSceneError();

    // 1. Validate các trường bắt buộc
    const journal = this.addJournalEntry ? this.addJournalEntry.value.trim() : '';
    const question = this.addQuestion ? this.addQuestion.value.trim() : '';
    const options = this.addOptionInputs.map(input => input ? input.value.trim() : '');
    const correctAnswer = this.addCorrectAnswer ? this.addCorrectAnswer.value.trim() : '';
    const hint = this.addHint ? this.addHint.value.trim() : '';
    const mediaUrl = this.addMediaUrl ? this.addMediaUrl.value.trim() : '';
    const customName = this.addSceneName ? this.addSceneName.value.trim() : '';

    if (!journal) {
      this.showAddSceneError('Vui lòng nhập đoạn nhật ký.');
      return;
    }
    if (!question) {
      this.showAddSceneError('Vui lòng nhập câu hỏi trắc nghiệm.');
      return;
    }
    if (options.some(o => !o)) {
      this.showAddSceneError('Vui lòng nhập đầy đủ cả 4 lựa chọn trắc nghiệm.');
      return;
    }
    if (!correctAnswer) {
      this.showAddSceneError('Vui lòng chọn 1 đáp án đúng từ danh sách.');
      return;
    }
    if (!hint) {
      this.showAddSceneError('Vui lòng nhập gợi ý khi trả lời sai.');
      return;
    }

    // 2. Tính giá trị order theo vị trí chèn
    let newOrder;
    try {
      newOrder = this.calculateNewSceneOrder();
    } catch (err) {
      this.showAddSceneError(err.message);
      return;
    }

    // 3. Chuẩn bị payload đúng schema Firestore
    const payload = {
      order: newOrder,
      sceneName: customName || 'Kỷ niệm mới',
      isEpilogue: false,
      journalEntry: journal,
      question: question,
      options: options,
      correctAnswer: correctAnswer,
      hint: hint,
      mediaUrl: mediaUrl || null,
      epilogueMessage: null,
      pin: window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : ''
    };

    // 4. Ghi lên Firestore bằng addDoc
    if (this.addSceneSaveBtn) {
      this.addSceneSaveBtn.disabled = true;
      this.addSceneSaveBtn.textContent = 'Đang tạo...';
    }

    try {
      if (typeof window.__LJ_ADD_SCENE !== 'function') {
        throw new Error('Chức năng thêm scene Firestore chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng.');
      }

      const docRef = await window.__LJ_ADD_SCENE(payload);
      console.log(`[LoveJourney] Đã thêm scene mới thành công (ID: ${docRef.id}, order: ${newOrder}).`);
      this.closeAddSceneModal();
    } catch (err) {
      console.warn('[LoveJourney] Lỗi thêm scene:', err);
      let errorText = 'Lỗi tạo kỷ niệm: ';
      if (err && err.code === 'permission-denied') {
        errorText += 'Không có quyền ghi (mã PIN không khớp Security Rules).';
      } else {
        errorText += (err.message || 'Vui lòng thử lại sau.');
      }
      this.showAddSceneError(errorText);
    } finally {
      if (this.addSceneSaveBtn) {
        this.addSceneSaveBtn.disabled = false;
        this.addSceneSaveBtn.textContent = 'Tạo';
      }
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

