/**
 * Class GameController — điều khiển toàn bộ luồng game
 */
class GameController {
  /**
   * @param {Array<Object>} scenesData - Mảng 7 cảnh từ data.js
   */
  constructor(scenesData) {
    this.scenesData = scenesData;
    this.currentSceneIndex = 0;

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

    // Đăng ký GSAP MotionPathPlugin
    if (typeof gsap !== 'undefined' && typeof MotionPathPlugin !== 'undefined') {
      gsap.registerPlugin(MotionPathPlugin);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // buildJourneyPath — tạo chuỗi d="" cho #journey-path
  //   Dùng thuật toán Catmull-Rom → Cubic Bézier để nối mượt
  //   7 toạ độ pathCoordinate thành 1 đường cong liên tục.
  // ══════════════════════════════════════════════════════════════
  buildJourneyPath() {
    const pts = this.scenesData.map(s => s.pathCoordinate);

    // ── Scale toạ độ SVG (viewBox 1000×600) sang pixel map-container ──
    // Không cần: GSAP & MotionPathPlugin làm việc trong không gian
    // viewBox của SVG, nên dùng toạ độ gốc trực tiếp.

    // ── Catmull-Rom → Bezier helper ───────────────────────────
    // Với mỗi 4 điểm liên tiếp p0..p3, tính control points
    // của đoạn Bezier cubic từ p1 tới p2.
    const catmullToBezier = (p0, p1, p2, p3, alpha = 0.5) => {
      const t = alpha;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      return { cp1x, cp1y, cp2x, cp2y };
    };

    // Bổ sung điểm ảo ở hai đầu để đường cong giữ hướng đúng
    const extended = [
      { x: pts[0].x * 2 - pts[1].x, y: pts[0].y * 2 - pts[1].y },
      ...pts,
      { x: pts[pts.length - 1].x * 2 - pts[pts.length - 2].x,
        y: pts[pts.length - 1].y * 2 - pts[pts.length - 2].y }
    ];

    // Xây chuỗi d
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = extended[i];
      const p1 = extended[i + 1]; // pts[i]
      const p2 = extended[i + 2]; // pts[i+1]
      const p3 = extended[i + 3];
      const { cp1x, cp1y, cp2x, cp2y } = catmullToBezier(p0, p1, p2, p3);
      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${pts[i + 1].x} ${pts[i + 1].y}`;
    }

    this.journeyPath.setAttribute('d', d);

    // ── Render nhân vật (chấm tròn) tại điểm đầu tiên ──────
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
        this.journalContainer.addEventListener('animationend', () => {
          this.journalContainer.classList.add('hidden');
          this.journalContainer.classList.remove('fade-out');
          // Hiện question-box với slide-up
          this.questionBox.classList.remove('hidden');
          this.questionBox.classList.add('slide-up');
          this.questionBox.addEventListener('animationend', () => {
            this.questionBox.classList.remove('slide-up');
          }, { once: true });
          this.renderScene();
        }, { once: true });
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
}

// ══════════════════════════════════════════════════════════════
// Khởi động game khi DOM sẵn sàng
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (typeof SCENES_DATA === 'undefined') {
    console.error('[LoveJourney] Không tìm thấy SCENES_DATA. Kiểm tra data.js.');
    return;
  }

  const game = new GameController(SCENES_DATA);
  game.buildJourneyPath();
  game.loadScene(0);
});
