1. Thông số thiết kế (Typography & Color)

**Mã màu (Color):**

- Đây không phải là màu cam tươi nguyên bản mà là tone **cam cháy (Burnt Orange)** hoặc **cam đất** . Tone màu này chứa một chút sắc nâu đỏ, giúp nó hiển thị rất đằm và rõ nét trên nền sáng.
- **Mã HEX tham khảo:** `#D45B1E` hoặc `#D95A11`
- Dùng cho khối background số thứ tự (chữ trắng trên nền cam): `background-color: #D45B1E;`
- Dùng cho text: `color: #D45B1E;`

**Định dạng chữ (Typography):**

- **Font chữ (Font-family):** Các thiết kế này sử dụng phông chữ Sans-serif hiện đại, nét dày, mập mạp và hình học (giống với các font như _Montserrat, Poppins_ hoặc _Arial Black_ ).
- **Độ đậm (Font-weight):** Rất cao. Với tiêu đề (như "CLAUDE", "GEMINI"), độ đậm thường ở mức `font-weight: 800;` hoặc `900`. Với câu dẫn ("Mạnh hơn ChatGPT khi ->"), độ đậm ở mức `600` hoặc `700`.
- **Biến đổi chữ (Text-transform):** Tiêu đề chính luôn dùng viết hoa toàn bộ (`text-transform: uppercase;`) kết hợp với việc đẩy khoảng cách giữa các chữ cái ra một chút (`letter-spacing: 0.02em;`) để tạo sự mạch lạc, vững chãi.

### 2. Triết lý ứng dụng (Design Philosophy)

Sở dĩ thầy thấy kiểu chữ này "rõ nét và tinh tế" là nhờ vào kỹ thuật xử lý độ tương phản và không gian:

- **High Contrast (Độ tương phản cao):** Màu cam cháy này được đặt trên một nền không phải trắng tinh, mà là nền trắng hơi ngả sang màu be/kem rất nhạt (off-white) có gradient nhẹ. Sự kết hợp này làm giảm độ gắt của màn hình sáng, tôn màu cam lên làm điểm nhấn thị giác duy nhất.
- **Quy tắc nhấn mạnh (Emphasis Rule):** Màu cam chỉ được dùng cho **cấu trúc** (Số thứ tự, Tiêu đề chính, Sub-heading dẫn dắt). Toàn bộ nội dung diễn giải chi tiết bên dưới (các gạch đầu dòng) đều được trả về màu đen xám chuẩn (`#1F2937` hoặc `#333333`), có độ đậm bình thường (`font-weight: 400` hoặc `500`). Điều này giúp mắt không bị mỏi khi đọc nội dung dài.
