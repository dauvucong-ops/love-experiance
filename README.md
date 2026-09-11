# 💌 Love Experience — Quà tặng kỷ niệm tương tác

Một Web App nhỏ kể chuyện tình yêu — quà tặng bất ngờ dành riêng cho người quan trọng nhất.

## Cơ chế hoạt động

Nhân vật sẽ di chuyển dọc theo một **đường hành trình** qua **7 cảnh kỷ niệm**. Mỗi cảnh (1–6) ẩn sau một câu hỏi trắc nghiệm nhỏ: trả lời đúng để mở khóa ảnh/nhạc kỷ niệm và tiến sang cảnh tiếp theo. Cảnh thứ 7 là **Epilogue** — hiển thị lời nhắn kết thúc.

## Cấu trúc file

```
love_experiance/
├── index.html          ← Entry point (mở file này trên trình duyệt)
├── style.css           ← Giao diện lãng mạn, mobile-first
├── content.js          ← ✏️ NỘI DUNG VĂN BẢN (nhật ký, câu hỏi, hint...)
├── data.js             ← Dữ liệu kỹ thuật + merge → SCENES_DATA
├── main.js             ← Logic game (GameController class)
├── .nojekyll           ← Tắt Jekyll cho GitHub Pages
└── assets/
    ├── scene_1.jpg     ← Ảnh kỷ niệm 1 (thay file thật vào)
    ├── scene_2.jpg
    ├── scene_3.jpg
    ├── scene_4.jpg
    ├── scene_5.jpg
    ├── scene_6.mp3     ← Nhạc kỷ niệm 6
    └── scene_7.jpg     ← Ảnh epilogue
```

## Cách chỉnh nội dung

Mở file **`content.js`** — đây là file duy nhất cần chỉnh:
- `journalEntry`: đoạn nhật ký cảm xúc hiển thị trước câu hỏi
- `question` + `options` + `correctAnswer`: câu hỏi trắc nghiệm (4 lựa chọn, `correctAnswer` phải khớp chính xác 1 option)
- `hint`: gợi ý khi trả lời sai
- `epilogueMessage` (chỉ scene 7): lời nhắn kết thúc

## Chạy local (dùng VS Code Live Server)

1. Mở thư mục dự án trong VS Code.
2. Cài extension **Live Server** (nếu chưa có).
3. Chuột phải vào `index.html` → **"Open with Live Server"**.
4. Trình duyệt tự mở tại `http://127.0.0.1:5500/`.

> ⚠️ Không mở `index.html` trực tiếp bằng cách double-click — trình duyệt sẽ chặn load file JS do CORS policy với `file://` protocol.

## Stack công nghệ

- HTML5 · CSS3 · Vanilla JavaScript (ES6)
- [GSAP 3.12.5](https://gsap.com/) + MotionPathPlugin (load qua CDN)
- Không có framework, không back-end, không database

## Deploy lên GitHub Pages

```bash
# (Thực hiện sau khi đã tạo repo trên GitHub)
git remote add origin https://github.com/<username>/love_experiance.git
git branch -M main
git push -u origin main
```

Sau đó vào **Settings → Pages → Source: Deploy from branch `main`**.  
URL sau deploy: `https://<username>.github.io/love_experiance/`
