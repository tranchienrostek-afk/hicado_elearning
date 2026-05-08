I'm using the writing-plans skill to create the implementation plan.

Mình sẽ không tính lại `số tiền` trong feature overview. Kế hoạch đúng là: **attendance overview chỉ tổng hợp buổi học đã diễn ra + trạng thái có mặt/vắng, còn số tiền gọi lại logic hiện có theo ca học/học phí**.

**Mục Tiêu**
Xây màn overview tại `/attendance` để thống kê số buổi học của học sinh trong một lớp theo: có nút overview ở màn hình hiện tại, hiểu không, nếu vào đó thì là màn hình hiện tại, nếu bấm xem danh sách điểm danh thì mới hiện tính năng mới này.

Hiển thị 

1. Một tháng.
2. Nhiều tháng.
3. Một khoảng thời gian tự chọn.

Chỉ số chính:

1. `Số buổi`: tổng buổi học đã diễn ra trong khoảng lọc.
2. `Có mặt`: số buổi học sinh được điểm danh có mặt.
3. `Vắng`: số buổi học sinh vắng.
4. `Số tiền`: dùng cách tính hiện có theo ca học/học phí.

**Luồng UI**

1. Thêm tab hoặc section `Tổng quan theo lớp` trong trang `/attendance`.
2. Bộ lọc gồm:

- Chọn lớp.
- Chọn kiểu thời gian: `Tháng`, `Nhiều tháng`, `Khoảng ngày`.
- Nếu chọn `Tháng`: chọn tháng/năm.
- Nếu chọn `Nhiều tháng`: chọn từ tháng đến tháng.
- Nếu chọn `Khoảng ngày`: chọn ngày bắt đầu và ngày kết thúc.

3. Sau khi lọc, hiển thị bảng học sinh:

- Tên học sinh.
- Số buổi.
- Có mặt.
- Vắng.
- Số tiền.

4. Có dòng tổng cuối bảng:

- Tổng số học sinh.
- Tổng lượt có mặt.
- Tổng lượt vắng.
- Tổng tiền.

**Nguyên Tắc Tính**

1. `Số buổi` chỉ tính các **buổi học đã diễn ra**, không lấy lịch dự kiến chưa học.
2. Một buổi được tính là đã diễn ra nếu trong hệ thống đã có record buổi học/session/attendance của lớp đó.
3. Với mỗi học sinh:

- `Có mặt` = count attendance status present.
- `Vắng` = count attendance status absent.
- `Số buổi` = số buổi đã diễn ra của lớp trong khoảng lọc mà học sinh thuộc lớp.
- `Số tiền` = gọi lại hàm/service hiện có đang tính tiền theo ca học và học phí.

4. Không tự tạo công thức tiền mới trong overview để tránh lệch với màn thu học phí hiện tại.

**Backend Plan**

1. Tìm service/hàm hiện có đang tính tiền theo ca học/học phí.
2. Tạo endpoint overview, ví dụ:

```http
GET /api/attendance/overview?class_id=...&from_date=...&to_date=...
```

3. Endpoint trả dữ liệu đã aggregate:

```json
{
  "class_id": "class_123",
  "from_date": "2026-05-01",
  "to_date": "2026-05-31",
  "summary": {
    "student_count": 12,
    "total_sessions": 8,
    "total_present": 86,
    "total_absent": 10,
    "total_amount": 4300000
  },
  "students": [
    {
      "student_id": "stu_1",
      "student_name": "Nguyen Van A",
      "session_count": 8,
      "present_count": 7,
      "absent_count": 1,
      "amount": 350000
    }
  ]
}
```

4. Query attendance theo `class_id` + khoảng ngày.
5. Group theo học sinh.
6. Gọi logic tính tiền hiện có cho từng học sinh trong cùng khoảng thời gian.
7. Trả lỗi rõ ràng nếu:

- Chưa chọn lớp.
- Khoảng ngày không hợp lệ.
- Lớp chưa có buổi học đã diễn ra.
- Không tìm thấy cấu hình học phí/ca học.

**Frontend Plan**

1. Thêm state filter:

- `classId`
- `periodType`
- `month`
- `fromMonth`
- `toMonth`
- `fromDate`
- `toDate`

2. Chuyển mọi kiểu lọc về `from_date` và `to_date` trước khi gọi API.
3. Thêm bảng overview trong `/attendance`.
4. Thêm loading state khi đổi filter.
5. Thêm empty state: “Chưa có buổi học đã diễn ra trong khoảng thời gian này”.
6. Format `số tiền` theo VND.
7. Cho phép export Excel sau nếu cần, nhưng không đưa vào scope đầu tiên.

**Test Plan**

1. Lớp có 8 buổi đã diễn ra trong tháng, học sinh A có mặt 7 vắng 1: API trả `session_count=8`, `present_count=7`, `absent_count=1`.
2. Lọc nhiều tháng: tổng hợp đúng qua ranh giới tháng.
3. Lọc khoảng ngày giữa tháng: chỉ lấy buổi nằm trong khoảng.
4. Học sinh chưa có attendance ở một buổi đã diễn ra: cần thống nhất rule, mặc định nên tính là `vắng` nếu buổi đó đã có điểm danh lớp.
5. Số tiền phải khớp với logic học phí hiện có cho cùng học sinh/cùng khoảng thời gian.
6. Lớp không có buổi đã diễn ra: trả danh sách rỗng, không lỗi 500.

**Thứ Tự Triển Khai**

1. Xác định đúng bảng/model attendance session và hàm tính tiền hiện có.
2. Viết test backend cho aggregate attendance overview.
3. Implement API overview.
4. Viết test cho logic mapping period filter sang date range.
5. Implement UI filter + bảng overview.
6. Test thủ công trên `/attendance` với 1 lớp có dữ liệu thật.
7. So sánh `số tiền` với màn học phí hiện tại để đảm bảo không lệch.

**Điểm Cần Chốt Khi Implement**
Rule quan trọng nhất còn lại: nếu một buổi học đã diễn ra nhưng học sinh không có record điểm danh riêng, hệ thống nên tính là `vắng` hay `chưa điểm danh`. Với overview quản lý lớp, mình khuyến nghị tính là `vắng` nếu buổi đó đã chốt điểm danh.
