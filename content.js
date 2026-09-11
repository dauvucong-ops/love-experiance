/**
 * =============================================================================
 * CONTENT.JS — Nội dung văn bản của 7 cảnh trong Love Journey
 * =============================================================================
 * ĐÂY LÀ FILE BẠN SẼ TỰ CHỈNH NỘI DUNG THẬT.
 * Mọi thay đổi ở file này KHÔNG ảnh hưởng đến logic game hay kỹ thuật.
 *
 * CẤU TRÚC: Object SCENES_CONTENT, key là id scene (1–7).
 * File này PHẢI được load TRƯỚC data.js trong index.html.
 * =============================================================================
 */
const SCENES_CONTENT = {

  // ===== Kỷ niệm 1: Ngày đầu gặp gỡ =====
  1: {
    // Đoạn nhật ký ngắn (~2-4 câu), giọng văn cá nhân, hồi tưởng kỷ niệm.
    // Hiển thị TRƯỚC khi câu hỏi trắc nghiệm xuất hiện.
    journalEntry: "Hôm ấy trời dịu mát lạ thường. Anh nhớ như in khoảnh khắc lần đầu ánh mắt hai đứa chạm nhau giữa không gian quen thuộc ấy — tim anh đập nhanh hơn một nhịp, và anh biết câu chuyện của chúng mình bắt đầu từ đây...",

    // Câu hỏi trắc nghiệm liên quan đến kỷ niệm này.
    question: "Chúng ta gặp nhau lần đầu tiên ở đâu nhỉ?",

    // Đúng 4 lựa chọn. Đáp án đúng PHẢI khớp chính xác (kể cả dấu cách) với correctAnswer bên dưới.
    options: [
      "Quán cà phê góc phố",
      "Thư viện trường",
      "Buổi hòa nhạc indie",
      "Trạm xe buýt dưới mưa"
    ],

    // Đáp án đúng — phải khớp từng ký tự với 1 trong 4 options ở trên.
    correctAnswer: "Quán cà phê góc phố",

    // Gợi ý hiện ra khi người chơi trả lời sai. Nên mơ hồ, đủ để nhớ lại mà không lộ thẳng đáp án.
    hint: "Nơi có mùi hạt cà phê rang thơm lừng và tiếng nhạc jazz nhẹ nhàng...",

    // Chỉ dùng cho scene 7 (epilogue). Để null cho scene 1–6.
    epilogueMessage: null
  },

  // ===== Kỷ niệm 2: Buổi hẹn hò đầu tiên =====
  2: {
    journalEntry: "Buổi hẹn hò đầu tiên ngập tràn sự ngượng ngùng và bẽn lẽn. Cả hai đứa đều cố giữ vẻ tự nhiên nhất có thể, nhưng ánh mắt lúng túng và những câu chuyện vụng về đã nói lên tất cả...",
    question: "Món ăn đầu tiên chúng ta cùng nhau thưởng thức là món gì?",
    options: [
      "Bánh mì chảo",
      "Mì cay 7 cấp độ",
      "Pizza phô mai béo ngậy",
      "Kem ốc quế ven hồ"
    ],
    correctAnswer: "Pizza phô mai béo ngậy",
    hint: "Một món ăn người Ý nổi tiếng mà ai đó đã làm rơi tương cà lên áo...",
    epilogueMessage: null
  },

  // ===== Kỷ niệm 3: Lần đầu đi xem phim =====
  3: {
    journalEntry: "Rạp chiếu phim hôm ấy tối mờ và ấm áp. Thú thật là anh chẳng nhớ nhiều về nội dung phim, vì phần lớn thời gian anh chỉ mải ngắm nhìn nụ cười của em và chờ đợi khoảnh khắc khẽ chạm tay em...",
    question: "Bộ phim đầu tiên chúng ta xem chung rạp thuộc thể loại gì?",
    options: [
      "Phim kinh dị giật gân",
      "Phim hoạt hình đáng yêu",
      "Phim tình cảm lãng mạn",
      "Phim siêu anh hùng hành động"
    ],
    correctAnswer: "Phim hoạt hình đáng yêu",
    hint: "Có một chú gấu trúc ngộ nghĩnh và bạn đã cười suốt cả buổi...",
    epilogueMessage: null
  },

  // ===== Kỷ niệm 4: Chuyến đi xa đầu tiên =====
  4: {
    journalEntry: "Chuyến du lịch xa đầu tiên chỉ có hai đứa. Tạm gác lại mọi bộn bề thành phố, chiếc xe máy cũ bon bon trên con đèo đầy sương sớm. Cảm giác có em ngồi sau ôm chặt giữa tiết trời se lạnh thật sự bình yên...",
    question: "Chuyến du lịch xa đầu tiên của hai đứa là ở đâu?",
    options: [
      "Đà Lạt mù sương",
      "Biển xanh Nha Trang",
      "Phố cổ Hội An",
      "Đảo ngọc Phú Quốc"
    ],
    correctAnswer: "Đà Lạt mù sương",
    hint: "Thời tiết se lạnh 16 độ C và ly sữa đậu nành nóng hổi...",
    epilogueMessage: null
  },

  // ===== Kỷ niệm 5: Cùng nhau vượt qua thử thách =====
  5: {
    journalEntry: "Tình yêu không chỉ có hoa và nến, mà còn là những ngày cùng nhau nếm trải khó khăn. Cơn mưa rào bất chợt làm chết máy giữa đường tối, người ướt sũng nhưng hai đứa nhìn nhau cười xòa, nhận ra ta cần nhau đến nhường nào...",
    question: "Kỷ niệm nào khiến hai đứa cảm thấy gắn kết và hiểu nhau hơn nhất?",
    options: [
      "Cùng ôn thi thức trắng đêm",
      "Chiếc xe bị hỏng giữa cơn mưa lớn",
      "Cùng chuyển trọ dọn nhà",
      "Lần đầu cãi nhau rồi làm lành"
    ],
    correctAnswer: "Chiếc xe bị hỏng giữa cơn mưa lớn",
    hint: "Ướt nhẹp nhưng hai đứa lại nhìn nhau cười...",
    epilogueMessage: null
  },

  // ===== Kỷ niệm 6: Lời hứa bên hoàng hôn =====
  6: {
    journalEntry: "Một buổi chiều hoàng hôn buông nhuộm hồng cả bờ sông. Hai đứa ngồi cạnh nhau, chia nhau một chiếc tai nghe nhỏ, nghe bài hát thân quen và khẽ tựa đầu vào vai. Giây phút ấy, anh biết trái tim mình đã thuộc về nơi này...",
    question: "Bài hát nào gắn liền với giai điệu mà chúng ta hay nghe cùng nhau nhất?",
    options: [
      "Until I Found You",
      "Perfect",
      "Ánh Nắng Của Anh",
      "Dù Cho Tận Thế"
    ],
    correctAnswer: "Until I Found You",
    hint: "Bài hát chúng ta cùng đeo chung một bên tai nghe bên bờ sông...",
    epilogueMessage: null
  },

  // ===== Kỷ niệm 7: Hồi kết / Epilogue =====
  // Scene đặc biệt: KHÔNG có câu hỏi. Chỉ điền epilogueMessage.
  // journalEntry, question, options, correctAnswer, hint phải để null.
  7: {
    journalEntry: null,   // Không dùng cho epilogue
    question: null,       // Không có câu hỏi ở scene cuối
    options: null,        // Không có lựa chọn
    correctAnswer: null,  // Không có đáp án
    hint: null,           // Không có gợi ý

    // Lời nhắn kết thúc — hiển thị ở màn hình epilogue đặc biệt.
    // Có thể xuống dòng bằng \n. Độ dài gợi ý: 2–5 câu.
    epilogueMessage: "Cảm ơn em vì đã đồng hành cùng anh qua mọi khoảnh khắc ngọt ngào. Hành trình của chúng ta sẽ còn viết tiếp thật nhiều trang kỷ niệm mới..."
  }

};
