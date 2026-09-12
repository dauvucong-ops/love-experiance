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
    this.currentQuestionIndex = 0;
    this.isSceneUnlocked = false;
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
    this.questionProgress = document.getElementById('question-progress');
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

    // Khởi tạo thanh điều hướng 3 tab cố định ở đáy (Bottom Navigation - Phase 1)
    this.initBottomNav();

    // Khởi tạo Album Ảnh chung (Gallery - Phase 2)
    this.initGallery();

    // Khởi tạo Ghi chú về 2 người (Profiles - Phase 3)
    this.initProfiles();

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
    this.currentQuestionIndex = 0;
    this.isSceneUnlocked = false;

    // Ẩn các khối phụ
    if (this.questionProgress) {
      this.questionProgress.classList.add('hidden');
      this.questionProgress.textContent = '';
    }
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
    this.currentQuestionIndex = 0;
    this.isSceneUnlocked = false;

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
    if (!scene) return;

    // Chuẩn hoá mảng questions (fallback mảng 1 phần tử từ các field rời nếu chưa có questions)
    const questions = (Array.isArray(scene.questions) && scene.questions.length > 0)
      ? scene.questions
      : [{
          question:      scene.question,
          options:       scene.options,
          correctAnswer: scene.correctAnswer,
          hint:          scene.hint
        }];

    const totalQuestions = questions.length;
    // Đảm bảo currentQuestionIndex nằm trong biên an toàn
    if (this.currentQuestionIndex >= totalQuestions) {
      this.currentQuestionIndex = totalQuestions - 1;
    }
    if (this.currentQuestionIndex < 0) {
      this.currentQuestionIndex = 0;
    }

    const currentQ = questions[this.currentQuestionIndex] || {};

    // Chỉ báo tiến độ câu hỏi: ví dụ "Câu 1/3" nếu scene có nhiều hơn 1 câu hỏi
    if (!this.questionProgress) {
      this.questionProgress = document.getElementById('question-progress');
      if (!this.questionProgress && this.questionBox && this.questionText) {
        this.questionProgress = document.createElement('div');
        this.questionProgress.id = 'question-progress';
        this.questionProgress.className = 'question-progress hidden';
        this.questionBox.insertBefore(this.questionProgress, this.questionText);
      }
    }

    if (this.questionProgress) {
      if (totalQuestions > 1) {
        this.questionProgress.textContent = `Câu ${this.currentQuestionIndex + 1}/${totalQuestions}`;
        this.questionProgress.classList.remove('hidden');
      } else {
        this.questionProgress.textContent = '';
        this.questionProgress.classList.add('hidden');
      }
    }

    this.questionText.textContent = currentQ.question || '';
    this.hintText.textContent = currentQ.hint || '';

    // Ẩn hint và feedback khi render câu hỏi mới
    this.hintBox.classList.add('hidden');
    this.feedbackMsg.classList.add('hidden');
    this.feedbackMsg.className = 'hidden';

    // Render các nút lựa chọn
    this.optionsList.innerHTML = '';
    const options = Array.isArray(currentQ.options) ? currentQ.options : [];
    options.forEach(option => {
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
    if (!scene) return;

    const questions = (Array.isArray(scene.questions) && scene.questions.length > 0)
      ? scene.questions
      : [{
          question:      scene.question,
          options:       scene.options,
          correctAnswer: scene.correctAnswer,
          hint:          scene.hint
        }];

    const currentQ = questions[this.currentQuestionIndex] || {};
    const isCorrect = selectedOption === currentQ.correctAnswer;

    if (isCorrect) {
      // ── Đáp án ĐÚNG ──
      btnEl.classList.add('is-correct');

      // Disable toàn bộ nút lựa chọn
      this.optionsList.querySelectorAll('.option-btn').forEach(b => {
        b.disabled = true;
        b.style.cursor = 'default';
      });

      // Ẩn hint nếu đang hiện
      this.hintBox.classList.add('hidden');

      const hasNextQuestion = this.currentQuestionIndex + 1 < questions.length;

      if (hasNextQuestion) {
        // Còn câu hỏi tiếp theo trong cùng kỷ niệm
        this.feedbackMsg.textContent = '✓ Chính xác! Câu tiếp theo...';
        this.feedbackMsg.className = 'success';
        this.feedbackMsg.classList.remove('hidden');

        // Hiện câu hỏi kế tiếp sau 800ms
        setTimeout(() => {
          this.currentQuestionIndex++;
          this.renderScene();
        }, 800);
      } else {
        // Đã hoàn thành tất cả câu hỏi trong kỷ niệm này
        this.isSceneUnlocked = true;

        this.feedbackMsg.textContent = '✓ Chính xác rồi! Hành trình tiếp tục...';
        this.feedbackMsg.className = 'success';
        this.feedbackMsg.classList.remove('hidden');

        // Đợi animation xong rồi unlock sang kỷ niệm tiếp theo
        setTimeout(() => this.unlockNextScene(), 1200);
      }

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

      // Hiện hint của câu hỏi hiện tại
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
      const currentQuestions = (Array.isArray(scene.questions) && scene.questions.length > 0)
        ? scene.questions
        : [{ question: scene.question, hint: scene.hint }];
      const curQ = currentQuestions[this.currentQuestionIndex] || currentQuestions[0];
      if (curQ && curQ.question && this.questionText) {
        this.questionText.textContent = curQ.question;
      }
      if (curQ && curQ.hint && this.hintText) {
        this.hintText.textContent = curQ.hint;
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
      if (nextBtn && this.isSceneUnlocked) {
        // Đã trả lời đúng toàn bộ câu hỏi và mở khoá: gọi nút next-scene-btn để sang scene kế tiếp
        nextBtn.click();
      } else {
        // Chưa trả lời đúng hết tất cả câu hỏi: rung nhẹ cảnh báo (không cho phép skip câu hỏi)
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
  // ĐIỀU HƯỚNG 3 TAB CỐ ĐỊNH ĐÁY (BOTTOM NAVIGATION - Phase 1)
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo thanh điều hướng 3 tab cố định ở đáy màn hình
   */
  initBottomNav() {
    this.activeTab = 'journey';
    this.tabPanels = {
      journey: document.getElementById('tab-journey'),
      gallery: document.getElementById('tab-gallery'),
      notes:   document.getElementById('tab-notes')
    };
    this.bottomNavItems = document.querySelectorAll('.bottom-nav-item');

    this.bottomNavItems.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        if (targetTab) {
          this.switchTab(targetTab);
        }
      });
    });
  }

  /**
   * Chuyển đổi qua lại giữa các tab (ẩn/hiện qua class .hidden, không unmount/remount DOM)
   * Giúp giữ nguyên 100% state hiện tại của feed khi người dùng rời đi và quay lại tab Hành trình.
   * @param {'journey' | 'gallery' | 'notes'} tabName
   */
  switchTab(tabName) {
    if (!this.tabPanels[tabName] || this.activeTab === tabName) return;

    this.activeTab = tabName;

    // 1. Cập nhật hiển thị của các tab wrapper
    Object.keys(this.tabPanels).forEach(key => {
      const panel = this.tabPanels[key];
      if (panel) {
        if (key === tabName) {
          panel.classList.remove('hidden');
          panel.classList.add('active');
        } else {
          panel.classList.add('hidden');
          panel.classList.remove('active');
        }
      }
    });

    // 2. Cập nhật trạng thái active và aria-selected của các nút nav
    this.bottomNavItems.forEach(btn => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      }
    });
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ ALBUM ẢNH CHUNG (TAB GALLERY - Phase 2)
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo các tham chiếu DOM và sự kiện cho Tab Gallery
   */
  initGallery() {
    this.galleryItems = [];

    // Tham chiếu DOM gallery
    this.galleryGrid           = document.getElementById('gallery-grid');
    this.galleryEmpty          = document.getElementById('gallery-empty');
    this.galleryAddBtn         = document.getElementById('gallery-add-btn');

    // Tham chiếu Modal Thêm ảnh
    this.addPhotoModal         = document.getElementById('add-photo-modal');
    this.addPhotoForm          = document.getElementById('add-photo-form');
    this.addPhotoCloseX        = document.getElementById('add-photo-close-x');
    this.addPhotoCancelBtn     = document.getElementById('add-photo-cancel-btn');
    this.addPhotoSaveBtn       = document.getElementById('add-photo-save-btn');
    this.addPhotoErrorMsg      = document.getElementById('add-photo-error-msg');
    this.photoUrlInput         = document.getElementById('photo-url-input');
    this.photoCaptionInput     = document.getElementById('photo-caption-input');
    this.photoPreviewContainer = document.getElementById('photo-preview-container');
    this.photoPreviewImg       = document.getElementById('photo-preview-img');

    // 1. Lắng nghe real-time event cập nhật gallery từ Firestore Bridge
    window.addEventListener('lj:galleryUpdated', (e) => {
      this.galleryItems = Array.isArray(e.detail?.items) ? e.detail.items : [];
      this.renderGallery();
    });

    // 2. Sự kiện mở/đóng modal thêm ảnh
    if (this.galleryAddBtn) {
      this.galleryAddBtn.addEventListener('click', () => this.openAddPhotoModal());
    }

    if (this.addPhotoCloseX) {
      this.addPhotoCloseX.addEventListener('click', () => this.closeAddPhotoModal());
    }

    if (this.addPhotoCancelBtn) {
      this.addPhotoCancelBtn.addEventListener('click', () => this.closeAddPhotoModal());
    }

    if (this.addPhotoModal) {
      this.addPhotoModal.addEventListener('click', (e) => {
        if (e.target === this.addPhotoModal) this.closeAddPhotoModal();
      });
    }

    if (this.addPhotoForm) {
      this.addPhotoForm.addEventListener('submit', (e) => this.saveNewPhoto(e));
    }

    // 3. Live preview khi dán URL ảnh
    if (this.photoUrlInput) {
      let debounceTimer = null;
      this.photoUrlInput.addEventListener('input', () => {
        this.hideAddPhotoError();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const url = this.photoUrlInput.value.trim();
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            if (this.photoPreviewImg && this.photoPreviewContainer) {
              this.photoPreviewImg.src = url;
              this.photoPreviewContainer.classList.remove('hidden');
              this.photoPreviewImg.onerror = () => {
                if (this.photoPreviewContainer) this.photoPreviewContainer.classList.add('hidden');
              };
            }
          } else {
            if (this.photoPreviewContainer) this.photoPreviewContainer.classList.add('hidden');
          }
        }, 300);
      });
    }

    // Cập nhật trạng thái hiển thị nút thêm ảnh theo edit mode hiện tại
    if (this.galleryAddBtn && this.isEditMode) {
      this.galleryAddBtn.classList.remove('hidden');
    }

    // Render ban đầu
    this.renderGallery();
  }

  /**
   * Render danh sách ảnh trong gallery ra DOM
   */
  renderGallery() {
    if (!this.galleryGrid) return;
    this.galleryGrid.innerHTML = '';

    if (!this.galleryItems || this.galleryItems.length === 0) {
      if (this.galleryEmpty) this.galleryEmpty.classList.remove('hidden');
      this.galleryGrid.classList.add('hidden');
      return;
    }

    if (this.galleryEmpty) this.galleryEmpty.classList.add('hidden');
    this.galleryGrid.classList.remove('hidden');

    this.galleryItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      card.dataset.id = item.id;

      // Khung chứa ảnh
      const wrapper = document.createElement('div');
      wrapper.className = 'gallery-img-wrapper';

      const img = document.createElement('img');
      img.className = 'gallery-img';
      img.src = item.imageUrl || '';
      img.alt = item.caption || 'Ảnh kỷ niệm';
      img.loading = 'lazy';

      // Fallback khi ảnh bị lỗi link / 404
      const fallback = document.createElement('div');
      fallback.className = 'gallery-img-fallback hidden';
      fallback.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"></line>
          <path d="M21 21H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l2 3h10a2 2 0 0 1 2 2v11"></path>
          <circle cx="8.5" cy="10.5" r="1.5"></circle>
        </svg>
        <span>Không tải được ảnh</span>
      `;

      img.onerror = () => {
        img.classList.add('hidden');
        fallback.classList.remove('hidden');
      };

      wrapper.appendChild(img);
      wrapper.appendChild(fallback);

      // Nút xoá (chỉ hiển thị khi isEditMode qua CSS)
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'gallery-delete-btn';
      deleteBtn.title = 'Xoá ảnh này khỏi album';
      deleteBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePhoto(item.id);
      });

      wrapper.appendChild(deleteBtn);
      card.appendChild(wrapper);

      // Chú thích ảnh (nếu có)
      if (item.caption && item.caption.trim()) {
        const captionEl = document.createElement('div');
        captionEl.className = 'gallery-caption';
        captionEl.textContent = item.caption.trim();
        card.appendChild(captionEl);
      }

      this.galleryGrid.appendChild(card);
    });
  }

  /**
   * Mở modal thêm ảnh mới
   */
  openAddPhotoModal() {
    if (!this.addPhotoModal) return;
    if (this.photoUrlInput) this.photoUrlInput.value = '';
    if (this.photoCaptionInput) this.photoCaptionInput.value = '';
    if (this.photoPreviewContainer) this.photoPreviewContainer.classList.add('hidden');
    if (this.photoPreviewImg) this.photoPreviewImg.src = '';
    this.hideAddPhotoError();

    this.addPhotoModal.classList.remove('hidden');
    setTimeout(() => {
      if (this.photoUrlInput) this.photoUrlInput.focus();
    }, 150);
  }

  /**
   * Đóng modal thêm ảnh mới
   */
  closeAddPhotoModal() {
    if (!this.addPhotoModal) return;
    this.addPhotoModal.classList.add('hidden');
    this.hideAddPhotoError();
  }

  showAddPhotoError(msg) {
    if (this.addPhotoErrorMsg) {
      this.addPhotoErrorMsg.textContent = msg;
      this.addPhotoErrorMsg.classList.remove('hidden');
    }
  }

  hideAddPhotoError() {
    if (this.addPhotoErrorMsg) {
      this.addPhotoErrorMsg.textContent = '';
      this.addPhotoErrorMsg.classList.add('hidden');
    }
  }

  /**
   * Lưu ảnh mới vào Firestore collection "gallery"
   * @param {Event} e
   */
  async saveNewPhoto(e) {
    e.preventDefault();
    this.hideAddPhotoError();

    const url = this.photoUrlInput ? this.photoUrlInput.value.trim() : '';
    const caption = this.photoCaptionInput ? this.photoCaptionInput.value.trim() : '';

    if (!url) {
      this.showAddPhotoError('Vui lòng dán link ảnh trực tuyến.');
      if (this.photoUrlInput) this.photoUrlInput.focus();
      return;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      this.showAddPhotoError('Link ảnh phải bắt đầu bằng http:// hoặc https://.');
      if (this.photoUrlInput) this.photoUrlInput.focus();
      return;
    }

    const payload = {
      imageUrl: url,
      caption: caption || '',
      createdAt: Date.now(),
      pin: window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : ''
    };

    if (this.addPhotoSaveBtn) {
      this.addPhotoSaveBtn.disabled = true;
      this.addPhotoSaveBtn.textContent = 'Đang lưu...';
    }

    try {
      if (typeof window.__LJ_ADD_GALLERY_ITEM !== 'function') {
        throw new Error('Chức năng lưu ảnh chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng.');
      }

      await window.__LJ_ADD_GALLERY_ITEM(payload);
      console.log('[LoveJourney] Đã thêm ảnh mới vào gallery thành công.');
      this.closeAddPhotoModal();
    } catch (err) {
      console.warn('[LoveJourney] Lỗi thêm ảnh gallery:', err);
      let errorText = 'Lỗi lưu ảnh: ';
      if (err && err.code === 'permission-denied') {
        errorText += 'Không có quyền ghi (mã PIN không khớp Security Rules).';
      } else {
        errorText += (err.message || 'Vui lòng thử lại sau.');
      }
      this.showAddPhotoError(errorText);
    } finally {
      if (this.addPhotoSaveBtn) {
        this.addPhotoSaveBtn.disabled = false;
        this.addPhotoSaveBtn.textContent = 'Thêm';
      }
    }
  }

  /**
   * Xoá ảnh khỏi Firestore collection "gallery"
   * @param {string} id
   */
  async deletePhoto(id) {
    if (!id) return;
    if (!confirm('Bạn có chắc chắn muốn xoá bức ảnh này khỏi album ảnh chung?')) return;

    try {
      if (typeof window.__LJ_DELETE_GALLERY_ITEM !== 'function') {
        throw new Error('Chức năng xoá ảnh chưa sẵn sàng.');
      }

      await window.__LJ_DELETE_GALLERY_ITEM(id);
      console.log(`[LoveJourney] Đã xoá ảnh ${id} thành công.`);
    } catch (err) {
      console.warn('[LoveJourney] Lỗi xoá ảnh gallery:', err);
      let errorText = 'Không thể xoá ảnh: ';
      if (err && err.code === 'permission-denied') {
        errorText += 'Không có quyền xoá (mã PIN không khớp Security Rules).';
      } else {
        errorText += (err.message || 'Vui lòng thử lại sau.');
      }
      alert(errorText);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ GHI CHÚ VỀ 2 NGƯỜI (TAB NOTES / PROFILES - Phase 3)
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo các tham chiếu DOM và sự kiện cho Tab Notes / Profiles
   */
  initProfiles() {
    this.profilesData = { person1: null, person2: null };
    this.currentViewingPersonId = null;

    // Tham chiếu thẻ ngoài Tab Notes
    this.profileCardPerson1 = document.getElementById('profile-card-person1');
    this.profileCardPerson2 = document.getElementById('profile-card-person2');

    // Tham chiếu Modal Xem Chi Tiết
    this.profileViewModal     = document.getElementById('profile-view-modal');
    this.profileViewModalTitle= document.getElementById('profile-view-modal-title');
    this.profileViewCloseX    = document.getElementById('profile-view-close-x');
    this.profileViewCloseBtn  = document.getElementById('profile-view-close-btn');
    this.profileViewEditBtn   = document.getElementById('profile-view-edit-btn');
    this.profileViewAvatar    = document.getElementById('profile-view-avatar');
    this.profileViewAvatarFallback = document.getElementById('profile-view-avatar-fallback');
    this.profileViewName      = document.getElementById('profile-view-name');
    this.profileViewBirthday  = document.getElementById('profile-view-birthday');
    this.profileViewPersonality = document.getElementById('profile-view-personality');
    this.profileViewHobbies   = document.getElementById('profile-view-hobbies');
    this.profileViewFood      = document.getElementById('profile-view-food');
    this.profileViewDislikes  = document.getElementById('profile-view-dislikes');
    this.profileViewNote      = document.getElementById('profile-view-note');

    // Tham chiếu Modal Chỉnh Sửa
    this.profileEditModal     = document.getElementById('profile-edit-modal');
    this.profileEditForm      = document.getElementById('profile-edit-form');
    this.profileEditCloseX    = document.getElementById('profile-edit-close-x');
    this.profileEditCancelBtn = document.getElementById('profile-edit-cancel-btn');
    this.profileEditSaveBtn   = document.getElementById('profile-edit-save-btn');
    this.profileEditErrorMsg  = document.getElementById('profile-edit-error-msg');
    this.profileEditPersonId  = document.getElementById('profile-edit-person-id');
    this.profileEditName      = document.getElementById('profile-edit-name');
    this.profileEditAvatarUrl = document.getElementById('profile-edit-avatar-url');
    this.profileEditBirthday  = document.getElementById('profile-edit-birthday');
    this.profileEditNote      = document.getElementById('profile-edit-note');
    this.profileEditPin       = document.getElementById('profile-edit-pin');

    // Cấu hình 4 trường danh sách dạng tags (Phase 3 update)
    this.profileListFields = [
      { key: 'personality', idPrefix: 'personality' },
      { key: 'hobbies', idPrefix: 'hobbies' },
      { key: 'favoriteFood', idPrefix: 'food' },
      { key: 'dislikes', idPrefix: 'dislikes' }
    ];
    this.editingProfileTags = {
      personality: [],
      hobbies: [],
      favoriteFood: [],
      dislikes: []
    };

    // 1. Lắng nghe real-time event từ Firestore Bridge
    window.addEventListener('lj:profilesUpdated', (e) => {
      const profiles = e.detail?.profiles || {};
      this.profilesData = profiles;
      this.renderProfiles();

      // Nếu đang mở modal xem chi tiết, cập nhật lại dữ liệu đang hiển thị
      if (this.currentViewingPersonId && this.profileViewModal && !this.profileViewModal.classList.contains('hidden')) {
        this.openProfileViewModal(this.currentViewingPersonId);
      }
    });

    // 2. Click / Keyboard mở modal xem chi tiết của từng người
    if (this.profileCardPerson1) {
      this.profileCardPerson1.addEventListener('click', () => this.openProfileViewModal('person1'));
      this.profileCardPerson1.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openProfileViewModal('person1');
        }
      });
    }

    if (this.profileCardPerson2) {
      this.profileCardPerson2.addEventListener('click', () => this.openProfileViewModal('person2'));
      this.profileCardPerson2.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openProfileViewModal('person2');
        }
      });
    }

    // 3. Sự kiện modal xem chi tiết
    if (this.profileViewCloseX) {
      this.profileViewCloseX.addEventListener('click', () => this.closeProfileViewModal());
    }
    if (this.profileViewCloseBtn) {
      this.profileViewCloseBtn.addEventListener('click', () => this.closeProfileViewModal());
    }
    if (this.profileViewEditBtn) {
      this.profileViewEditBtn.addEventListener('click', () => {
        if (this.currentViewingPersonId) {
          this.closeProfileViewModal();
          this.openProfileEditModal(this.currentViewingPersonId);
        }
      });
    }
    if (this.profileViewModal) {
      this.profileViewModal.addEventListener('click', (e) => {
        if (e.target === this.profileViewModal) {
          this.closeProfileViewModal();
        }
      });
    }

    // 4. Sự kiện modal chỉnh sửa (chỉ đóng bằng nút X hoặc nút Huỷ, không đóng khi click ra ngoài hay bấm Escape)
    if (this.profileEditCloseX) {
      this.profileEditCloseX.addEventListener('click', () => this.closeProfileEditModal());
    }
    if (this.profileEditCancelBtn) {
      this.profileEditCancelBtn.addEventListener('click', () => this.closeProfileEditModal());
    }
    if (this.profileEditForm) {
      this.profileEditForm.addEventListener('submit', (e) => this.saveProfileEdit(e));
    }

    // 5. Sự kiện thêm tag cho 4 trường danh sách (nút Thêm & phím Enter)
    this.profileListFields.forEach(({ key, idPrefix }) => {
      const addBtn = document.getElementById(`profile-edit-${idPrefix}-add-btn`);
      const input = document.getElementById(`profile-edit-${idPrefix}-input`);

      if (addBtn) {
        addBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.addEditProfileTag(key, idPrefix);
        });
      }

      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.addEditProfileTag(key, idPrefix);
          }
        });
      }
    });

    // Đóng modal xem chi tiết khi nhấn Escape (chỉ áp dụng cho modal xem, không đóng modal sửa đang nhập liệu)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.profileViewModal && !this.profileViewModal.classList.contains('hidden')) {
          this.closeProfileViewModal();
        }
      }
    });

    // Render ban đầu với placeholder
    this.renderProfiles();
  }

  /**
   * Thêm tag vào danh sách đang chỉnh sửa của field
   * @param {'personality' | 'hobbies' | 'favoriteFood' | 'dislikes'} key 
   * @param {string} idPrefix 
   */
  addEditProfileTag(key, idPrefix) {
    const input = document.getElementById(`profile-edit-${idPrefix}-input`);
    if (!input) return;
    const val = input.value.trim();
    if (!val) return; // Chặn thêm item rỗng

    if (!this.editingProfileTags[key]) {
      this.editingProfileTags[key] = [];
    }
    this.editingProfileTags[key].push(val);
    input.value = '';
    this.renderEditProfileTags(key, idPrefix);
    input.focus();
  }

  /**
   * Xoá tag tại vị trí index khỏi field
   * @param {'personality' | 'hobbies' | 'favoriteFood' | 'dislikes'} key 
   * @param {string} idPrefix 
   * @param {number} index 
   */
  removeEditProfileTag(key, idPrefix, index) {
    if (!this.editingProfileTags[key]) return;
    this.editingProfileTags[key].splice(index, 1);
    this.renderEditProfileTags(key, idPrefix);
  }

  /**
   * Render các tag/chip đang có của 1 field trong modal chỉnh sửa
   * @param {'personality' | 'hobbies' | 'favoriteFood' | 'dislikes'} key 
   * @param {string} idPrefix 
   */
  renderEditProfileTags(key, idPrefix) {
    const container = document.getElementById(`profile-edit-${idPrefix}-tags`);
    if (!container) return;
    container.innerHTML = '';

    const items = this.editingProfileTags[key] || [];
    items.forEach((item, index) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag-item';

      const textEl = document.createElement('span');
      textEl.className = 'tag-item-text';
      textEl.textContent = item;
      tagEl.appendChild(textEl);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'tag-item-remove';
      removeBtn.setAttribute('aria-label', `Xoá ${item}`);
      removeBtn.innerHTML = '&times;';
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.removeEditProfileTag(key, idPrefix, index);
      });
      tagEl.appendChild(removeBtn);

      container.appendChild(tagEl);
    });
  }

  /**
   * Cập nhật thông tin trên 2 thẻ hồ sơ ở Tab Notes
   */
  renderProfiles() {
    this._renderProfileCard('person1', 'Người thương 1');
    this._renderProfileCard('person2', 'Người thương 2');
  }

  /**
   * Helper render từng thẻ hồ sơ
   * @param {'person1' | 'person2'} personId
   * @param {string} fallbackDefaultName
   */
  _renderProfileCard(personId, fallbackDefaultName) {
    const p = (this.profilesData && this.profilesData[personId]) || {};
    const nameEl = document.getElementById(`profile-card-name-${personId}`);
    const metaEl = document.getElementById(`profile-card-meta-${personId}`);
    const avatarEl = document.getElementById(`profile-card-avatar-${personId}`);
    const fallbackEl = document.getElementById(`profile-card-avatar-fallback-${personId}`);

    const displayName = (p.name && p.name.trim()) ? p.name.trim() : fallbackDefaultName;
    if (nameEl) nameEl.textContent = displayName;

    if (metaEl) {
      if (p.birthday && p.birthday.trim()) {
        metaEl.textContent = `🎂 Sinh nhật: ${p.birthday.trim()}`;
      } else {
        metaEl.textContent = 'Chạm để xem chi tiết';
      }
    }

    if (avatarEl && fallbackEl) {
      const avatarUrl = p.avatarUrl ? p.avatarUrl.trim() : '';
      if (avatarUrl) {
        avatarEl.src = avatarUrl;
        avatarEl.alt = displayName;
        avatarEl.classList.remove('hidden');
        fallbackEl.classList.add('hidden');
        avatarEl.onerror = () => {
          avatarEl.classList.add('hidden');
          fallbackEl.classList.remove('hidden');
        };
      } else {
        avatarEl.src = '';
        avatarEl.classList.add('hidden');
        fallbackEl.classList.remove('hidden');
        fallbackEl.textContent = displayName.charAt(0).toUpperCase();
      }
    }
  }

  /**
   * Mở modal xem chi tiết hồ sơ
   * @param {'person1' | 'person2'} personId
   */
  openProfileViewModal(personId) {
    if (!this.profileViewModal) return;
    this.currentViewingPersonId = personId;

    const p = (this.profilesData && this.profilesData[personId]) || {};
    const defaultName = personId === 'person1' ? 'Người thương 1' : 'Người thương 2';
    const displayName = (p.name && p.name.trim()) ? p.name.trim() : defaultName;

    // Tên & Tiêu đề
    if (this.profileViewModalTitle) {
      this.profileViewModalTitle.textContent = `Hồ sơ ${displayName}`;
    }
    if (this.profileViewName) {
      this.profileViewName.textContent = displayName;
    }

    // Avatar
    if (this.profileViewAvatar && this.profileViewAvatarFallback) {
      const avatarUrl = p.avatarUrl ? p.avatarUrl.trim() : '';
      if (avatarUrl) {
        this.profileViewAvatar.src = avatarUrl;
        this.profileViewAvatar.alt = displayName;
        this.profileViewAvatar.classList.remove('hidden');
        this.profileViewAvatarFallback.classList.add('hidden');
        this.profileViewAvatar.onerror = () => {
          this.profileViewAvatar.classList.add('hidden');
          this.profileViewAvatarFallback.classList.remove('hidden');
        };
      } else {
        this.profileViewAvatar.src = '';
        this.profileViewAvatar.classList.add('hidden');
        this.profileViewAvatarFallback.classList.remove('hidden');
        this.profileViewAvatarFallback.textContent = displayName.charAt(0).toUpperCase();
      }
    }

    // Sinh nhật
    if (this.profileViewBirthday) {
      if (p.birthday && p.birthday.trim()) {
        this.profileViewBirthday.textContent = p.birthday.trim();
        this.profileViewBirthday.classList.remove('is-empty');
      } else {
        this.profileViewBirthday.textContent = 'Chưa cập nhật';
        this.profileViewBirthday.classList.add('is-empty');
      }
    }

    // Helper render các trường chi tiết dạng danh sách tags (hiển thị 'Chưa cập nhật' in nghiêng nếu rỗng)
    const setListFieldValue = (el, rawVal) => {
      if (!el) return;
      let items = [];
      if (Array.isArray(rawVal)) {
        items = rawVal.map(item => String(item).trim()).filter(Boolean);
      } else if (typeof rawVal === 'string' && rawVal.trim()) {
        items = [rawVal.trim()];
      }

      if (items.length > 0) {
        el.className = 'profile-info-val';
        el.innerHTML = '';
        const tagsWrapper = document.createElement('div');
        tagsWrapper.className = 'profile-tags-view';
        items.forEach(item => {
          const chip = document.createElement('span');
          chip.className = 'profile-tag-view';
          chip.textContent = item;
          tagsWrapper.appendChild(chip);
        });
        el.appendChild(tagsWrapper);
      } else {
        el.className = 'profile-info-val is-empty';
        el.textContent = 'Chưa cập nhật';
      }
    };

    setListFieldValue(this.profileViewPersonality, p.personality);
    setListFieldValue(this.profileViewHobbies, p.hobbies);
    setListFieldValue(this.profileViewFood, p.favoriteFood);
    setListFieldValue(this.profileViewDislikes, p.dislikes);

    // Lời nhắn gửi (đặc biệt)
    if (this.profileViewNote) {
      if (p.noteForOther && String(p.noteForOther).trim()) {
        this.profileViewNote.textContent = `“${String(p.noteForOther).trim()}”`;
        this.profileViewNote.classList.remove('is-empty');
      } else {
        this.profileViewNote.textContent = 'Chưa cập nhật';
        this.profileViewNote.classList.add('is-empty');
      }
    }

    this.profileViewModal.classList.remove('hidden');
  }

  /**
   * Đóng modal xem chi tiết hồ sơ
   */
  closeProfileViewModal() {
    if (!this.profileViewModal) return;
    this.profileViewModal.classList.add('hidden');
  }

  /**
   * Mở modal chỉnh sửa hồ sơ
   * @param {'person1' | 'person2'} personId
   */
  openProfileEditModal(personId) {
    if (!this.profileEditModal) return;
    this.currentViewingPersonId = personId;

    const p = (this.profilesData && this.profilesData[personId]) || {};
    const defaultName = personId === 'person1' ? 'Người thương 1' : 'Người thương 2';

    if (this.profileEditPersonId) this.profileEditPersonId.value = personId;
    if (this.profileEditName) this.profileEditName.value = p.name || (p.name === '' ? '' : (p.name ? p.name : defaultName));
    if (this.profileEditAvatarUrl) this.profileEditAvatarUrl.value = p.avatarUrl || '';
    if (this.profileEditBirthday) this.profileEditBirthday.value = p.birthday || '';
    if (this.profileEditNote) this.profileEditNote.value = p.noteForOther || '';
    if (this.profileEditPin) {
      this.profileEditPin.value = window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : '';
    }

    // Khởi tạo các tag cho 4 trường danh sách (tự bọc thành mảng 1 phần tử khi gặp string)
    this.editingProfileTags = {};
    this.profileListFields.forEach(({ key, idPrefix }) => {
      const rawVal = p[key];
      let arr = [];
      if (Array.isArray(rawVal)) {
        arr = rawVal.map(item => String(item).trim()).filter(Boolean);
      } else if (typeof rawVal === 'string' && rawVal.trim()) {
        arr = [rawVal.trim()];
      }
      this.editingProfileTags[key] = arr;

      const input = document.getElementById(`profile-edit-${idPrefix}-input`);
      if (input) input.value = '';

      this.renderEditProfileTags(key, idPrefix);
    });

    this.hideProfileEditError();
    this.profileEditModal.classList.remove('hidden');
    setTimeout(() => {
      if (this.profileEditName) this.profileEditName.focus();
    }, 150);
  }

  /**
   * Đóng modal chỉnh sửa hồ sơ
   */
  closeProfileEditModal() {
    if (!this.profileEditModal) return;
    this.profileEditModal.classList.add('hidden');
    this.hideProfileEditError();
  }

  showProfileEditError(msg) {
    if (this.profileEditErrorMsg) {
      this.profileEditErrorMsg.textContent = msg;
      this.profileEditErrorMsg.classList.remove('hidden');
    }
  }

  hideProfileEditError() {
    if (this.profileEditErrorMsg) {
      this.profileEditErrorMsg.textContent = '';
      this.profileEditErrorMsg.classList.add('hidden');
    }
  }

  /**
   * Lưu thay đổi hồ sơ vào Firestore collection "profiles"
   * @param {Event} e
   */
  async saveProfileEdit(e) {
    e.preventDefault();
    this.hideProfileEditError();

    const personId = this.profileEditPersonId ? this.profileEditPersonId.value.trim() : '';
    if (!personId || (personId !== 'person1' && personId !== 'person2')) {
      this.showProfileEditError('Hồ sơ không hợp lệ.');
      return;
    }

    const name = this.profileEditName ? this.profileEditName.value.trim() : '';
    if (!name) {
      this.showProfileEditError('Vui lòng nhập Tên / Biệt danh.');
      if (this.profileEditName) this.profileEditName.focus();
      return;
    }

    const avatarUrl = this.profileEditAvatarUrl ? this.profileEditAvatarUrl.value.trim() : '';
    if (avatarUrl && !avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
      this.showProfileEditError('Link ảnh đại diện phải bắt đầu bằng http:// hoặc https://.');
      if (this.profileEditAvatarUrl) this.profileEditAvatarUrl.focus();
      return;
    }

    const enteredPin = this.profileEditPin ? this.profileEditPin.value.trim() : '';
    const configuredPin = window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : '';
    if (!enteredPin) {
      this.showProfileEditError('Vui lòng nhập mã PIN xác nhận (4 số).');
      if (this.profileEditPin) this.profileEditPin.focus();
      return;
    }

    if (configuredPin && enteredPin !== configuredPin) {
      this.showProfileEditError('Mã PIN không chính xác. Vui lòng thử lại.');
      if (this.profileEditPin) this.profileEditPin.focus();
      return;
    }

    // Thu hoạch nốt nội dung đang gõ dở trong các ô input tag (nếu có)
    this.profileListFields.forEach(({ key, idPrefix }) => {
      const input = document.getElementById(`profile-edit-${idPrefix}-input`);
      if (input && input.value.trim()) {
        const val = input.value.trim();
        if (!this.editingProfileTags[key]) this.editingProfileTags[key] = [];
        this.editingProfileTags[key].push(val);
        input.value = '';
      }
    });

    const payload = {
      name: name,
      avatarUrl: avatarUrl || '',
      birthday: this.profileEditBirthday ? this.profileEditBirthday.value.trim() : '',
      personality: this.editingProfileTags.personality || [],
      hobbies: this.editingProfileTags.hobbies || [],
      favoriteFood: this.editingProfileTags.favoriteFood || [],
      dislikes: this.editingProfileTags.dislikes || [],
      noteForOther: this.profileEditNote ? this.profileEditNote.value.trim() : '',
      pin: enteredPin,
      updatedAt: Date.now()
    };

    if (this.profileEditSaveBtn) {
      this.profileEditSaveBtn.disabled = true;
      this.profileEditSaveBtn.textContent = 'Đang lưu...';
    }

    try {
      if (typeof window.__LJ_UPDATE_PROFILE !== 'function') {
        throw new Error('Chức năng lưu hồ sơ chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng.');
      }

      await window.__LJ_UPDATE_PROFILE(personId, payload);
      console.log(`[LoveJourney] Đã cập nhật hồ sơ ${personId} thành công.`);
      this.closeProfileEditModal();

      // Mở lại modal xem chi tiết với dữ liệu mới
      this.openProfileViewModal(personId);
    } catch (err) {
      console.warn('[LoveJourney] Lỗi cập nhật hồ sơ:', err);
      let errorText = 'Lỗi lưu hồ sơ: ';
      if (err && err.code === 'permission-denied') {
        errorText += 'Không có quyền ghi (mã PIN không khớp Security Rules).';
      } else {
        errorText += (err.message || 'Vui lòng thử lại sau.');
      }
      this.showProfileEditError(errorText);
    } finally {
      if (this.profileEditSaveBtn) {
        this.profileEditSaveBtn.disabled = false;
        this.profileEditSaveBtn.textContent = 'Lưu thay đổi';
      }
    }
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
      if (this.galleryAddBtn) {
        this.galleryAddBtn.classList.remove('hidden');
      }
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
      if (this.galleryAddBtn) {
        this.galleryAddBtn.classList.add('hidden');
      }
      this.closeAddPhotoModal();
      this.closeProfileEditModal();
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
   * Khởi tạo tham chiếu và sự kiện cho modal chỉnh sửa scene (Phase 4)
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
    this.editEpilogueMsg   = document.getElementById('edit-epilogue-message');
    this.editMediaUrl      = document.getElementById('edit-media-url');

    // Quản lý danh sách câu hỏi động
    this.editQuestionsContainer = document.getElementById('edit-questions-container');
    this.editAddQuestionBtn     = document.getElementById('edit-add-question-btn');
    this.editQuestionsCount     = document.getElementById('edit-questions-count');
    this.editingQuestions       = [];

    if (this.editSceneCloseX) {
      this.editSceneCloseX.addEventListener('click', () => this.closeEditSceneModal());
    }

    if (this.editSceneCancelBtn) {
      this.editSceneCancelBtn.addEventListener('click', () => this.closeEditSceneModal());
    }

    if (this.editSceneForm) {
      this.editSceneForm.addEventListener('submit', (e) => this.saveSceneEdit(e));
    }

    if (this.editAddQuestionBtn) {
      this.editAddQuestionBtn.addEventListener('click', () => this.addEditingQuestion());
    }
  }

  /**
   * Thu thập dữ liệu đang gõ dở từ các thẻ câu hỏi trong DOM vào mảng target (dùng chung cho cả 2 modal)
   * @param {HTMLElement} container
   * @param {Array<Object>} targetArray
   */
  _harvestQuestions(container, targetArray) {
    if (!container || !targetArray) return;
    const cards = container.querySelectorAll('.edit-question-card');
    cards.forEach((card, idx) => {
      if (!targetArray[idx]) {
        targetArray[idx] = { question: '', options: ['', '', '', ''], correctAnswer: '', hint: '' };
      }
      const qInput = card.querySelector('.edit-q-input-question');
      const optInputs = card.querySelectorAll('.edit-q-option');
      const correctSelect = card.querySelector('.edit-q-correct-select');
      const hintInput = card.querySelector('.edit-q-input-hint');

      if (qInput) targetArray[idx].question = qInput.value;
      if (optInputs) {
        targetArray[idx].options = Array.from(optInputs).map(inp => inp.value);
      }
      if (correctSelect) targetArray[idx].correctAnswer = correctSelect.value;
      if (hintInput) targetArray[idx].hint = hintInput.value;
    });
  }

  /**
   * Render danh sách các thẻ câu hỏi vào container chỉ định (dùng chung cho cả 2 modal)
   * @param {HTMLElement} container
   * @param {Array<Object>} questionsArray
   * @param {HTMLElement|null} countBadgeEl
   * @param {Function} onUpdate
   */
  _renderQuestionCards(container, questionsArray, countBadgeEl, onUpdate) {
    if (!container) return;
    container.innerHTML = '';

    const total = questionsArray.length;
    if (countBadgeEl) {
      countBadgeEl.textContent = `${total} câu`;
    }

    const letters = ['A', 'B', 'C', 'D'];

    questionsArray.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = 'edit-question-card';
      card.dataset.questionIndex = idx;

      // Card Header: Tiêu đề + Nút Lên, Xuống, Xoá
      const header = document.createElement('div');
      header.className = 'edit-q-card-header';

      const title = document.createElement('span');
      title.className = 'edit-q-card-title';
      title.textContent = `Câu hỏi #${idx + 1}`;
      header.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'edit-q-card-actions';

      // Nút Di chuyển Lên
      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'btn-q-action btn-q-up';
      btnUp.title = 'Di chuyển câu hỏi này lên trên';
      btnUp.innerHTML = '▲';
      btnUp.disabled = idx === 0;
      btnUp.addEventListener('click', () => {
        this._harvestQuestions(container, questionsArray);
        const temp = questionsArray[idx];
        questionsArray[idx] = questionsArray[idx - 1];
        questionsArray[idx - 1] = temp;
        onUpdate();
      });
      actions.appendChild(btnUp);

      // Nút Di chuyển Xuống
      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'btn-q-action btn-q-down';
      btnDown.title = 'Di chuyển câu hỏi này xuống dưới';
      btnDown.innerHTML = '▼';
      btnDown.disabled = idx === total - 1;
      btnDown.addEventListener('click', () => {
        this._harvestQuestions(container, questionsArray);
        const temp = questionsArray[idx];
        questionsArray[idx] = questionsArray[idx + 1];
        questionsArray[idx + 1] = temp;
        onUpdate();
      });
      actions.appendChild(btnDown);

      // Nút Xoá
      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn-q-action btn-q-delete';
      btnDelete.title = 'Xoá câu hỏi này';
      btnDelete.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      btnDelete.addEventListener('click', () => {
        this._harvestQuestions(container, questionsArray);
        if (questionsArray.length <= 1) {
          alert('Mỗi kỷ niệm cần tối thiểu 1 câu hỏi, không thể xoá hết.');
          return;
        }
        if (confirm(`Bạn có chắc chắn muốn xoá Câu hỏi #${idx + 1}?`)) {
          questionsArray.splice(idx, 1);
          onUpdate();
        }
      });
      actions.appendChild(btnDelete);

      header.appendChild(actions);
      card.appendChild(header);

      // 1. Nội dung câu hỏi
      const qGroup = document.createElement('div');
      qGroup.className = 'form-group';
      const qLabel = document.createElement('label');
      qLabel.innerHTML = `Nội dung câu hỏi <span class="req">*</span>`;
      const qInput = document.createElement('input');
      qInput.type = 'text';
      qInput.className = 'edit-q-input-question';
      qInput.placeholder = 'Nhập câu hỏi trắc nghiệm...';
      qInput.value = q.question || '';
      qGroup.appendChild(qLabel);
      qGroup.appendChild(qInput);
      card.appendChild(qGroup);

      // 2. 4 Lựa chọn trắc nghiệm
      const optGroup = document.createElement('div');
      optGroup.className = 'form-group';
      const optLabel = document.createElement('label');
      optLabel.innerHTML = `4 Lựa chọn trắc nghiệm <span class="req">*</span>`;
      optGroup.appendChild(optLabel);

      const optGrid = document.createElement('div');
      optGrid.className = 'options-inputs-grid';

      const optInputs = [];
      const opts = Array.isArray(q.options) ? q.options : ['', '', '', ''];
      for (let i = 0; i < 4; i++) {
        const optInput = document.createElement('input');
        optInput.type = 'text';
        optInput.className = 'edit-q-option';
        optInput.dataset.optIdx = i;
        optInput.placeholder = `Lựa chọn ${letters[i]}...`;
        optInput.value = opts[i] || '';
        optInputs.push(optInput);
        optGrid.appendChild(optInput);
      }
      optGroup.appendChild(optGrid);
      card.appendChild(optGroup);

      // 3. Đáp án đúng (dropdown tự đồng bộ từ 4 options)
      const correctGroup = document.createElement('div');
      correctGroup.className = 'form-group';
      const correctLabel = document.createElement('label');
      correctLabel.innerHTML = `Đáp án đúng <span class="req">*</span>`;
      const correctSelect = document.createElement('select');
      correctSelect.className = 'edit-q-correct-select';
      correctGroup.appendChild(correctLabel);
      correctGroup.appendChild(correctSelect);
      card.appendChild(correctGroup);

      const syncCardSelect = (preserve = null) => {
        const valToKeep = preserve !== null ? preserve : correctSelect.value;
        correctSelect.innerHTML = '<option value="">-- Chọn đáp án đúng từ 4 lựa chọn trên --</option>';
        optInputs.forEach((inp, i) => {
          const v = inp.value.trim();
          if (v) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = `[${letters[i]}] ${v}`;
            if (v === valToKeep) opt.selected = true;
            correctSelect.appendChild(opt);
          }
        });
      };

      optInputs.forEach(inp => {
        inp.addEventListener('input', () => syncCardSelect());
      });

      syncCardSelect(q.correctAnswer || '');

      // 4. Gợi ý khi trả lời sai (Hint)
      const hintGroup = document.createElement('div');
      hintGroup.className = 'form-group';
      const hintLabel = document.createElement('label');
      hintLabel.innerHTML = `Gợi ý khi trả lời sai <span class="req">*</span>`;
      const hintInput = document.createElement('input');
      hintInput.type = 'text';
      hintInput.className = 'edit-q-input-hint';
      hintInput.placeholder = 'Nhập gợi ý khi trả lời sai...';
      hintInput.value = q.hint || '';
      hintGroup.appendChild(hintLabel);
      hintGroup.appendChild(hintInput);
      card.appendChild(hintGroup);

      container.appendChild(card);
    });
  }

  /**
   * Thêm 1 câu hỏi trống mới vào mảng và re-render (dùng chung cho cả 2 modal)
   * @param {HTMLElement} container
   * @param {Array<Object>} questionsArray
   * @param {Function} onUpdate
   */
  _addQuestion(container, questionsArray, onUpdate) {
    this._harvestQuestions(container, questionsArray);
    questionsArray.push({
      question: '',
      options: ['', '', '', ''],
      correctAnswer: '',
      hint: ''
    });
    onUpdate();

    setTimeout(() => {
      if (!container) return;
      const cards = container.querySelectorAll('.edit-question-card');
      const lastCard = cards[cards.length - 1];
      if (lastCard) {
        lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const firstInput = lastCard.querySelector('.edit-q-input-question');
        if (firstInput) firstInput.focus();
      }
    }, 100);
  }

  /**
   * Cuộn và focus vào trường bị lỗi trong thẻ câu hỏi cụ thể (dùng chung cho cả 2 modal)
   * @param {HTMLElement} container
   * @param {number} questionIdx
   * @param {string} fieldType
   */
  _focusQuestionField(container, questionIdx, fieldType) {
    if (!container) return;
    const cards = container.querySelectorAll('.edit-question-card');
    const card = cards[questionIdx];
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    let el;
    if (fieldType === 'question') {
      el = card.querySelector('.edit-q-input-question');
    } else if (fieldType.startsWith('option-')) {
      const optIdx = fieldType.split('-')[1];
      el = card.querySelector(`.edit-q-option[data-opt-idx="${optIdx}"]`);
    } else if (fieldType === 'correctAnswer') {
      el = card.querySelector('.edit-q-correct-select');
    } else if (fieldType === 'hint') {
      el = card.querySelector('.edit-q-input-hint');
    }
    if (el) setTimeout(() => el.focus(), 150);
  }

  /**
   * Validate toàn bộ câu hỏi trong mảng (dùng chung cho cả 2 modal)
   * @param {Array<Object>} questionsArray
   * @param {HTMLElement} container
   * @param {Function} showErrorFn
   * @returns {boolean}
   */
  _validateQuestions(questionsArray, container, showErrorFn) {
    if (!questionsArray || questionsArray.length === 0) {
      showErrorFn('Mỗi kỷ niệm cần tối thiểu 1 câu hỏi.');
      return false;
    }

    const letters = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < questionsArray.length; i++) {
      const q = questionsArray[i];
      const qNum = i + 1;

      if (!q.question || !q.question.trim()) {
        showErrorFn(`Câu hỏi #${qNum}: Vui lòng nhập nội dung câu hỏi.`);
        this._focusQuestionField(container, i, 'question');
        return false;
      }

      for (let j = 0; j < 4; j++) {
        if (!q.options[j] || !q.options[j].trim()) {
          showErrorFn(`Câu hỏi #${qNum}: Vui lòng nhập lựa chọn ${letters[j]}.`);
          this._focusQuestionField(container, i, `option-${j}`);
          return false;
        }
      }

      if (!q.correctAnswer || !q.correctAnswer.trim()) {
        showErrorFn(`Câu hỏi #${qNum}: Vui lòng chọn đáp án đúng.`);
        this._focusQuestionField(container, i, 'correctAnswer');
        return false;
      }

      const trimmedOptions = q.options.map(o => o.trim());
      if (!trimmedOptions.includes(q.correctAnswer.trim())) {
        showErrorFn(`Câu hỏi #${qNum}: Đáp án đúng không khớp với bất kỳ lựa chọn nào trong 4 lựa chọn.`);
        this._focusQuestionField(container, i, 'correctAnswer');
        return false;
      }

      if (!q.hint || !q.hint.trim()) {
        showErrorFn(`Câu hỏi #${qNum}: Vui lòng nhập gợi ý khi trả lời sai.`);
        this._focusQuestionField(container, i, 'hint');
        return false;
      }
    }
    return true;
  }

  /**
   * Render danh sách câu hỏi của modal Chỉnh sửa
   */
  renderEditingQuestions() {
    this._renderQuestionCards(
      this.editQuestionsContainer,
      this.editingQuestions,
      this.editQuestionsCount,
      () => this.renderEditingQuestions()
    );
  }

  /**
   * Thêm 1 câu hỏi trống mới vào modal Chỉnh sửa
   */
  addEditingQuestion() {
    this._addQuestion(
      this.editQuestionsContainer,
      this.editingQuestions,
      () => this.renderEditingQuestions()
    );
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

      // Đọc danh sách câu hỏi từ scene.questions (đã chuẩn hoá từ Phase 1/2)
      let questions = [];
      if (Array.isArray(scene.questions) && scene.questions.length > 0) {
        questions = scene.questions.map(q => ({
          question: q.question || '',
          options: Array.isArray(q.options) ? [...q.options] : ['', '', '', ''],
          correctAnswer: q.correctAnswer || '',
          hint: q.hint || ''
        }));
      } else if (scene.question) {
        questions = [{
          question: scene.question || '',
          options: Array.isArray(scene.options) ? [...scene.options] : ['', '', '', ''],
          correctAnswer: scene.correctAnswer || '',
          hint: scene.hint || ''
        }];
      } else {
        questions = [{
          question: '',
          options: ['', '', '', ''],
          correctAnswer: '',
          hint: ''
        }];
      }

      this.editingQuestions = questions;
      this.renderEditingQuestions();
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

    let journal = '';
    let epilogueMsg = '';

    if (!isEpilogue) {
      journal = this.editJournalEntry ? this.editJournalEntry.value.trim() : '';
      if (!journal) {
        this.showEditSceneError('Vui lòng nhập đoạn nhật ký.');
        if (this.editJournalEntry) this.editJournalEntry.focus();
        return;
      }

      // Thu thập dữ liệu các câu hỏi từ DOM và validate
      this._harvestQuestions(this.editQuestionsContainer, this.editingQuestions);
      if (!this._validateQuestions(this.editingQuestions, this.editQuestionsContainer, (msg) => this.showEditSceneError(msg))) {
        return;
      }
    } else {
      epilogueMsg = this.editEpilogueMsg ? this.editEpilogueMsg.value.trim() : '';
      if (!epilogueMsg) {
        this.showEditSceneError('Vui lòng nhập lời nhắn kết thúc.');
        if (this.editEpilogueMsg) this.editEpilogueMsg.focus();
        return;
      }
    }

    const mediaUrl = this.editMediaUrl ? this.editMediaUrl.value.trim() : '';

    // 2. Chuẩn bị payload: ghi đè field questions (mảng mới), không cần ghi lại field cũ rời rạc
    const payload = {
      order: Number(scene.id),
      sceneName: scene.sceneName,
      isEpilogue: isEpilogue,
      mediaUrl: mediaUrl || null,
      pin: window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : ''
    };

    if (!isEpilogue) {
      payload.journalEntry = journal;
      payload.questions = this.editingQuestions.map(q => ({
        question: q.question.trim(),
        options: q.options.map(o => o.trim()),
        correctAnswer: q.correctAnswer.trim(),
        hint: q.hint.trim()
      }));
      payload.epilogueMessage = null;
    } else {
      payload.journalEntry = null;
      payload.questions = [];
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
      console.log(`[LoveJourney] Đã cập nhật ${firestoreId} thành công với ${payload.questions ? payload.questions.length : 0} câu hỏi.`);
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
    this.addSceneModal         = document.getElementById('add-scene-modal');
    this.addSceneForm          = document.getElementById('add-scene-form');
    this.addSceneCloseX        = document.getElementById('add-scene-close-x');
    this.addSceneCancelBtn     = document.getElementById('add-scene-cancel-btn');
    this.addSceneSaveBtn       = document.getElementById('add-scene-save-btn');
    this.addSceneErrorMsg      = document.getElementById('add-scene-error-msg');

    this.addInsertPosition     = document.getElementById('add-insert-position');
    this.addSceneName          = document.getElementById('add-scene-name');
    this.addJournalEntry       = document.getElementById('add-journal-entry');
    this.addQuestionsContainer = document.getElementById('add-questions-container');
    this.addQuestionsCount     = document.getElementById('add-questions-count');
    this.addAddQuestionBtn     = document.getElementById('add-add-question-btn');
    this.addMediaUrl           = document.getElementById('add-media-url');
    this.addingQuestions       = [];

    if (this.addSceneCloseX) {
      this.addSceneCloseX.addEventListener('click', () => this.closeAddSceneModal());
    }

    if (this.addSceneCancelBtn) {
      this.addSceneCancelBtn.addEventListener('click', () => this.closeAddSceneModal());
    }

    if (this.addSceneForm) {
      this.addSceneForm.addEventListener('submit', (e) => this.saveNewScene(e));
    }

    if (this.addAddQuestionBtn) {
      this.addAddQuestionBtn.addEventListener('click', () => this.addAddingQuestion());
    }
  }

  /**
   * Render danh sách câu hỏi của modal Thêm kỷ niệm mới
   */
  renderAddingQuestions() {
    this._renderQuestionCards(
      this.addQuestionsContainer,
      this.addingQuestions,
      this.addQuestionsCount,
      () => this.renderAddingQuestions()
    );
  }

  /**
   * Thêm 1 câu hỏi trống mới vào modal Thêm kỷ niệm mới
   */
  addAddingQuestion() {
    this._addQuestion(
      this.addQuestionsContainer,
      this.addingQuestions,
      () => this.renderAddingQuestions()
    );
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
   * Mở modal thêm kỷ niệm mới
   */
  openAddSceneModal() {
    if (!this.addSceneModal) return;

    // Reset các trường nhập
    if (this.addSceneName) this.addSceneName.value = '';
    if (this.addJournalEntry) this.addJournalEntry.value = '';
    if (this.addMediaUrl) this.addMediaUrl.value = '';

    // Khởi tạo mảng câu hỏi mặc định có đúng 1 câu hỏi trống
    this.addingQuestions = [{
      question: '',
      options: ['', '', '', ''],
      correctAnswer: '',
      hint: ''
    }];
    this.renderAddingQuestions();

    // Cập nhật dropdown vị trí
    this.populateInsertPositionDropdown();
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
    const customName = this.addSceneName ? this.addSceneName.value.trim() : '';
    const mediaUrl = this.addMediaUrl ? this.addMediaUrl.value.trim() : '';

    if (!journal) {
      this.showAddSceneError('Vui lòng nhập đoạn nhật ký.');
      if (this.addJournalEntry) this.addJournalEntry.focus();
      return;
    }

    // Thu thập dữ liệu các câu hỏi từ DOM và validate
    this._harvestQuestions(this.addQuestionsContainer, this.addingQuestions);
    if (!this._validateQuestions(this.addingQuestions, this.addQuestionsContainer, (msg) => this.showAddSceneError(msg))) {
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
      questions: this.addingQuestions.map(q => ({
        question: q.question.trim(),
        options: q.options.map(o => o.trim()),
        correctAnswer: q.correctAnswer.trim(),
        hint: q.hint.trim()
      })),
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

