# Báo cáo phân tích lỗi hệ thống E-Learning: Lỗi trắng màn hình và "Unexpected end of JSON input"

## 1. Hiện tượng (Symptoms)
- **Học sinh đăng nhập:** Giao diện dashboard học sinh (`/student`) hiển thị một màn hình xám trắng hoàn toàn (React App bị crash).
- **Console Log / Network:** Xuất hiện lỗi `403 Forbidden` khi trình duyệt tự động gọi API `GET /api/students` và `GET /api/teachers`. Có log hiển thị lỗi `Unexpected end of JSON input` hoặc lỗi `TypeError Cannot destructure property...`.
- **Dưới góc độ Admin:** Giao diện một số trang như "Hồ sơ Giáo viên/HS" (`/users`) cũng thỉnh thoảng bị crash khi render.

---

## 2. Phân tích nguyên nhân cốt lõi (Root Cause)

Sau khi debug chi tiết, lỗi xảy ra do sự kết hợp của 3 vấn đề kiến trúc giữa Frontend và Backend:

### A. Vấn đề Phân quyền (Role Authorization) trên Backend
Trong file `backend/src/routes/students.ts`, API lấy danh sách học sinh đang phân quyền như sau:
```typescript
router.get('/', authenticateToken, authorizeRoles('ADMIN', 'MANAGER', 'TEACHER'), async (req, res) => { ... })
```
- **Hệ quả:** Account `STUDENT` không có quyền (role) truyền vào hàm này, dẫn đến server trả về `401/403 Forbidden`.
- **Tương tự:** API `/api/teachers` cũng không cho phép học sinh lấy dữ liệu.

### B. Vấn đề Tải dữ liệu toàn cục (Global Fetching) trên Frontend
Trong file `ui_components/src/store/modules/center/hooks.ts`, hàm `initialize()` được gọi chung khi load ứng dụng:
```typescript
initialize: async () => {
    const { fetchTeachers, fetchStudents, fetchClasses, fetchRooms } = get();
    await Promise.all([fetchTeachers(), fetchStudents(), fetchClasses(), fetchRooms()]);
}
```
- **Hệ quả:** Bất kể người dùng là Admin hay Học sinh thì giao diện đều cố gắng fetch toàn bộ danh sách `students` và `teachers`. Khi Học sinh đăng nhập, API ném ra lỗi 403, Data sẽ bị chặn, dẫn tới State `students` và `teachers` trong Zustand bằng mảng rỗng `[]`.

### C. Gây ra Error Crash (Blank Screen) trên Component
Khi mảng `students` bị rỗng:
1. Giao diện `ui_components/src/views/pages/student/student.tsx` sẽ truy xuất: 
   `const student = students.find(s => s.id === studentId);` (lúc này biến `student` là `undefined`).
2. Component sẽ render một block HTML báo lỗi không tìm thấy.
3. Tuy nhiên, các lỗi tiềm ẩn tiếp theo sẽ nổ ra ở các Component con hoặc Header khi cố truy cập các property của `undefined` khiến React bung lỗi *Runtime Crash* mà không có thẻ `ErrorBoundary` bao bọc -> Dẫn đến ứng dụng hiển thị một trang trắng/xám hoàn toàn.
4. Lỗi *"Unexpected end of JSON input"* thỉnh thoảng xảy ra do quá trình `response.json()` trong Store fetch cố gắng parse một response trống hoặc không hợp lệ khi API Call thất bại nhưng không được frontend try-catch đàng hoàng.

---

## 3. Đề xuất phương án sửa chữa cho chuyên gia (Solution)

Để hệ thống hoạt động ổn định, cần thực hiện các sửa đổi sau:

**Bước 1: Tách luồng (Decouple) Fetching theo Role**
Trong Frontend (`useCenterStore.ts`), hàm `initialize` nên kiểm tra role hiện tại thay vì fetch tất cả mù quáng:
```typescript
initialize: async () => {
    const { role } = useAuthStore.getState();
    const { fetchTeachers, fetchStudents, fetchClasses, fetchRooms } = get();
    
    // Admin / Manager / Teacher thì fetch tất cả
    if (role === 'ADMIN' || role === 'MANAGER' || role === 'TEACHER') {
        await Promise.all([fetchTeachers(), fetchStudents(), fetchClasses(), fetchRooms()]);
    } else if (role === 'STUDENT') {
        // Học sinh chỉ nên fetch Classes và Rooms, thông tin cá nhân thì Backend có thể cấu hình API GetMe riêng
        await Promise.all([fetchClasses(), fetchRooms()]);
    }
}
```

**Bước 2: Cho phép Học sinh truy cập API theo cách an toàn (Backend)**
Cần sửa lại endpoint `GET /api/students` ở backend để Học sinh có thể fetch, nhưng chỉ trả ra thông tin hồ sơ của *CHÍNH HỌC SINH ĐÓ* (Lọc bằng ID từ JWT) thay vì toàn bộ DB.
Ví dụ trong `backend/src/routes/students.ts`:
```typescript
router.get('/', authenticateToken, async (req: any, res) => {
   if (req.user.role === 'STUDENT') {
      const students = await prisma.student.findMany({ where: { id: req.user.studentId } });
      return res.json(students);
   }
   // Luồng cho admin...
});
```

**Bước 3: Bổ sung Try-Catch chống Crash cho Frontend**
Sửa lại tất cả các method `fetch...` trong `ui_components/src/store/modules/center/hooks.ts` bổ sung `try { ... } catch (e) { ... }` để tránh việc sập luôn app vì rớt API hay gặp JSON malformed. Bọc một `<ErrorBoundary>` bên ngoài UI Layout.

**Kết luận:** Sau khi áp dụng 3 điều trên, chức năng hiển thị mã QR Code học phí cho học sinh và cả giao diện Admin sẽ hoạt động hoàn hảo và không còn hiện tượng trắng trang hay lỗi JSON Input.
