Thiết kế kế hoạch (không code) cho màn `zalo-campaign` như sau.

**Phương án**

1. `Inline panel` trong trang hiện tại (khuyến nghị)

- Thêm khối “Kết nối thủ công” ngay trên/dưới bảng campaign.
- Nhanh, ít đổi luồng, dễ rollout.

2. `Modal riêng` cho kết nối thủ công

- Gọn UI chính, thao tác tập trung.
- Nhưng khó theo dõi danh sách dài khi map nhiều người.

Khuyến nghị chọn **Phương án 1** để triển khai nhanh và giảm rủi ro.

**Thiết kế chức năng**

1. Bộ lọc đối tượng: `Học sinh | Giáo viên`.
2. Ô tìm kiếm theo tên (debounce).
3. Danh sách xổ ra theo bộ lọc + từ khóa.
4. Chọn 1 người từ danh sách.
5. Nhập/chọn `zalo_user_id` cần gắn.
6. Nút `Kết nối thủ công`.
7. Danh sách mapping hiện có bên dưới (theo filter), gồm:

- Tên
- Loại đối tượng
- Zalo ID
- Trạng thái
- Cập nhật lúc nào
- Người thao tác

**Ràng buộc nghiệp vụ (1-1)**

1. Mỗi người nội bộ chỉ có tối đa 1 `zalo_user_id`.
2. Một `zalo_user_id` không được gắn cho 2 người khác nhau.
3. Nếu đã có mapping:

- Cho phép `Thay thế` sau khi confirm.
- Lưu audit log (ai đổi, từ ID nào sang ID nào, thời gian).

**API/Backend plan**

1. `GET /zalo/manual-mappings/candidates?role=student|teacher&q=...`

- Trả danh sách tên để chọn.

2. `POST /zalo/manual-mappings`

- Body: `role`, `internal_id`, `zalo_user_id`.
- Validate 1-1, trả lỗi rõ ràng nếu conflict.

3. `GET /zalo/manual-mappings?role=...&q=...`

- Trả danh sách mapping đã có.

4. `PATCH /zalo/manual-mappings/{id}` (hoặc POST override)

- Dùng khi thay thế mapping.

5. Ghi audit log cho create/update.

**UI states và lỗi**

1. Empty state khi chưa có dữ liệu.
2. Loading state khi search/list.
3. Lỗi rõ nghĩa:

- “Học sinh đã có tài khoản Zalo khác”
- “Zalo ID đã gắn với người khác”
- “Không tìm thấy đối tượng theo tên”

4. Toast thành công/thất bại.

**Bảo mật và vận hành**

1. Chỉ role admin/campaign-manager được sửa mapping.
2. Chuẩn hóa input `zalo_user_id` trước khi lưu.
3. Rate limit nhẹ cho endpoint search.
4. Audit log bắt buộc.

**Kế hoạch triển khai**

1. Chốt schema + unique constraints cho mapping 1-1.
2. Làm API candidates/list/create/update + validation conflict.
3. Gắn UI filter + dropdown danh sách + submit mapping.
4. Thêm bảng mapping và thao tác thay thế.
5. Test:

- 1-1 conflict
- search theo tên
- đổi filter học sinh/giáo viên
- override flow + audit log

Nếu kế hoạch này OK, mình sẽ viết tiếp bản implementation plan chi tiết theo task nhỏ (BE/UI/Test/rollout).
