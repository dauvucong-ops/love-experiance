# TRẠNG THÁI DỰ ÁN (PROJECT STATUS)

Tài liệu ghi lại trạng thái kỹ thuật thực tế của dự án, được tạo và xác minh trực tiếp từ mã nguồn. Bất kỳ lập trình viên hoặc AI nào cũng có thể đọc tài liệu này để tiếp tục công việc ngay mà không cần tra cứu lại lịch sử trước đó.

---

## 1. TỔNG QUAN
- **Mục đích dự án**: Web App tương tác kể chuyện tình yêu nhẹ (quà tặng kỷ niệm), cơ chế: nhân vật di chuyển dọc theo SVG path qua các scene; mỗi scene hiển thị nhật ký ngắn trước khi trả lời câu hỏi trắc nghiệm; trả lời đúng để mở khóa di chuyển sang scene kế tiếp. Scene cuối (epilogue) hiển thị thông điệp kết bài trang trọng.
- **Phạm vi nội dung**: Đúng 7 scenes (6 scenes kỷ niệm/quiz + 1 scene epilogue).
- **Stack công nghệ thực tế** (xác minh từ mã nguồn):
  - HTML5, CSS3 (Mobile-First, Pure Vanilla CSS), Vanilla JavaScript (ES6, Class-based).
  - Thư viện chuyển động: GSAP v3.12.5 + MotionPathPlugin load qua CDN cdnjs (`index.html` L13-L14).
  - Không có `package.json`, không dùng npm/yarn, không build tool (Vite/Webpack), không framework (React/Vue), không back-end, không cơ sở dữ liệu.
  - Tương thích GitHub Pages: Sử dụng đường dẫn tương đối (`./`), có file `.nojekyll`, thẻ meta `noindex, nofollow`.
- **Đường dẫn thư mục gốc thực tế**: `D:\WorkSpace\AAA_Project\love_experiance` (xác nhận qua lệnh `Get-Location` trong PowerShell).

---

## 2. QUY TẮC / QUY ƯỚC CODE ĐANG ÁP DỤNG
- **Kiến trúc file tĩnh thuần túy**:
  - `index.html`: Entry point chứa DOM layout tĩnh và liên kết CDN/scripts.
  - `style.css`: Toàn bộ styling Mobile-first, gom vào 1 file CSS duy nhất với CSS Variables & Design Tokens.
  - `data.js`: Chứa dữ liệu tĩnh, gán vào biến toàn cục `SCENES_DATA`.
  - `main.js`: Chứa class điều khiển `GameController` và khởi tạo ứng dụng.
  - `assets/`: Chứa tài nguyên đa phương tiện (ảnh, audio).
- **Quy ước đường dẫn**: Tất cả liên kết tài nguyên bắt buộc dùng đường dẫn tương đối (ví dụ: `./style.css`, `./assets/scene_1.jpg`), tuyệt đối không dùng đường dẫn gốc bắt đầu bằng `/`.
- **Quy ước bảo mật/riêng tư**: Thẻ `<meta name="robots" content="noindex, nofollow">` bắt buộc có trong `<head>`.
- **Quy ước đặt tên**:
  - Biến dữ liệu: UPPER_SNAKE_CASE cho hằng số dữ liệu (`SCENES_DATA`).
  - Class: PascalCase (`GameController`).
  - Method/Thuộc tính: camelCase (`loadScene`, `currentSceneIndex`, `journalEntry`).
  - ID DOM: kebab-case (`#quiz-container`, `#journal-container`, `#journey-path`, `#continue-btn`).
- **Ngôn ngữ nội dung**: Tiếng Việt cho toàn bộ text UI, câu hỏi, dữ liệu nhật ký và chú thích code.

---

## 3. ĐÃ HOÀN THÀNH
Các thành phần đã được tạo và kiểm tra trực tiếp trong mã nguồn:

1. **Khung sườn HTML (`index.html`)**:
   - Khai báo viewport, meta robots `noindex, nofollow` (L5-L6).
   - Load CDN GSAP 3.12.5 và MotionPathPlugin (L13-L14).
   - Khung SVG bản đồ `#map-container`, `#journey-svg` (viewBox `0 0 1000 600`), `#journey-path`, và `#character` (L20-L30).
   - Khung giao diện quiz `#quiz-container`:
     - `#scene-info`: `#scene-indicator`, `#scene-title`.
     - `#journal-container`: `#journal-text`, `#continue-btn`.
     - `#question-box`: `#question-text`, `#options-list`.
     - `#hint-box`, `#feedback-message`, `#media-container`.
   - Khung hồi kết `#epilogue-container` kèm `#epilogue-title` và `#epilogue-message`.
   - Nạp tuần tự `./data.js` trước `./main.js`.
   *Nguồn xác nhận: `index.html` (toàn bộ 74 dòng).*

2. **Dữ liệu 7 cảnh hoàn chỉnh theo schema (`data.js`)**:
   - Đúng chính xác 7 objects trong mảng `SCENES_DATA` (id từ 1 đến 7).
   - Mỗi scene từ 1 đến 6 đều có trường `journalEntry` (đoạn văn nhật ký cá nhân đầy cảm xúc) đi kèm câu hỏi, 4 phương án lựa chọn, đáp án đúng, gợi ý, media.
   - Scene 7 (Epilogue): `journalEntry: null`, `question: null`, `options: null`, `correctAnswer: null`, `hint: null`, có `epilogueMessage` dạng chuỗi văn bản.
   - Tọa độ chính xác trên SVG (`pathCoordinate`): Scene 1 (80, 300), Scene 2 (220, 180), Scene 3 (380, 360), Scene 4 (540, 160), Scene 5 (700, 340), Scene 6 (840, 220), Scene 7 (920, 300).
   *Nguồn xác nhận: `data.js` L5-L141.*

3. **Thiết kế giao diện CSS toàn diện (`style.css`)**:
   - Thiết kế Mobile-First tối ưu cho màn hình quét QR (360px - 430px) và co giãn thanh lịch trên màn hình lớn.
   - Bảng màu ấm áp, lãng mạn: Kem ngà (`#fffaf6`), hồng phấn (`#fcedea`, `#fbebee`), đỏ đô (`#b84a5b`), vàng champagne (`#d4a373`), glassmorphism nhẹ (`rgba(255, 255, 255, 0.88)`).
   - Đầy đủ kiểu dáng và keyframe animation cho:
     - `#journal-container`: dáng trang thư/trích dẫn, viền mềm, hiệu ứng `journalSlideIn`.
     - `#continue-btn`: nút pill bo cong với gradient ấm, hiệu ứng hover/active.
     - `#question-box` & `.option-btn`: card câu hỏi và nút lựa chọn.
     - Phản hồi đúng/sai: `.is-correct` tỏa sáng (`pulseSuccess`), `.is-wrong` rung lắc (`shakeError`).
     - `#epilogue-container`: viền ánh kim rose-gold xoay lấp lánh, trái tim trang trí bay bổng, typography trang trọng.
     - `#map-container`, `#journey-svg`, `#character` (hiệu ứng pulse chấm sáng).
   *Nguồn xác nhận: `style.css` (toàn bộ 368 dòng).*

4. **Khung Class điều khiển (`main.js`)**:
   - Khai báo class `GameController` với constructor (nhận `scenesData`, đăng ký GSAP MotionPathPlugin, khởi tạo `currentSceneIndex = 0`).
   - 4 hàm STUB (`loadScene`, `checkAnswer`, `unlockNextScene`, `renderScene`) giữ nguyên trạng thái khung theo đúng ràng buộc.
   *Nguồn xác nhận: `main.js` L1-L63.*

5. **Cấu hình GitHub Pages & Thư mục Assets**:
   - File `.nojekyll` tồn tại ở thư mục gốc để vô hiệu hóa Jekyll build.
   - Thư mục `assets/` tồn tại với file giữ chỗ `assets/.gitkeep`.

---

## 4. ĐÃ LOẠI BỎ / KHÔNG CÒN DÙNG
- Giao diện CSS cũ (chỉ có reset CSS tối giản) đã được thay thế hoàn toàn bằng hệ thống CSS Mobile-First hoàn chỉnh.
- Không sử dụng: npm, Node modules, build tools, server/API, cơ sở dữ liệu.

---

## 5. ĐANG DANG DỞ / CHƯA HOÀN THIỆN
Các mục có bằng chứng cụ thể trong code đang chờ phase tiếp theo kết nối:

1. **Các method trong `GameController` (`main.js`) vẫn là STUB rỗng**:
   - `loadScene(index)` (`main.js` L23-L25): Chưa có code tải dữ liệu scene vào bộ nhớ hoạt động hay kích hoạt hiển thị.
   - `checkAnswer(selectedOption)` (`main.js` L31-L35): Chưa có code so sánh lựa chọn với `correctAnswer`, chưa có nhánh đúng/sai.
   - `unlockNextScene()` (`main.js` L43-L45): Chưa có logic tăng `currentSceneIndex`, chưa tích hợp GSAP tween di chuyển nhân vật dọc path.
   - `renderScene()` (`main.js` L51-L53): Chưa có code cập nhật DOM (chưa đưa `journalEntry`, `question`, `options` vào HTML).
2. **Khởi chạy ứng dụng chưa gọi hàm thực thi (`main.js` L57-L62)**:
   - Khi `DOMContentLoaded`, `new GameController(SCENES_DATA)` được tạo ra nhưng chưa gọi hàm bắt đầu game, giao diện tĩnh ban đầu chưa được điền dữ liệu.
3. **Logic chuyển bước giữa `journal-container` và `question-box`**:
   - HTML và CSS đã sẵn sàng (có `#journal-container`, `#continue-btn`, `#question-box`), nhưng chưa có sự kiện click cho `#continue-btn` để ẩn journal và hiện câu hỏi (sẽ làm ở phase sau trong `GameController`).
4. **Đường dẫn SVG thực tế (`index.html` L23)**:
   - Thẻ `<path id="journey-path" d="" ... />` vẫn đang có thuộc tính `d=""` rỗng.
5. **Thư mục tài nguyên thực tế (`assets/`) chưa có file media thật**:
   - Hiện chỉ có `assets/.gitkeep`.

---

## 6. VẤN ĐỀ / RỦI RO ĐÃ BIẾT
1. **Chưa khởi tạo Git Repository**: Chạy `git status` trả về `fatal: not a git repository`. Chưa có version control cục bộ.
2. **Rủi ro lỗi GSAP MotionPath khi path rỗng**: Thuộc tính `d=""` của `#journey-path` cần chuỗi SVG path hợp lệ trước khi gọi tween di chuyển.
3. **Lỗi 404 khi load media**: Cần xử lý ảnh/audio fallback khi file trong thư mục `assets/` chưa có.

---

## 7. VIỆC TIẾP THEO ĐỀ XUẤT (THEO THỨ TỰ ƯU TIÊN)
1. **Nối logic `GameController` trong `main.js`**:
   - Viết `renderScene()`: render thông tin scene, `journalEntry`, ẩn `#question-box` ban đầu.
   - Gắn sự kiện click cho `#continue-btn`: chuyển mượt từ `journal-container` sang `question-box`.
   - Viết `checkAnswer(selectedOption)`: kiểm tra đúng/sai, thêm class `.correct` / `.wrong`, hiển thị hint nếu sai.
   - Viết `unlockNextScene()`: kích hoạt mở khóa media, tăng scene index.
2. **Vẽ chuỗi SVG Path và hoàn thiện nhân vật**:
   - Thêm tọa độ đường cong `d="..."` nối 7 điểm mốc vào `#journey-path`.
   - Vẽ hình nhân vật (trái tim hoặc avatar) trong `#character`.
3. **Tích hợp chuyển động GSAP MotionPath**:
   - Dùng GSAP tween đưa `#character` di chuyển dọc `#journey-path` khi trả lời đúng.
4. **Bổ sung tài nguyên ảnh/audio vào `assets/`**:
   - Thêm file ảnh kỷ niệm và nhạc nền/lời nhắn thực tế.

---

## 8. LỊCH SỬ CẬP NHẬT TÀI LIỆU NÀY
- 2026-09-11 (Lần 2): Cập nhật sau khi hoàn thành thêm `journalEntry` trong `data.js`, thêm `#journal-container` và `#continue-btn` trong `index.html`, và thiết kế lại toàn bộ `style.css` Mobile-First với giao diện lãng mạn, animation mượt mà.
