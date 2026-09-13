/**
 * Class GameController — điều khiển toàn bộ luồng game
 */

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
    this.activeTab = 'journey';

    // Mốc kỷ niệm mở khoá cao nhất (Review Mode - Phase Xem lại kỷ niệm)
    // Khôi phục từ localStorage (bảo toàn vĩnh viễn trên trình duyệt thiết bị)
    let storedMax = null;
    try {
      storedMax = localStorage.getItem('lj_max_unlocked_index') ?? sessionStorage.getItem('lj_max_unlocked_index');
    } catch (_) {}
    this.maxUnlockedIndex = storedMax !== null ? (parseInt(storedMax, 10) || 0) : 0;

    // ─── Tham chiếu DOM cố định ───────────────────────────────
    this.miniProgressTrack = document.getElementById('mini-progress-track');
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

    // Khởi tạo Review Mode & Modal xem lại câu đố
    this.initReviewQuizModal();

    // Khởi tạo Modal sắp xếp thứ tự kỷ niệm (Reorder)
    this.initReorderModal();

    // Khởi tạo Hướng dẫn sử dụng (User Guide)
    this.initUserGuide();

    // Khởi tạo Hộp thư góp ý & tâm sự (Feedbacks - Tab Notes)
    this.initFeedbacks();
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

    // Reset Review Mode controls
    if (this.returnCurrentBtn) this.returnCurrentBtn.classList.add('hidden');
    if (this.reviewControls) this.reviewControls.classList.add('hidden');
    if (this.continueBtn) this.continueBtn.classList.remove('hidden');

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

    // Header luôn hiện
    this.sceneIndicator.textContent = `Kỷ niệm ${index + 1}`;
    this.sceneTitle.textContent = stripSceneOrdinalPrefix(scene.sceneName);
    this._renderMiniProgress();

    const isReviewMode = index < this.maxUnlockedIndex;

    // ── REVIEW MODE: Kỷ niệm cũ đã mở khoá trước đó ─────────────
    if (isReviewMode) {
      this.isSceneUnlocked = true;

      // Nút nổi quay lại kỷ niệm hiện tại (chỉ hiện khi đang ở tab Hành trình)
      if (this.returnCurrentBtn && this.activeTab === 'journey') {
        this.returnCurrentBtn.classList.remove('hidden');
      }

      // Nút xem câu đố (chỉ hiện nếu scene có câu hỏi)
      const hasQuestions = (Array.isArray(scene.questions) && scene.questions.length > 0) || Boolean(scene.question);
      if (hasQuestions && this.reviewControls) {
        this.reviewControls.classList.remove('hidden');
      }

      // Hiện ngay nhật ký (không ẩn, không bắt bấm Tiếp tục)
      if (scene.journalEntry) {
        this.journalText.textContent = scene.journalEntry;
        this.journalContainer.classList.remove('hidden');
        if (this.continueBtn) this.continueBtn.classList.add('hidden');
      }

      // Ẩn hoàn toàn form câu hỏi
      this.questionBox.classList.add('hidden');

      // Hiện media sau mở khoá nếu có
      if (scene.mediaAfterUnlock && scene.mediaAfterUnlock.src) {
        this._renderMedia(scene.mediaAfterUnlock, this.mediaContainer);
      }

      // Nút chuyển tiếp (nếu có scene sau)
      if (index < this.scenesData.length - 1) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = index < this.scenesData.length - 2
          ? '→ Kỷ niệm tiếp theo'
          : '→ Đọc lời kết';
        nextBtn.className = 'next-scene-btn';
        nextBtn.addEventListener('click', () => {
          this.loadScene(index + 1);
        }, { once: true });
        this.mediaContainer.appendChild(nextBtn);
      }
      this.mediaContainer.classList.remove('hidden');
      return;
    }

    // ── NORMAL MODE: Kỷ niệm đang chơi dở hoặc mới nhất ─────────
    this.isSceneUnlocked = false;

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
    this._renderEpilogueMessage(scene.epilogueMessage);
    this.epilogueContainer.classList.remove('hidden');

    // Hiện media nếu có
    if (scene.mediaAfterUnlock && scene.mediaAfterUnlock.src) {
      this._renderMedia(scene.mediaAfterUnlock, this.epilogueContainer);
    }
  }

  // ── Render thông điệp epilogue theo từng dòng với animation so le ──
  _renderEpilogueMessage(rawMsg) {
    if (!this.epilogueMessage) return;
    this.epilogueMessage.innerHTML = '';
    if (!rawMsg) return;

    // Ưu tiên tách theo dòng xuống hàng (\n), nếu là 1 đoạn đơn thì tách theo câu (. ! ?)
    let lines = rawMsg.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 1 && /[.!?]/.test(rawMsg)) {
      const sentenceSplit = rawMsg.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
      if (sentenceSplit && sentenceSplit.length > 1) {
        lines = sentenceSplit.map(s => s.trim()).filter(Boolean);
      }
    }

    lines.forEach((lineText, idx) => {
      const span = document.createElement('span');
      span.className = 'epilogue-line';
      span.style.animationDelay = `${0.45 + idx * 0.3}s`;
      span.textContent = lineText;
      this.epilogueMessage.appendChild(span);
    });
  }

  // ── Render / Cập nhật dải tiến trình mini (chấm cũ chạm được để xem lại) ──
  _renderMiniProgress() {
    if (!this.miniProgressTrack) return;
    const count = Array.isArray(this.scenesData) ? this.scenesData.length : 0;
    if (count <= 1) {
      this.miniProgressTrack.innerHTML = '';
      return;
    }

    const paddingX = 14;
    const dx = 32;
    const svgWidth = paddingX * 2 + (count - 1) * dx;
    const svgHeight = 36;

    const points = [];
    for (let i = 0; i < count; i++) {
      const x = paddingX + i * dx;
      const y = (i % 2 === 0) ? 14 : 20; // Sóng lượn nhẹ 6px
      points.push({ x, y });
    }

    // Vẽ các đoạn cong nối giữa 2 node liên tiếp
    let pathsHtml = '';
    const activeThreshold = Math.max(this.currentSceneIndex, this.maxUnlockedIndex);
    for (let i = 0; i < count - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX = p0.x + (p1.x - p0.x) * 0.5;
      const d = `M ${p0.x} ${p0.y} C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`;
      const isActive = i < activeThreshold;
      pathsHtml += `<path class="mini-progress-segment ${isActive ? 'is-active' : ''}" d="${d}" />`;
    }

    // Vẽ các chấm mốc tiến trình & hitbox cảm ứng ~36px (cho phép chạm vào mốc cũ)
    let dotsHtml = '';
    points.forEach((pt, i) => {
      let statusClass = 'locked';
      if (i === this.currentSceneIndex) {
        statusClass = 'current';
      } else if (i <= this.maxUnlockedIndex) {
        statusClass = 'unlocked';
      }

      const isClickable = (i <= this.maxUnlockedIndex && i !== this.currentSceneIndex);

      dotsHtml += `
        <circle class="mini-progress-dot ${statusClass} ${isClickable ? 'is-clickable' : ''}"
                cx="${pt.x}" cy="${pt.y}"
                r="${i === this.currentSceneIndex ? 4.5 : (i <= this.maxUnlockedIndex ? 4 : 3.5)}" />
        ${isClickable ? `
          <circle class="mini-dot-hitbox"
                  data-index="${i}"
                  cx="${pt.x}" cy="${pt.y}"
                  r="18"
                  fill="transparent" />
        ` : ''}
      `;
    });

    // Marker trái tim nhấp nháy tại mốc hiện tại
    const curIndex = Math.min(Math.max(0, this.currentSceneIndex), count - 1);
    const curPt = points[curIndex] || points[0];
    const heartHtml = `
      <g class="mini-heart-marker" transform="translate(${curPt.x}, ${curPt.y})">
        <circle class="mini-heart-halo" cx="0" cy="0" r="10" />
        <text class="mini-heart-icon" x="0" y="0" text-anchor="middle" dominant-baseline="central">❤</text>
      </g>
    `;

    this.miniProgressTrack.innerHTML = `
      <svg class="mini-progress-svg"
           viewBox="0 0 ${svgWidth} ${svgHeight}"
           style="width: ${svgWidth}px; height: ${svgHeight}px;"
           xmlns="http://www.w3.org/2000/svg">
        <g class="mini-segments-group">${pathsHtml}</g>
        <g class="mini-dots-group">${dotsHtml}</g>
        ${heartHtml}
      </svg>
    `;

    // Gán sự kiện chạm vào mốc mốc cũ (gắn 1 lần duy nhất)
    if (!this._miniProgressBound) {
      this.miniProgressTrack.addEventListener('click', (e) => {
        const hitbox = e.target.closest('.mini-dot-hitbox');
        if (!hitbox) return;
        const idx = parseInt(hitbox.getAttribute('data-index'), 10);
        if (!isNaN(idx) && idx <= this.maxUnlockedIndex && idx !== this.currentSceneIndex) {
          this.loadScene(idx);
        }
      });
      this._miniProgressBound = true;
    }

    // Tự động cuộn dải mốc để vị trí hiện tại nằm giữa khung nhìn
    this._scrollMiniProgressToCenter(curIndex);
  }

  // ── Cuộn mượt thanh mốc để vị trí hiện tại nằm giữa ──
  _scrollMiniProgressToCenter(index) {
    if (!this.miniProgressTrack) return;
    const paddingX = 14;
    const dx = 32;
    const currentX = paddingX + index * dx;
    requestAnimationFrame(() => {
      if (!this.miniProgressTrack) return;
      const containerWidth = this.miniProgressTrack.clientWidth;
      if (containerWidth > 0) {
        const targetScrollLeft = currentX - containerWidth / 2;
        this.miniProgressTrack.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: 'smooth'
        });
      }
    });
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
      this._triggerCelebration(btnEl);

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

  // ── Helper: tạo hiệu ứng sparkle / trái tim ăn mừng nhẹ khi trả lời đúng ──
  _triggerCelebration(targetEl) {
    if (!targetEl) return;
    const burst = document.createElement('div');
    burst.className = 'sparkle-burst';
    burst.setAttribute('aria-hidden', 'true');

    const particles = [
      { sym: '❤', cls: 'sparkle-p1' },
      { sym: '✨', cls: 'sparkle-p2' },
      { sym: '✦', cls: 'sparkle-p3' },
      { sym: '💖', cls: 'sparkle-p4' },
      { sym: '✨', cls: 'sparkle-p5' },
      { sym: '❤', cls: 'sparkle-p6' }
    ];

    particles.forEach(p => {
      const span = document.createElement('span');
      span.className = `sparkle-particle ${p.cls}`;
      span.textContent = p.sym;
      burst.appendChild(span);
    });

    targetEl.appendChild(burst);

    // Dọn dẹp DOM sau khi hiệu ứng bay kết thúc (850ms)
    setTimeout(() => {
      if (burst.parentNode) burst.parentNode.removeChild(burst);
    }, 850);
  }

  // ══════════════════════════════════════════════════════════════
  // unlockNextScene() — hiện media + chuyển cảnh
  // ══════════════════════════════════════════════════════════════
  unlockNextScene() {
    const scene = this.scenesData[this.currentSceneIndex];
    const nextIndex = this.currentSceneIndex + 1;
    const hasNext = nextIndex < this.scenesData.length;

    // Cập nhật mốc mở khoá cao nhất & lưu localStorage (bảo toàn lâu dài)
    this.maxUnlockedIndex = Math.max(this.maxUnlockedIndex, nextIndex);
    try {
      localStorage.setItem('lj_max_unlocked_index', String(this.maxUnlockedIndex));
    } catch (_) {}
    this._renderMiniProgress();

    // ── Hiện media của scene vừa mở khoá ─────────────────────
    if (scene.mediaAfterUnlock && scene.mediaAfterUnlock.src) {
      this._renderMedia(scene.mediaAfterUnlock, this.mediaContainer);
      this.mediaContainer.classList.remove('hidden');

      // Nếu có media: thêm nút "Tiếp theo" để người dùng tự quyết định khi nào chuyển
      if (hasNext) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = nextIndex < this.scenesData.length - 1
          ? '→ Kỷ niệm tiếp theo'
          : '→ Đọc lời kết';
        nextBtn.className = 'next-scene-btn';
        nextBtn.addEventListener('click', () => {
          this.loadScene(nextIndex);
        }, { once: true });
        this.mediaContainer.appendChild(nextBtn);
      }
    } else if (hasNext) {
      // Không có media: chuyển tự động sau 600ms
      setTimeout(() => this.loadScene(nextIndex), 600);
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
  //   Cập nhật header scene hiện tại.
  //   KHÔNG reset game state (người chơi vẫn ở scene cũ).
  // ══════════════════════════════════════════════════════════════
  handleScenesUpdate(newScenesData) {
    const isDeletion = newScenesData.length < this.scenesData.length;
    this.scenesData = newScenesData;
    this._renderMiniProgress();

    // Trường hợp xoá kỷ niệm: các kỷ niệm phía sau bị dồn index lên
    // LUÔN gọi loadScene để reset UI, ép khoá lại kỷ niệm dồn lên (isSceneUnlocked = false)
    if (isDeletion) {
      const oldMax = this.maxUnlockedIndex;
      const deletedIndex = this.currentSceneIndex;
      let newMax = deletedIndex < oldMax ? oldMax - 1 : oldMax;
      newMax = Math.max(0, Math.min(newMax, newScenesData.length - 1));
      this.maxUnlockedIndex = newMax;
      try {
        localStorage.setItem('lj_max_unlocked_index', String(this.maxUnlockedIndex));
      } catch (_) {}

      const targetIndex = Math.min(this.currentSceneIndex, newScenesData.length - 1);
      this.loadScene(targetIndex);
      return;
    }

    // Nếu currentSceneIndex vẫn hợp lệ: cập nhật header nhẹ nhàng (trường hợp sửa text/không xoá)
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
        this._renderEpilogueMessage(scene.epilogueMessage);
      }
    } else {
      // Scene hiện tại bị xoá khỏi Firestore → về scene cuối cùng còn lại
      this.loadScene(Math.max(0, newScenesData.length - 1));
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

      // 0. Chỉ xử lý vuốt khi đang ở tab Hành trình
      if (this.activeTab && this.activeTab !== 'journey') return;

      // 1. Không bắt cử chỉ vuốt khi đang mở bất kỳ modal nào
      const isAnyModalOpen =
        (this.pinModal && !this.pinModal.classList.contains('hidden')) ||
        (this.editSceneModal && !this.editSceneModal.classList.contains('hidden')) ||
        (this.addSceneModal && !this.addSceneModal.classList.contains('hidden')) ||
        (this.addPhotoModal && !this.addPhotoModal.classList.contains('hidden')) ||
        (this.profileViewModal && !this.profileViewModal.classList.contains('hidden')) ||
        (this.profileEditModal && !this.profileEditModal.classList.contains('hidden')) ||
        (this.reviewQuizModal && !this.reviewQuizModal.classList.contains('hidden'));
      if (isAnyModalOpen) return;

      // 2. Không bắt cử chỉ vuốt khi tương tác với cụm nút admin, thanh nav, form controls
      const target = e.target;
      if (target.closest('#edit-controls-container, #bottom-nav, .bottom-nav, input, textarea, select')) return;

      // 3. Xung đột thanh nav & thanh cử chỉ OS: Bỏ qua nếu touchstart quá sát đáy hoặc nằm trong vùng nav
      const bottomNav = document.getElementById('bottom-nav');
      const navRect = bottomNav ? bottomNav.getBoundingClientRect() : null;
      // Nút Hành Trình ở giữa nhô lên 14px, lấy thêm vùng đệm an toàn 15px -> cách đỉnh nav 15px
      const bottomThreshold = navRect ? (navRect.top - 15) : (window.innerHeight - 90);
      if (startY >= bottomThreshold) return;

      const touch = e.changedTouches[0];
      const deltaX = startX - touch.clientX;
      const deltaY = startY - touch.clientY;
      const duration = Date.now() - startTime;

      // 4. Tiêu chí vuốt LÊN (chuyển tiếp):
      //    - Quãng đường vuốt lên >= 60px
      //    - Định hướng chủ yếu theo phương dọc (deltaY > 1.4 * |deltaX|)
      //    - Thao tác dứt khoát (< 650ms) để không nhầm với giữ/chạm chậm
      const isSwipeUp = deltaY > 60 && Math.abs(deltaY) > Math.abs(deltaX) * 1.4 && duration < 650;
      if (isSwipeUp) {
        // Đảm bảo không xung đột cuộn tự nhiên (chỉ chuyển khi đã đọc tới đáy)
        if (!this._isScrolledToBottom(target)) return;
        this._handleSwipeUp();
        return;
      }

      // 5. Tiêu chí vuốt XUỐNG (lùi về kỷ niệm cũ):
      //    - Quãng đường vuốt xuống >= 60px (deltaY < -60)
      //    - Định hướng chủ yếu theo phương dọc (|deltaY| > 1.4 * |deltaX|)
      //    - Thao tác dứt khoát (< 650ms)
      const isSwipeDown = deltaY < -60 && Math.abs(deltaY) > Math.abs(deltaX) * 1.4 && duration < 650;
      if (isSwipeDown) {
        // Đảm bảo không xung đột cuộn tự nhiên (chỉ lùi cảnh khi đã ở sát đỉnh)
        if (!this._isScrolledToTop(target)) return;
        this._handleSwipeDown();
        return;
      }
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
   * Kiểm tra xem phần tử (hoặc các cha scrollable của nó) đã cuộn tới sát đỉnh chưa
   * @param {HTMLElement} target
   * @returns {boolean}
   */
  _isScrolledToTop(target) {
    let el = target;
    while (el && el !== document.body && el !== document.documentElement) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') {
        if (el.scrollTop > 10) {
          return false; // Vẫn còn nội dung phía trên, ưu tiên cuộn tự nhiên
        }
      }
      el = el.parentElement;
    }
    return true;
  }

  /**
   * Xử lý chuyển cảnh khi người dùng vuốt XUỐNG (lùi về kỷ niệm trước đó)
   */
  _handleSwipeDown() {
    if (this.currentSceneIndex > 0) {
      this.loadScene(this.currentSceneIndex - 1);
    }
  }

  /**
   * Xử lý chuyển cảnh khi người dùng vuốt LÊN
   */
  _handleSwipeUp() {
    // 0. Nếu đang ở Review Mode (kỷ niệm cũ đã mở): vuốt lên chuyển ngay sang cảnh tiếp theo
    if (this.currentSceneIndex < this.maxUnlockedIndex) {
      if (this.currentSceneIndex < this.scenesData.length - 1) {
        this.loadScene(this.currentSceneIndex + 1);
      }
      return;
    }
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

    // 3. Cập nhật hiển thị nút nổi Quay lại kỷ niệm hiện tại
    if (this.returnCurrentBtn) {
      if (tabName === 'journey' && this.currentSceneIndex < this.maxUnlockedIndex) {
        this.returnCurrentBtn.classList.remove('hidden');
      } else {
        this.returnCurrentBtn.classList.add('hidden');
      }
    }
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
      if (typeof this.updateFeedbackUserDisplay === 'function') {
        this.updateFeedbackUserDisplay();
      }

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

    // Nếu thiết bị chưa chọn danh tính: mở modal hỏi trước
    if (!this.currentFeedbackUser) {
      this.openFeedbackUserModal();
      return;
    }

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

    // Render khối Hộp thư góp ý / soạn thư trong modal hồ sơ
    this.renderProfileFeedbackSection(personId);

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

    // Tham chiếu DOM dropdown menu 3 chấm
    this.editDropdownWrapper   = document.getElementById('edit-dropdown-wrapper');
    this.editMenuBtn           = document.getElementById('edit-menu-btn');
    this.editDropdownMenu      = document.getElementById('edit-dropdown-menu');
    this.menuItemEditScene     = document.getElementById('menu-item-edit-scene');
    this.menuItemAddScene      = document.getElementById('menu-item-add-scene');
    this.menuItemReorderScenes = document.getElementById('menu-item-reorder-scenes');
    this.menuItemResetProgress = document.getElementById('menu-item-reset-progress');
    this.menuItemExitEdit      = document.getElementById('menu-item-exit-edit');

    // 1. Phục hồi trạng thái edit mode từ sessionStorage trong phiên làm việc
    const savedEditMode = sessionStorage.getItem('isEditMode') === 'true';
    this.setEditMode(savedEditMode);

    // Toggle dropdown 3 chấm khi bấm vào nút
    if (this.editMenuBtn) {
      this.editMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleEditMenu();
      });
    }

    // Các lựa chọn trong dropdown menu
    if (this.menuItemEditScene) {
      this.menuItemEditScene.addEventListener('click', () => {
        this.closeEditMenu();
        this.openEditSceneModal();
      });
    }
    if (this.menuItemAddScene) {
      this.menuItemAddScene.addEventListener('click', () => {
        this.closeEditMenu();
        this.openAddSceneModal();
      });
    }
    if (this.menuItemReorderScenes) {
      this.menuItemReorderScenes.addEventListener('click', () => {
        this.closeEditMenu();
        this.openReorderModal();
      });
    }
    if (this.menuItemResetProgress) {
      this.menuItemResetProgress.addEventListener('click', () => {
        this.closeEditMenu();
        this.resetProgress();
      });
    }
    if (this.menuItemExitEdit) {
      this.menuItemExitEdit.addEventListener('click', () => {
        this.closeEditMenu();
        this.setEditMode(false);
      });
    }

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', (e) => {
      if (this.editDropdownWrapper && !this.editDropdownWrapper.contains(e.target)) {
        this.closeEditMenu();
      }
    });

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

    // Phím Escape đóng modal PIN & đóng dropdown menu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.pinModal && !this.pinModal.classList.contains('hidden')) {
          this.closePinModal();
        }
        if (this.editDropdownMenu && !this.editDropdownMenu.classList.contains('hidden')) {
          this.closeEditMenu();
        }
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
      if (this.editDropdownWrapper) {
        this.editDropdownWrapper.classList.remove('hidden');
      }
      document.body.classList.add('edit-mode-active');
      this.removeEditSceneButton();
      this.removeAddSceneButton();
      this.removeReorderSceneButton();
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
      if (this.editDropdownWrapper) {
        this.editDropdownWrapper.classList.add('hidden');
      }
      this.closeEditMenu();
      document.body.classList.remove('edit-mode-active');
      this.removeEditSceneButton();
      this.removeAddSceneButton();
      this.removeReorderSceneButton();
      this.closeEditSceneModal();
      this.closeAddSceneModal();
      this.closeReorderModal();
      if (this.galleryAddBtn) {
        this.galleryAddBtn.classList.add('hidden');
      }
      this.closeAddPhotoModal();
      this.closeProfileEditModal();
    }
  }

  /**
   * Mở hoặc đóng menu dropdown 3 chấm
   */
  toggleEditMenu() {
    if (!this.editDropdownMenu) return;
    const isHidden = this.editDropdownMenu.classList.contains('hidden');
    if (isHidden) {
      this.openEditMenu();
    } else {
      this.closeEditMenu();
    }
  }

  /**
   * Mở menu dropdown 3 chấm
   */
  openEditMenu() {
    if (!this.editDropdownMenu) return;
    this.editDropdownMenu.classList.remove('hidden');
    if (this.editMenuBtn) {
      this.editMenuBtn.setAttribute('aria-expanded', 'true');
    }
  }

  /**
   * Đóng menu dropdown 3 chấm
   */
  closeEditMenu() {
    if (!this.editDropdownMenu) return;
    this.editDropdownMenu.classList.add('hidden');
    if (this.editMenuBtn) {
      this.editMenuBtn.setAttribute('aria-expanded', 'false');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ FORM & NÚT CHỈNH SỬA SCENE HIỆN TẠI
  // ══════════════════════════════════════════════════════════════

  renderEditSceneButton() {
    // Đã chuyển vào dropdown menu 3 chấm (#menu-item-edit-scene)
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
    this.editSceneDeleteBtn = document.getElementById('edit-scene-delete-btn');
    this.editSceneCancelBtn = document.getElementById('edit-scene-cancel-btn');
    this.editSceneSaveBtn  = document.getElementById('edit-scene-save-btn');
    this.editSceneErrorMsg = document.getElementById('edit-scene-error-msg');

    this.editIsEpilogue    = document.getElementById('edit-is-epilogue');
    this.editQuizFields    = document.getElementById('edit-quiz-fields');
    this.editEpilogueFields = document.getElementById('edit-epilogue-fields');

    this.editSceneName     = document.getElementById('edit-scene-name');
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

    if (this.editSceneDeleteBtn) {
      this.editSceneDeleteBtn.addEventListener('click', () => this.deleteScene());
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

    // Nút Xoá kỷ niệm (chỉ hiện cho kỷ niệm thường, ẩn nếu là Epilogue)
    if (this.editSceneDeleteBtn) {
      this.editSceneDeleteBtn.classList.toggle('hidden', isEpilogue);
      this.editSceneDeleteBtn.disabled = false;
      this.editSceneDeleteBtn.textContent = 'Xoá kỷ niệm';
    }

    // Rẽ nhánh các trường hiển thị theo loại scene
    if (isEpilogue) {
      if (this.editQuizFields) this.editQuizFields.classList.add('hidden');
      if (this.editEpilogueFields) this.editEpilogueFields.classList.remove('hidden');
      if (this.editEpilogueMsg) this.editEpilogueMsg.value = scene.epilogueMessage || '';
    } else {
      if (this.editQuizFields) this.editQuizFields.classList.remove('hidden');
      if (this.editEpilogueFields) this.editEpilogueFields.classList.add('hidden');
      if (this.editSceneName) {
        this.editSceneName.value = stripSceneOrdinalPrefix(scene.sceneName) || scene.sceneName || '';
      }
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
    const customName = this.editSceneName ? this.editSceneName.value.trim() : '';

    // 2. Chuẩn bị payload: ghi đè field questions (mảng mới), không cần ghi lại field cũ rời rạc
    const payload = {
      order: Number(scene.id),
      sceneName: customName || scene.sceneName || `Kỷ niệm ${this.currentSceneIndex + 1}`,
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

  /**
   * Xoá kỷ niệm hiện tại khỏi Firestore
   */
  async deleteScene() {
    const scene = this.scenesData[this.currentSceneIndex];
    if (!scene) return;

    if (scene.isEpilogue || scene.question === null) {
      alert('Không thể xoá cảnh kết thúc (Epilogue).');
      return;
    }

    const sceneTitle = stripSceneOrdinalPrefix(scene.sceneName) || `Kỷ niệm ${this.currentSceneIndex + 1}`;
    const confirmed = window.confirm(`Bạn có chắc chắn muốn xoá "${sceneTitle}"?\nHành động này không thể hoàn tác.`);
    if (!confirmed) return;

    if (this.editSceneDeleteBtn) {
      this.editSceneDeleteBtn.disabled = true;
      this.editSceneDeleteBtn.textContent = 'Đang xoá...';
    }
    if (this.editSceneSaveBtn) this.editSceneSaveBtn.disabled = true;
    if (this.editSceneCancelBtn) this.editSceneCancelBtn.disabled = true;

    const firestoreId = scene.firestoreId || (`scene_${String(scene.id).padStart(2, '0')}`);
    const pin = window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : '';

    try {
      if (typeof window.__LJ_DELETE_MEMORY !== 'function') {
        throw new Error('Hàm xoá kỷ niệm chưa sẵn sàng.');
      }
      await window.__LJ_DELETE_MEMORY(firestoreId, pin);
      console.log(`[LoveJourney] Đã xoá kỷ niệm ${firestoreId} thành công.`);
      this.closeEditSceneModal();
    } catch (err) {
      console.warn('[LoveJourney] Lỗi khi xoá scene:', err);
      let errorText = 'Lỗi xoá kỷ niệm: ';
      if (err && err.code === 'permission-denied') {
        errorText += 'Không có quyền xoá (mã PIN không khớp Security Rules).';
      } else {
        errorText += (err.message || 'Vui lòng thử lại sau.');
      }
      this.showEditSceneError(errorText);
    } finally {
      if (this.editSceneDeleteBtn) {
        this.editSceneDeleteBtn.disabled = false;
        this.editSceneDeleteBtn.textContent = 'Xoá kỷ niệm';
      }
      if (this.editSceneSaveBtn) this.editSceneSaveBtn.disabled = false;
      if (this.editSceneCancelBtn) this.editSceneCancelBtn.disabled = false;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ MODAL XEM LẠI CÂU ĐỐ (REVIEW QUIZ - CHỈ ĐỌC)
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo tham chiếu và sự kiện cho Modal xem lại câu đố
   */
  initReviewQuizModal() {
    this.reviewQuizModal    = document.getElementById('review-quiz-modal');
    this.reviewQuizTitle    = document.getElementById('review-quiz-modal-title');
    this.reviewQuizContent  = document.getElementById('review-quiz-content');
    this.reviewQuizCloseX   = document.getElementById('review-quiz-close-x');
    this.reviewQuizCloseBtn = document.getElementById('review-quiz-close-btn');
    this.reviewQuizBtn      = document.getElementById('review-quiz-btn');
    this.reviewControls     = document.getElementById('review-controls');
    this.returnCurrentBtn   = document.getElementById('return-current-btn');

    if (this.reviewQuizCloseX) {
      this.reviewQuizCloseX.addEventListener('click', () => this.closeReviewQuizModal());
    }

    if (this.reviewQuizCloseBtn) {
      this.reviewQuizCloseBtn.addEventListener('click', () => this.closeReviewQuizModal());
    }

    if (this.reviewQuizModal) {
      this.reviewQuizModal.addEventListener('click', (e) => {
        if (e.target === this.reviewQuizModal) this.closeReviewQuizModal();
      });
    }

    if (this.reviewQuizBtn) {
      this.reviewQuizBtn.addEventListener('click', () => this.openReviewQuizModal());
    }

    if (this.returnCurrentBtn) {
      this.returnCurrentBtn.addEventListener('click', () => {
        this.loadScene(this.maxUnlockedIndex);
      });
    }
  }

  /**
   * Mở modal xem lại câu đố (chế độ chỉ đọc, tô màu đáp án đúng)
   */
  openReviewQuizModal() {
    const scene = this.scenesData[this.currentSceneIndex];
    if (!scene || !this.reviewQuizModal) return;

    const title = stripSceneOrdinalPrefix(scene.sceneName) || `Kỷ niệm ${this.currentSceneIndex + 1}`;
    if (this.reviewQuizTitle) {
      this.reviewQuizTitle.textContent = `Câu đố: ${title}`;
    }

    const questions = (Array.isArray(scene.questions) && scene.questions.length > 0)
      ? scene.questions
      : (scene.question ? [{
          question: scene.question,
          options: scene.options || [],
          correctAnswer: scene.correctAnswer,
          hint: scene.hint
        }] : []);

    if (this.reviewQuizContent) {
      if (questions.length === 0) {
        this.reviewQuizContent.innerHTML = '<p style="text-align:center; padding:16px; color:var(--text-muted);">Kỷ niệm này không có câu hỏi trắc nghiệm.</p>';
      } else {
        this.reviewQuizContent.innerHTML = questions.map((q, qIdx) => {
          const optionsHtml = (Array.isArray(q.options) ? q.options : []).map(opt => {
            const isCorrect = String(opt).trim() === String(q.correctAnswer).trim();
            return `
              <div class="review-opt-item ${isCorrect ? 'is-correct-answer' : ''}">
                <span>${isCorrect ? '✓' : '•'}</span>
                <span>${opt}</span>
                ${isCorrect ? '<span class="review-opt-badge">Đáp án đúng</span>' : ''}
              </div>
            `;
          }).join('');

          return `
            <div class="review-question-card">
              <div class="review-q-header">Câu ${qIdx + 1}: ${q.question}</div>
              <div class="review-q-options">${optionsHtml}</div>
              ${q.hint ? `<div class="review-hint-box">💡 Gợi ý: ${q.hint}</div>` : ''}
            </div>
          `;
        }).join('');
      }
    }

    this.reviewQuizModal.classList.remove('hidden');
  }

  /**
   * Đóng modal xem lại câu đố
   */
  closeReviewQuizModal() {
    if (this.reviewQuizModal) {
      this.reviewQuizModal.classList.add('hidden');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ FORM & NÚT THÊM KỶ NIỆM MỚI (FRACTIONAL INDEXING)
  // ══════════════════════════════════════════════════════════════

  renderAddSceneButton() {
    // Đã chuyển vào dropdown menu 3 chấm (#menu-item-add-scene)
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

  // ══════════════════════════════════════════════════════════════
  // QUẢN LÝ MODAL SẮP XẾP THỨ TỰ KỶ NIỆM (REORDER SCENES)
  // ══════════════════════════════════════════════════════════════

  renderReorderSceneButton() {
    // Đã chuyển vào dropdown menu 3 chấm (#menu-item-reorder-scenes)
  }

  /**
   * Xoá nút "Thứ tự" khỏi DOM khi edit mode tắt
   */
  removeReorderSceneButton() {
    const btn = document.getElementById('reorder-scenes-btn');
    if (btn) btn.remove();
  }

  /**
   * Khởi tạo tham chiếu và sự kiện cho modal sắp xếp thứ tự
   */
  initReorderModal() {
    this.reorderModal     = document.getElementById('reorder-scenes-modal');
    this.reorderList      = document.getElementById('reorder-scenes-list');
    this.reorderCloseX    = document.getElementById('reorder-close-x');
    this.reorderCancelBtn = document.getElementById('reorder-cancel-btn');
    this.reorderSaveBtn   = document.getElementById('reorder-save-btn');
    this.reorderResetBtn  = document.getElementById('reorder-reset-btn');
    this.reorderErrorMsg  = document.getElementById('reorder-error-msg');

    if (this.reorderCloseX) {
      this.reorderCloseX.addEventListener('click', () => this.closeReorderModal());
    }

    if (this.reorderCancelBtn) {
      this.reorderCancelBtn.addEventListener('click', () => this.closeReorderModal());
    }

    if (this.reorderResetBtn) {
      this.reorderResetBtn.addEventListener('click', () => this.resetProgress());
    }

    if (this.reorderModal) {
      this.reorderModal.addEventListener('click', (e) => {
        if (e.target === this.reorderModal) this.closeReorderModal();
      });
    }

    if (this.reorderSaveBtn) {
      this.reorderSaveBtn.addEventListener('click', () => this.saveReorderedScenes());
    }
  }

  /**
   * Reset toàn bộ tiến trình mở khoá trên thiết bị này (localStorage)
   */
  resetProgress() {
    const message = "Reset sẽ xoá tiến trình mở khoá đã lưu TRÊN THIẾT BỊ NÀY, người xem sẽ phải làm lại từ đầu. Hành động này không ảnh hưởng tới thiết bị khác. Bạn có chắc chắn?";
    if (!window.confirm(message)) return;

    try {
      localStorage.removeItem('lj_max_unlocked_index');
      sessionStorage.removeItem('lj_max_unlocked_index');
    } catch (_) {}

    this.maxUnlockedIndex = 0;
    this.closeReorderModal();
    this.loadScene(0);
    console.log('[LoveJourney] Đã reset tiến trình mở khoá trên thiết bị này về 0.');
  }

  /**
   * Mở modal sắp xếp thứ tự kỷ niệm
   */
  openReorderModal() {
    if (!this.reorderModal) return;
    this.hideReorderError();

    // Tách riêng: các kỷ niệm thường (có thể đổi chỗ) và Hồi kết (cố định ở cuối)
    this.reorderingNormalScenes = this.scenesData
      .filter(s => !s.isEpilogue && s.question !== null)
      .map(s => ({ ...s }));

    this.reorderingEpilogue = this.scenesData.find(s => s.isEpilogue || s.question === null) || null;

    this._renderReorderList();
    this.reorderModal.classList.remove('hidden');
  }

  /**
   * Đóng modal sắp xếp thứ tự
   */
  closeReorderModal() {
    if (this.reorderModal) {
      this.reorderModal.classList.add('hidden');
    }
    this.hideReorderError();
  }

  showReorderError(msg) {
    if (this.reorderErrorMsg) {
      this.reorderErrorMsg.textContent = msg;
      this.reorderErrorMsg.classList.remove('hidden');
    }
  }

  hideReorderError() {
    if (this.reorderErrorMsg) {
      this.reorderErrorMsg.textContent = '';
      this.reorderErrorMsg.classList.add('hidden');
    }
  }

  /**
   * Render danh sách kỷ niệm trong modal sắp xếp kèm Pointer Events & nút bấm
   */
  _renderReorderList() {
    if (!this.reorderList) return;
    this.reorderList.innerHTML = '';

    const normalCount = this.reorderingNormalScenes.length;

    // 1. Render các kỷ niệm thường (có thể đổi chỗ)
    this.reorderingNormalScenes.forEach((scene, idx) => {
      const item = document.createElement('div');
      item.className = 'reorder-item';
      item.setAttribute('data-index', String(idx));

      const title = stripSceneOrdinalPrefix(scene.sceneName) || `Kỷ niệm ${idx + 1}`;

      item.innerHTML = `
        <div class="reorder-handle" title="Kéo thả để đổi vị trí">⠿</div>
        <div class="reorder-badge">${idx + 1}</div>
        <div class="reorder-title" title="${title}">${title}</div>
        <div class="reorder-actions">
          <button type="button" class="reorder-arrow-btn" data-action="up" data-index="${idx}" ${idx === 0 ? 'disabled' : ''} title="Di chuyển lên">▲</button>
          <button type="button" class="reorder-arrow-btn" data-action="down" data-index="${idx}" ${idx === normalCount - 1 ? 'disabled' : ''} title="Di chuyển xuống">▼</button>
        </div>
      `;

      // Gán sự kiện click nút mũi tên
      item.querySelectorAll('.reorder-arrow-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.getAttribute('data-action');
          const curIdx = parseInt(btn.getAttribute('data-index'), 10);
          if (action === 'up' && curIdx > 0) {
            const temp = this.reorderingNormalScenes[curIdx];
            this.reorderingNormalScenes[curIdx] = this.reorderingNormalScenes[curIdx - 1];
            this.reorderingNormalScenes[curIdx - 1] = temp;
            this._renderReorderList();
          } else if (action === 'down' && curIdx < normalCount - 1) {
            const temp = this.reorderingNormalScenes[curIdx];
            this.reorderingNormalScenes[curIdx] = this.reorderingNormalScenes[curIdx + 1];
            this.reorderingNormalScenes[curIdx + 1] = temp;
            this._renderReorderList();
          }
        });
      });

      // Gán Pointer Events kéo thả thuần (hỗ trợ cả Touch Mobile & Chuột Desktop)
      const handle = item.querySelector('.reorder-handle');
      if (handle) {
        handle.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          const dragIdx = idx;
          let dropTargetIdx = dragIdx;
          const startY = e.clientY;

          handle.setPointerCapture(e.pointerId);
          item.classList.add('is-dragging');

          const clearDropIndicators = () => {
            this.reorderList.querySelectorAll('.reorder-item').forEach(el => {
              el.classList.remove('drag-target-above', 'drag-target-below');
            });
          };

          const onPointerMove = (moveEvt) => {
            // 1. Thẻ bay theo ngón tay dọc trục Y
            const deltaY = moveEvt.clientY - startY;
            item.style.transform = `translateY(${deltaY}px)`;

            // Tự động cuộn nhẹ danh sách nếu kéo sát mép trên/dưới
            const listRect = this.reorderList.getBoundingClientRect();
            if (moveEvt.clientY < listRect.top + 30) {
              this.reorderList.scrollTop -= 5;
            } else if (moveEvt.clientY > listRect.bottom - 30) {
              this.reorderList.scrollTop += 5;
            }

            // 2. Tìm thẻ bên dưới con trỏ (do thẻ đang kéo có pointer-events: none nên tự xuyên qua)
            const els = document.elementsFromPoint(moveEvt.clientX, moveEvt.clientY);
            const targetEl = els.find(el => el.classList && el.classList.contains('reorder-item') && !el.classList.contains('is-epilogue'));

            clearDropIndicators();

            if (targetEl && targetEl !== item) {
              const targetIdx = parseInt(targetEl.getAttribute('data-index'), 10);
              if (!isNaN(targetIdx) && targetIdx >= 0 && targetIdx < normalCount) {
                const rect = targetEl.getBoundingClientRect();
                const isAbove = moveEvt.clientY < (rect.top + rect.height / 2);

                if (isAbove) {
                  targetEl.classList.add('drag-target-above');
                  dropTargetIdx = targetIdx > dragIdx ? targetIdx - 1 : targetIdx;
                } else {
                  targetEl.classList.add('drag-target-below');
                  dropTargetIdx = targetIdx < dragIdx ? targetIdx + 1 : targetIdx;
                }
              }
            } else if (targetEl === item) {
              // Rê về đúng vị trí ban đầu
              dropTargetIdx = dragIdx;
            } else {
              // Nếu đang rê trên phần tử Hồi kết (cuối danh sách)
              const epilogueEl = els.find(el => el.classList && el.classList.contains('is-epilogue'));
              if (epilogueEl) {
                epilogueEl.classList.add('drag-target-above');
                dropTargetIdx = normalCount - 1;
              }
            }
          };

          const onPointerUp = (upEvt) => {
            handle.removeEventListener('pointermove', onPointerMove);
            handle.removeEventListener('pointerup', onPointerUp);
            handle.removeEventListener('pointercancel', onPointerUp);
            try {
              handle.releasePointerCapture(upEvt.pointerId);
            } catch (_) {}

            item.classList.remove('is-dragging');
            item.style.transform = '';
            clearDropIndicators();

            if (dropTargetIdx !== dragIdx && dropTargetIdx >= 0 && dropTargetIdx < normalCount) {
              const [moved] = this.reorderingNormalScenes.splice(dragIdx, 1);
              this.reorderingNormalScenes.splice(dropTargetIdx, 0, moved);
              this._renderReorderList();
            }
          };

          handle.addEventListener('pointermove', onPointerMove);
          handle.addEventListener('pointerup', onPointerUp);
          handle.addEventListener('pointercancel', onPointerUp);
        });
      }

      this.reorderList.appendChild(item);
    });

    // 2. Render Hồi kết ở cuối cùng (Cố định, không thể đổi chỗ)
    if (this.reorderingEpilogue) {
      const epilogueItem = document.createElement('div');
      epilogueItem.className = 'reorder-item is-epilogue';
      const epilogueTitle = stripSceneOrdinalPrefix(this.reorderingEpilogue.sceneName) || 'Lời nhắn gửi từ trái tim';
      epilogueItem.innerHTML = `
        <div class="reorder-lock-icon" title="Hồi kết luôn cố định ở vị trí cuối cùng">🔒</div>
        <div class="reorder-badge">Hồi kết</div>
        <div class="reorder-title" title="${epilogueTitle}">${epilogueTitle}</div>
        <div class="reorder-actions">
          <span class="reorder-lock-icon" style="font-size:0.72rem; color:var(--text-muted); font-style:italic;">Cố định</span>
        </div>
      `;
      this.reorderList.appendChild(epilogueItem);
    }
  }

  /**
   * Lưu thứ tự mới lên Firestore bằng writeBatch (Hồi kết bị loại hoàn toàn)
   * và bảo toàn tiến trình maxUnlockedIndex theo các kỷ niệm đã hoàn thành liên tiếp.
   */
  async saveReorderedScenes() {
    this.hideReorderError();
    if (this.reorderSaveBtn) {
      this.reorderSaveBtn.disabled = true;
      this.reorderSaveBtn.textContent = 'Đang lưu...';
    }
    if (this.reorderCancelBtn) this.reorderCancelBtn.disabled = true;

    const pin = window.APP_CONFIG?.adminPin ? String(window.APP_CONFIG.adminPin).trim() : '';

    try {
      if (typeof window.__LJ_REORDER_MEMORIES !== 'function') {
        throw new Error('Chức năng sắp xếp Firestore chưa sẵn sàng.');
      }

      // 1. Xác định tập hợp firestoreId của những kỷ niệm ĐÃ HOÀN THÀNH trong thứ tự CŨ
      //    (các scene có index < this.maxUnlockedIndex, loại trừ Hồi kết)
      const completedIds = new Set();
      const currentMax = this.maxUnlockedIndex || 0;
      for (let i = 0; i < currentMax && i < this.scenesData.length; i++) {
        const s = this.scenesData[i];
        if (s && !s.isEpilogue && s.question !== null) {
          completedIds.add(s.firestoreId || String(s.id));
        }
      }

      // 2. CHỈ gửi các kỷ niệm thường, TUYỆT ĐỐI KHÔNG gửi Hồi kết vào batch
      const normalScenesToSave = this.reorderingNormalScenes.filter(s => !s.isEpilogue && s.question !== null);

      await window.__LJ_REORDER_MEMORIES(normalScenesToSave, pin);
      console.log(`[LoveJourney] Đã lưu thứ tự mới thành công cho ${normalScenesToSave.length} kỷ niệm.`);

      // 3. Tính lại maxUnlockedIndex MỚI dựa trên danh sách mới và completedIds:
      //    Đếm số kỷ niệm LIÊN TIẾP tính từ vị trí 0 nằm trong completedIds.
      //    DỪNG NGAY khi gặp kỷ niệm đầu tiên KHÔNG có trong completedIds.
      let newMaxUnlocked = 0;
      for (let i = 0; i < normalScenesToSave.length; i++) {
        const s = normalScenesToSave[i];
        const key = s.firestoreId || String(s.id);
        if (completedIds.has(key)) {
          newMaxUnlocked++;
        } else {
          break; // Dừng ngay khi gặp kỷ niệm đầu tiên chưa hoàn thành
        }
      }

      this.maxUnlockedIndex = newMaxUnlocked;
      try {
        localStorage.setItem('lj_max_unlocked_index', String(this.maxUnlockedIndex));
      } catch (_) {}

      this.closeReorderModal();
      this.loadScene(0);
    } catch (err) {
      console.warn('[LoveJourney] Lỗi lưu thứ tự scenes:', err);
      let errorText = 'Lỗi lưu thứ tự: ';
      if (err && err.code === 'permission-denied') {
        errorText += 'Không có quyền ghi (mã PIN không khớp Security Rules).';
      } else {
        errorText += (err.message || 'Vui lòng thử lại sau.');
      }
      this.showReorderError(errorText);
    } finally {
      if (this.reorderSaveBtn) {
        this.reorderSaveBtn.disabled = false;
        this.reorderSaveBtn.textContent = 'Lưu thứ tự';
      }
      if (this.reorderCancelBtn) this.reorderCancelBtn.disabled = false;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // HƯỚNG DẪN SỬ DỤNG (USER GUIDE ONBOARDING)
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo các phần tử và sự kiện cho modal Hướng Dẫn Sử Dụng
   */
  initUserGuide() {
    this.guideBtn            = document.getElementById('guide-btn');
    this.userGuideModal      = document.getElementById('user-guide-modal');
    this.userGuideCloseX     = document.getElementById('user-guide-close-x');
    this.userGuideConfirmBtn = document.getElementById('user-guide-confirm-btn');
    this.guideTabBtns        = document.querySelectorAll('.guide-tab-btn');
    this.guideTabContents    = {
      journey: document.getElementById('guide-content-journey'),
      gallery: document.getElementById('guide-content-gallery')
    };

    // Nút mở modal "?" góc dưới trái
    if (this.guideBtn) {
      this.guideBtn.addEventListener('click', () => this.openUserGuide());
    }

    // Nút đóng modal (nút X & nút "Đã hiểu rồi nè ✨")
    if (this.userGuideCloseX) {
      this.userGuideCloseX.addEventListener('click', () => this.closeUserGuide());
    }
    if (this.userGuideConfirmBtn) {
      this.userGuideConfirmBtn.addEventListener('click', () => this.closeUserGuide());
    }

    // Đóng khi bấm vào backdrop mờ
    if (this.userGuideModal) {
      this.userGuideModal.addEventListener('click', (e) => {
        if (e.target === this.userGuideModal) this.closeUserGuide();
      });
    }

    // Phím Escape để đóng modal hướng dẫn
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.userGuideModal && !this.userGuideModal.classList.contains('hidden')) {
        this.closeUserGuide();
      }
    });

    // Chuyển tab con (Segmented Control)
    if (this.guideTabBtns) {
      this.guideTabBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const tabKey = btn.dataset.guideTab;
          if (tabKey) this.switchGuideTab(tabKey);
        });
      });
    }

    // Tự động mở lần đầu tiên (~0.8s sau khi tải dữ liệu, độc lập với tiến trình chơi)
    try {
      const hasSeen = localStorage.getItem('lj_guide_seen');
      if (!hasSeen) {
        setTimeout(() => {
          this.openUserGuide();
        }, 800);
      }
    } catch (_) {}
  }

  /**
   * Chuyển tab con trong modal hướng dẫn (journey | gallery)
   */
  switchGuideTab(tabKey) {
    if (!this.guideTabContents || !this.guideTabContents[tabKey]) return;

    if (this.guideTabBtns) {
      this.guideTabBtns.forEach((btn) => {
        const isActive = btn.dataset.guideTab === tabKey;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }

    Object.keys(this.guideTabContents).forEach((key) => {
      const content = this.guideTabContents[key];
      if (content) {
        if (key === tabKey) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      }
    });
  }

  /**
   * Mở modal hướng dẫn
   */
  openUserGuide() {
    if (!this.userGuideModal) return;
    this.switchGuideTab('journey');
    this.userGuideModal.classList.remove('hidden');
  }

  /**
   * Đóng modal hướng dẫn và lưu cờ đã xem vào localStorage
   */
  closeUserGuide() {
    if (!this.userGuideModal) return;
    this.userGuideModal.classList.add('hidden');
    try {
      localStorage.setItem('lj_guide_seen', 'true');
    } catch (_) {}
  }

  // ══════════════════════════════════════════════════════════════
  // HỘP THƯ GÓP Ý & TÂM SỰ (FEEDBACKS - PROFILE MODAL)
  // ══════════════════════════════════════════════════════════════

  /**
   * Khởi tạo các tham chiếu DOM và sự kiện cho Hộp thư góp ý
   */
  initFeedbacks() {
    this.feedbacksData = [];
    this.currentFeedbackUser = null;
    this.currentViewingFeedback = null;
    try {
      this.currentFeedbackUser = localStorage.getItem('lj_feedback_user') || null;
    } catch (_) {}

    // Thanh danh tính ở Tab 3 header
    this.notesCurrentUserName    = document.getElementById('notes-current-user-name');
    this.notesSwitchUserBtn      = document.getElementById('notes-switch-user-btn');

    // Badge số đếm chưa đọc trên 2 thẻ ngoài danh sách
    this.profileUnreadBadgePerson1 = document.getElementById('profile-unread-badge-person1');
    this.profileUnreadBadgePerson2 = document.getElementById('profile-unread-badge-person2');

    // Badge chấm đỏ trên Tab 3 bottom nav
    this.notesUnreadBadge        = document.getElementById('notes-unread-badge');

    // Modal xem chi tiết hồ sơ: khối hộp thư
    this.profileFeedbackSection      = document.getElementById('profile-feedback-section');
    this.profileFeedbackInboxWrap    = document.getElementById('profile-feedback-inbox-wrap');
    this.profileFeedbackInboxCount   = document.getElementById('profile-feedback-inbox-count');
    this.profileFeedbackLettersList  = document.getElementById('profile-feedback-letters-list');
    this.profileFeedbackInboxEmpty   = document.getElementById('profile-feedback-inbox-empty');
    this.profileFeedbackComposeWrap  = document.getElementById('profile-feedback-compose-wrap');
    this.profileFeedbackComposeTitle = document.getElementById('profile-feedback-compose-title');
    this.feedbackComposeInput        = document.getElementById('feedback-compose-input');
    this.feedbackCopyBtn             = document.getElementById('feedback-copy-btn');
    this.feedbackCopyBtnText         = document.getElementById('feedback-copy-btn-text');
    this.feedbackComposeSendBtn      = document.getElementById('feedback-compose-send-btn');

    // Modal chọn người dùng
    this.feedbackUserModal       = document.getElementById('feedback-user-modal');
    this.feedbackSelectPerson1   = document.getElementById('feedback-select-person1');
    this.feedbackSelectPerson2   = document.getElementById('feedback-select-person2');
    this.feedbackUserNamePerson1 = document.getElementById('feedback-user-name-person1');
    this.feedbackUserNamePerson2 = document.getElementById('feedback-user-name-person2');
    this.feedbackUserAvatarPerson1 = document.getElementById('feedback-user-avatar-person1');
    this.feedbackUserAvatarPerson2 = document.getElementById('feedback-user-avatar-person2');
    this.feedbackUserFallbackPerson1 = document.getElementById('feedback-user-fallback-person1');
    this.feedbackUserFallbackPerson2 = document.getElementById('feedback-user-fallback-person2');

    // Modal xem chi tiết thư (tự huỷ sau khi xem)
    this.feedbackDetailModal     = document.getElementById('feedback-detail-modal');
    this.feedbackDetailCloseX    = document.getElementById('feedback-detail-close-x');
    this.feedbackDetailCloseBtn  = document.getElementById('feedback-detail-close-btn');
    this.feedbackDetailSender    = document.getElementById('feedback-detail-sender');
    this.feedbackDetailTime      = document.getElementById('feedback-detail-time');
    this.feedbackDetailContent   = document.getElementById('feedback-detail-content');
    this.feedbackDetailStatus    = document.getElementById('feedback-detail-status');

    // Sự kiện đổi người dùng
    if (this.notesSwitchUserBtn) {
      this.notesSwitchUserBtn.addEventListener('click', () => this.openFeedbackUserModal());
    }

    // Sự kiện chọn người trong modal
    if (this.feedbackSelectPerson1) {
      this.feedbackSelectPerson1.addEventListener('click', () => this.setFeedbackUser('person1'));
    }
    if (this.feedbackSelectPerson2) {
      this.feedbackSelectPerson2.addEventListener('click', () => this.setFeedbackUser('person2'));
    }

    // Sự kiện sao chép nội dung
    if (this.feedbackCopyBtn) {
      this.feedbackCopyBtn.addEventListener('click', () => this.copyFeedbackContent());
    }

    // Sự kiện gửi góp ý
    if (this.feedbackComposeSendBtn) {
      this.feedbackComposeSendBtn.addEventListener('click', () => this.sendFeedback());
    }

    // Sự kiện đóng modal chi tiết
    if (this.feedbackDetailCloseX) {
      this.feedbackDetailCloseX.addEventListener('click', () => this.closeFeedbackDetailModal());
    }
    if (this.feedbackDetailCloseBtn) {
      this.feedbackDetailCloseBtn.addEventListener('click', () => this.closeFeedbackDetailModal());
    }
    if (this.feedbackDetailModal) {
      this.feedbackDetailModal.addEventListener('click', (e) => {
        if (e.target === this.feedbackDetailModal) this.closeFeedbackDetailModal();
      });
    }

    // Phím Escape đóng các modal liên quan
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.feedbackUserModal && !this.feedbackUserModal.classList.contains('hidden')) {
          this.closeFeedbackUserModal();
        }
        if (this.feedbackDetailModal && !this.feedbackDetailModal.classList.contains('hidden')) {
          this.closeFeedbackDetailModal();
        }
      }
    });

    // Lắng nghe sự kiện real-time lj:feedbacksUpdated
    window.addEventListener('lj:feedbacksUpdated', (e) => {
      this.feedbacksData = e.detail?.feedbacks || [];
      this.renderFeedbacks();
    });

    this.updateFeedbackUserDisplay();
    this.renderFeedbacks();
  }

  /**
   * Lấy tên hiển thị của person1 / person2 từ profilesData
   */
  getPersonDisplayName(personId) {
    const p = (this.profilesData && this.profilesData[personId]) || {};
    if (p.name && p.name.trim()) return p.name.trim();
    return personId === 'person1' ? 'Người thương 1' : 'Người thương 2';
  }

  /**
   * Cập nhật thông tin danh tính người dùng hiện tại lên UI
   */
  updateFeedbackUserDisplay() {
    if (this.notesCurrentUserName) {
      if (this.currentFeedbackUser) {
        this.notesCurrentUserName.textContent = this.getPersonDisplayName(this.currentFeedbackUser);
      } else {
        this.notesCurrentUserName.textContent = 'Chưa chọn';
      }
    }

    // Cập nhật tên trong modal chọn người
    if (this.feedbackUserNamePerson1) {
      this.feedbackUserNamePerson1.textContent = this.getPersonDisplayName('person1');
    }
    if (this.feedbackUserNamePerson2) {
      this.feedbackUserNamePerson2.textContent = this.getPersonDisplayName('person2');
    }

    // Cập nhật avatar trong modal chọn người
    ['person1', 'person2'].forEach(id => {
      const p = (this.profilesData && this.profilesData[id]) || {};
      const avatarEl = id === 'person1' ? this.feedbackUserAvatarPerson1 : this.feedbackUserAvatarPerson2;
      const fallbackEl = id === 'person1' ? this.feedbackUserFallbackPerson1 : this.feedbackUserFallbackPerson2;
      if (avatarEl && fallbackEl) {
        if (p.avatarUrl && p.avatarUrl.trim()) {
          avatarEl.src = p.avatarUrl.trim();
          avatarEl.classList.remove('hidden');
          fallbackEl.classList.add('hidden');
        } else {
          avatarEl.src = '';
          avatarEl.classList.add('hidden');
          fallbackEl.classList.remove('hidden');
        }
      }
    });
  }

  /**
   * Mở modal chọn danh tính person1 / person2
   */
  openFeedbackUserModal() {
    if (!this.feedbackUserModal) return;
    this.updateFeedbackUserDisplay();
    this.feedbackUserModal.classList.remove('hidden');
  }

  /**
   * Đóng modal chọn danh tính
   */
  closeFeedbackUserModal() {
    if (!this.feedbackUserModal) return;
    this.feedbackUserModal.classList.add('hidden');
  }

  /**
   * Thiết lập danh tính người dùng và lưu vào localStorage
   */
  setFeedbackUser(personId) {
    if (personId !== 'person1' && personId !== 'person2') return;
    this.currentFeedbackUser = personId;
    try {
      localStorage.setItem('lj_feedback_user', personId);
    } catch (_) {}
    this.closeFeedbackUserModal();
    this.updateFeedbackUserDisplay();
    this.renderFeedbacks();
    if (this.currentViewingPersonId) {
      this.openProfileViewModal(this.currentViewingPersonId);
    }
  }

  /**
   * Render khối Hộp thư góp ý bên trong modal xem chi tiết hồ sơ (#profile-view-modal)
   * @param {'person1' | 'person2'} personId
   */
  renderProfileFeedbackSection(personId) {
    if (!this.profileFeedbackSection) return;

    // Nếu thiết bị chưa chọn danh tính: mở modal chọn danh tính trước
    if (!this.currentFeedbackUser) {
      this.openFeedbackUserModal();
      return;
    }

    const isOwnProfile = personId === this.currentFeedbackUser;

    if (isOwnProfile) {
      // ── TRƯỜNG HỢP A: Hồ sơ CỦA CHÍNH MÌNH (Xem thư nhận được) ──
      if (this.profileFeedbackComposeWrap) {
        this.profileFeedbackComposeWrap.classList.add('hidden');
      }
      if (this.profileFeedbackInboxWrap) {
        this.profileFeedbackInboxWrap.classList.remove('hidden');
      }

      // Danh sách thư gửi TỚI mình (thư chưa đọc)
      const myLetters = (this.feedbacksData || [])
        .filter(f => f.receiver === personId)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      // Cập nhật badge số lượng
      if (this.profileFeedbackInboxCount) {
        if (myLetters.length > 0) {
          this.profileFeedbackInboxCount.textContent = `${myLetters.length} thư mới`;
          this.profileFeedbackInboxCount.classList.remove('hidden');
        } else {
          this.profileFeedbackInboxCount.classList.add('hidden');
        }
      }

      // Hiển thị danh sách hoặc thông báo trống
      if (myLetters.length === 0) {
        if (this.profileFeedbackLettersList) this.profileFeedbackLettersList.innerHTML = '';
        if (this.profileFeedbackInboxEmpty) this.profileFeedbackInboxEmpty.classList.remove('hidden');
      } else {
        if (this.profileFeedbackInboxEmpty) this.profileFeedbackInboxEmpty.classList.add('hidden');
        if (this.profileFeedbackLettersList) {
          this.profileFeedbackLettersList.innerHTML = '';
          myLetters.forEach(item => {
            const card = document.createElement('div');
            card.className = 'feedback-card is-unread';
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `Lời nhắn lúc ${this._formatFeedbackDate(item.createdAt)}`);

            const senderName = this.getPersonDisplayName(item.sender);
            const timeFormatted = this._formatFeedbackDate(item.createdAt);

            card.innerHTML = `
              <div class="feedback-card-header">
                <div class="feedback-card-meta-left">
                  <span class="feedback-card-sender">Từ: ${senderName}</span>
                  <span class="feedback-unread-badge">● Mới</span>
                </div>
                <span class="feedback-card-time">${timeFormatted}</span>
              </div>
              <div class="feedback-card-content">${this._escapeHtml(item.content || '')}</div>
              <div class="feedback-card-footer">
                <span class="feedback-card-hint">Chạm để đọc thư ✨</span>
                <span class="feedback-card-arrow">Chi tiết →</span>
              </div>
            `;

            card.addEventListener('click', () => this.openFeedbackDetail(item));
            card.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.openFeedbackDetail(item);
              }
            });

            this.profileFeedbackLettersList.appendChild(card);
          });
        }
      }
    } else {
      // ── TRƯỜNG HỢP B: Hồ sơ CỦA ĐỐI PHƯƠNG (Soạn thư gửi tới người này) ──
      if (this.profileFeedbackInboxWrap) {
        this.profileFeedbackInboxWrap.classList.add('hidden');
      }
      if (this.profileFeedbackComposeWrap) {
        this.profileFeedbackComposeWrap.classList.remove('hidden');
      }

      const targetName = this.getPersonDisplayName(personId);
      if (this.profileFeedbackComposeTitle) {
        this.profileFeedbackComposeTitle.textContent = `Gửi lời nhắn / Góp ý cho ${targetName}`;
      }
      if (this.feedbackComposeInput) {
        this.feedbackComposeInput.placeholder = `Viết những lời nhắn gửi chân thành tới ${targetName}...`;
      }
    }
  }

  /**
   * Sao chép nội dung trong ô textarea vào clipboard
   */
  copyFeedbackContent() {
    const text = this.feedbackComposeInput ? this.feedbackComposeInput.value.trim() : '';
    if (!text) {
      alert('Bạn hãy nhập đôi dòng tâm sự trước khi sao chép nhé 💛');
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (this.feedbackCopyBtnText) {
          const originalText = this.feedbackCopyBtnText.textContent;
          this.feedbackCopyBtnText.textContent = 'Đã sao chép ✓';
          setTimeout(() => {
            if (this.feedbackCopyBtnText) this.feedbackCopyBtnText.textContent = originalText;
          }, 2000);
        }
      }).catch(() => {
        alert('Không thể sao chép tự động. Bạn có thể chọn và sao chép thủ công nhé.');
      });
    } else {
      alert('Trình duyệt không hỗ trợ sao chép tự động.');
    }
  }

  /**
   * Gửi góp ý / tâm sự lên Firestore
   */
  async sendFeedback() {
    if (!this.currentFeedbackUser) {
      this.openFeedbackUserModal();
      return;
    }

    const content = this.feedbackComposeInput ? this.feedbackComposeInput.value.trim() : '';
    if (!content) {
      alert('Bạn hãy viết những lời nhắn nhủ trước khi gửi nhé 💛');
      if (this.feedbackComposeInput) this.feedbackComposeInput.focus();
      return;
    }

    const sender = this.currentFeedbackUser;
    const receiver = this.currentViewingPersonId || (sender === 'person1' ? 'person2' : 'person1');

    if (this.feedbackComposeSendBtn) {
      this.feedbackComposeSendBtn.disabled = true;
      this.feedbackComposeSendBtn.textContent = 'Đang gửi...';
    }

    const feedbackData = {
      content: content,
      sender: sender,
      receiver: receiver,
      createdAt: new Date().toISOString()
    };

    try {
      if (typeof window.__LJ_SEND_FEEDBACK === 'function') {
        await window.__LJ_SEND_FEEDBACK(feedbackData);
      } else {
        throw new Error('Chức năng gửi chưa sẵn sàng. Vui lòng kiểm tra kết nối mạng.');
      }

      if (this.feedbackComposeInput) {
        this.feedbackComposeInput.value = '';
      }
      alert('Đã gửi lời nhắn yêu thương thành công 💌');
    } catch (err) {
      console.warn('[LoveJourney] Lỗi gửi góp ý:', err);
      let errorMsg = 'Lỗi gửi lời nhắn: ';
      if (err && err.code === 'permission-denied') {
        errorMsg += 'Không có quyền ghi (Security Rules từ chối).';
      } else {
        errorMsg += (err.message || 'Vui lòng thử lại sau.');
      }
      alert(errorMsg);
    } finally {
      if (this.feedbackComposeSendBtn) {
        this.feedbackComposeSendBtn.disabled = false;
        this.feedbackComposeSendBtn.textContent = 'Gửi góp ý 💌';
      }
    }
  }

  /**
   * Cập nhật badge số đếm và cập nhật lại giao diện hộp thư
   */
  renderFeedbacks() {
    if (!Array.isArray(this.feedbacksData)) return;

    // Số đếm thư chưa đọc gửi tới person1 và person2
    const p1Count = this.feedbacksData.filter(f => f.receiver === 'person1').length;
    const p2Count = this.feedbacksData.filter(f => f.receiver === 'person2').length;

    // Badge trên thẻ person1 ngoài danh sách
    if (this.profileUnreadBadgePerson1) {
      this.profileUnreadBadgePerson1.textContent = p1Count;
      this.profileUnreadBadgePerson1.classList.toggle('hidden', p1Count === 0);
    }

    // Badge trên thẻ person2 ngoài danh sách
    if (this.profileUnreadBadgePerson2) {
      this.profileUnreadBadgePerson2.textContent = p2Count;
      this.profileUnreadBadgePerson2.classList.toggle('hidden', p2Count === 0);
    }

    // Badge trên bottom nav (chấm đỏ Tab 3) - chỉ hiện khi CHÍNH MÌNH có thư chưa đọc
    if (this.notesUnreadBadge) {
      const myCount = this.currentFeedbackUser
        ? this.feedbacksData.filter(f => f.receiver === this.currentFeedbackUser).length
        : 0;
      this.notesUnreadBadge.classList.toggle('hidden', myCount === 0);
    }

    // Nếu modal hồ sơ đang mở: cập nhật lại nội dung hộp thư bên trong modal
    if (this.profileViewModal && !this.profileViewModal.classList.contains('hidden') && this.currentViewingPersonId) {
      this.renderProfileFeedbackSection(this.currentViewingPersonId);
    }
  }

  /**
   * Mở modal xem chi tiết góp ý
   */
  openFeedbackDetail(item) {
    if (!item || !this.feedbackDetailModal) return;

    this.currentViewingFeedback = item;

    const isInbox = item.receiver === this.currentFeedbackUser;
    const targetPersonId = isInbox ? item.sender : item.receiver;
    const personPrefix = isInbox ? 'Từ: ' : 'Gửi tới: ';
    const targetName = this.getPersonDisplayName(targetPersonId);
    const timeFormatted = this._formatFeedbackDate(item.createdAt);

    if (this.feedbackDetailSender) {
      this.feedbackDetailSender.textContent = `${personPrefix}${targetName}`;
    }
    if (this.feedbackDetailTime) {
      this.feedbackDetailTime.textContent = timeFormatted;
    }
    if (this.feedbackDetailContent) {
      this.feedbackDetailContent.textContent = item.content || '';
    }
    if (this.feedbackDetailStatus) {
      if (isInbox) {
        this.feedbackDetailStatus.textContent = 'Thư sẽ tự động biến mất vĩnh viễn sau khi bạn đóng nhé ✨';
      } else {
        this.feedbackDetailStatus.textContent = 'Đang chờ đối phương đọc (thư sẽ tự biến mất khi người ấy đọc xong) ⏳';
      }
    }
    if (this.feedbackDetailCloseBtn) {
      this.feedbackDetailCloseBtn.textContent = isInbox ? 'Đã đọc & đóng thư ✨' : 'Đóng';
    }

    this.feedbackDetailModal.classList.remove('hidden');
  }

  /**
   * Đóng modal xem chi tiết góp ý và tự động xoá nếu người nhận vừa xem xong
   */
  closeFeedbackDetailModal() {
    if (!this.feedbackDetailModal) return;
    this.feedbackDetailModal.classList.add('hidden');

    if (this.currentViewingFeedback) {
      const item = this.currentViewingFeedback;
      this.currentViewingFeedback = null;

      // Chỉ xoá khỏi Firestore khi đúng NGƯỜI NHẬN đóng modal xem thư
      if (item.receiver === this.currentFeedbackUser && item.id) {
        // Xoá lạc quan khỏi danh sách hiển thị local ngay lập tức
        this.feedbacksData = this.feedbacksData.filter(f => f.id !== item.id);
        this.renderFeedbacks();

        if (typeof window.__LJ_DELETE_FEEDBACK === 'function') {
          window.__LJ_DELETE_FEEDBACK(item.id).catch(err => {
            console.warn('[LoveJourney] Lỗi xoá góp ý sau khi đọc:', err);
          });
        }
      }
    }
  }

  /**
   * Helper định dạng ngày giờ
   */
  _formatFeedbackDate(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const hours = String(d.getHours()).padStart(2, '0');
      const mins  = String(d.getMinutes()).padStart(2, '0');
      const day   = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year  = d.getFullYear();
      return `${hours}:${mins} ${day}/${month}/${year}`;
    } catch (_) {
      return '';
    }
  }

  /**
   * Helper escape HTML
   */
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    const startIdx = Math.min(game.maxUnlockedIndex || 0, Math.max(0, scenesData.length - 1));
    game.loadScene(startIdx);
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

