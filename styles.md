1. Tổng quan phong cách thiết kế

Trang web này sử dụng phong cách **Modern Card-Based UI** (Giao diện dạng thẻ hiện đại) kết hợp với hơi hướng **Clean & Minimalist** (Sạch sẽ & Tối giản).

Mục tiêu tối thượng của phong cách này là làm nổi bật nội dung (hình ảnh và tên sản phẩm) bằng cách loại bỏ các chi tiết trang trí rườm rà, sử dụng nền sáng và các mảng khối được phân chia rõ ràng thông qua đổ bóng mềm (soft shadow).

### 2. Triết lý thiết kế (Design Philosophy)

Để tái tạo lại cảm giác "đẹp và dễ chịu" của trang web này cho một chủ đề khác, bạn cần bám sát 4 nguyên tắc sau:

- **Content is King (Nội dung là trung tâm):** Hình ảnh chiếm 40-50% diện tích khung nhìn của một thẻ. Dù bạn làm web về khóa học, tin tức hay sản phẩm công nghệ, hình ảnh minh họa phải sắc nét và chiếm diện tích lớn.
- **Whitespace (Không gian thở):** Các khoảng trắng (padding, margin) được sử dụng rất hào phóng. Các phần tử không bao giờ nằm sát mép nhau, tạo cảm giác thanh lịch và không bị ngộp thông tin.
- **Thống nhất về độ cong (Border-radius consistency):** Từ viền ngoài cùng của trang, khung thẻ (card), hình ảnh bên trong, cho đến nút bấm đều tuân theo một tỷ lệ bo góc đồng nhất.
- **Phân cấp thị giác rõ ràng (Visual Hierarchy):** Mắt người dùng được dẫn dắt theo thứ tự: Hình ảnh -> Giá tiền (nổi bật trên ảnh) -> Tiêu đề chính -> Nút hành động.

---

### 3. Chi tiết Design System & Thuộc tính CSS

Đây là các thông số cốt lõi bạn có thể "bê" sang dự án của mình:

**Màu sắc (Color Palette):**

- **Nền tổng thể (Background):** Rất sáng, tạo độ tương phản nhẹ với thẻ trắng. (CSS: `background-color: #F8F9FA;`)
- **Nền thẻ (Card Surface):** Trắng tinh. (CSS: `background-color: #FFFFFF;`)
- **Màu nhấn (Accent Color):** Màu cam đất/nâu dùng cho icon, tên danh mục và chữ trong nút bấm. (CSS: `color: #D97706;` hoặc `#C25E00;`)
- **Tiêu đề (Heading Text):** Đen xám, không dùng đen tuyệt đối để giảm nhức mắt. (CSS: `color: #1F2937;`)
- **Đoạn văn phụ (Body Text):** Xám nhạt. (CSS: `color: #6B7280;`)

**Đổ bóng (Soft Shadow):**

Sự khác biệt của thiết kế cao cấp nằm ở shadow. Đổ bóng ở đây rất nhạt, lan tỏa rộng và lệch xuống dưới.

- CSS: `box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);`

**Bo góc (Border Radius):**

- Viền container ngoài cùng (đường viền đỏ trong ảnh): `border-radius: 24px;`
- Thẻ (Card): `border-radius: 16px;`
- Hình ảnh bên trong thẻ: `border-top-left-radius: 16px; border-top-right-radius: 16px;` (chỉ bo 2 góc trên để khớp với viền thẻ).
- Nút bấm (Button) và Tag giá: `border-radius: 8px;` hoặc `12px;`

**Nghệ thuật Typography:**

- **Font chữ:** Sử dụng các font Sans-serif hiện đại, hình học như _Inter, Poppins, hoặc Roboto_ .
- **Tên danh mục (Ví dụ: "CÀ PHÊ"):** Viết hoa toàn bộ, size nhỏ, chữ đậm và khoảng cách giữa các chữ rộng ra.
  - CSS: `text-transform: uppercase; font-size: 11px; font-weight: 600; letter-spacing: 0.05em;`
- **Tiêu đề (Ví dụ: "Latte"):** \* CSS: `font-size: 18px; font-weight: 700; margin-bottom: 8px;`
- **Mô tả (Description):** Cần dùng kỹ thuật "Line Clamp" để cắt bớt chữ nếu quá dài, đảm bảo các thẻ luôn có chiều cao bằng nhau.
  - CSS: `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;`

**Bố cục (Layout):**

- Khung chứa các thẻ sử dụng CSS Grid để chia cột đều đặn.
  - CSS: `display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 24px;`
