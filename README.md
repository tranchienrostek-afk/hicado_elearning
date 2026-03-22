# 🎓 Hệ thống Quản lý Trung tâm Bồi dưỡng

> Phần mềm quản lý toàn diện dành cho các Trung tâm Giáo dục Hicado & Vạn Xuân.  
> Số hóa nghiệp vụ cốt lõi: Quản lý hồ sơ, Điểm danh, Tài chính, Lớp học, Phòng học & Báo cáo lợi nhuận.

---

## 📐 Kiến trúc hệ thống

Dự án được tổ chức theo mô hình **monorepo** với 3 module chính:

```
19_Elearning/
├── ui_components/       # 🖥️ Frontend Dashboard (React + Vite)
├── core_lms/            # ⚙️ Backend LMS Core (Next.js)
├── gamification_logic/  # 🏆 Module Gamification (future)
├── prd.md               # 📋 PRD v1 — Yêu cầu sản phẩm
├── prd_02.md            # 📋 PRD v2 — Chi tiết chức năng
└── home.html            # 🎨 Thiết kế UI/UX gốc (Reference)
```

---

## ⚡ Công nghệ sử dụng

| Layer        | Stack                                                      |
| ------------ | ---------------------------------------------------------- |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Zustand          |
| **Backend**  | Next.js 16, React 19, Radix UI, Shadcn, Zod               |
| **State**    | Zustand (persist → `localStorage`)                         |
| **Routing**  | React Router v6 (UI), Next.js App Router (Core)            |
| **Styling**  | Tailwind CSS 3/4, Glassmorphism Design System              |
| **Forms**    | React Hook Form + Zod Validation                           |
| **Auth**     | Role-Based Access Control (RBAC) — Kế toán & Giáo viên    |

---

## 🚀 Khởi chạy dự án

### Yêu cầu
- **Node.js** ≥ 18
- **npm** ≥ 9

### 1. Frontend Dashboard (`ui_components`)

```bash
cd ui_components
npm install
npm run dev
# → http://localhost:5173
```

### 2. Backend Core (`core_lms`)

```bash
cd core_lms
npm install
npm run dev
# → http://localhost:3000
```

---

## 👥 Phân quyền (RBAC)

| Vai trò          | Quyền hạn                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------- |
| **Kế toán**      | Toàn quyền: CRUD Giáo viên, Học sinh, Lớp học, Phòng học. Quản lý tài chính & Báo cáo.      |
| **Giáo viên**    | Chỉ xem lớp mình dạy. Điểm danh học sinh. Không truy cập dữ liệu tài chính.                 |

Chuyển đổi vai trò trực tiếp trên giao diện (Dev mode) bằng nút **Role Switcher** trên header.

---

## 📦 Modules & Tính năng

### 1. 🏠 Trang chủ — Center Capacity Dashboard
- **Timeline (Gantt)** hiển thị lịch học của các phòng theo ngày.
- **Lọc đa tầng**: Trung tâm (Hicado / Vạn Xuân), Thứ trong tuần, Tìm phòng.
- **Mã màu công suất**: Xanh (<60%), Xanh dương (60–90%), Đỏ (>90%).
- **Tooltip tương tác**: Hiển thị chi tiết lớp, sĩ số, khung giờ.

### 2. 👤 Quản lý Hồ sơ (Giáo viên & Học sinh)
- **CRUD đầy đủ**: Thêm / Sửa / Xóa / Tìm kiếm.
- **Bộ lọc thông minh**: Tìm theo tên, Lọc năm sinh.
- **Import Google Sheets**: Đồng bộ hàng loạt từ bảng tính.
- **Câu chuyện Học sinh** *(Student Story)*: Xem toàn bộ hành trình — lớp đang theo, lịch sử chuyên cần, tài chính cá nhân.

### 3. 📚 Quản lý Lớp học
- Tạo lớp, gán giáo viên, gán phòng, cấu hình thời khóa biểu.
- **Sĩ số tự động**: Chọn học sinh từ danh sách có sẵn.
- **Heatmap chuyên cần**: Lịch sử 60 ngày, mã màu theo tỷ lệ.
- **Danh sách học sinh**: Xem trực tiếp danh sách & nhảy vào "Câu chuyện" từng em.

### 4. 🏫 Quản lý Phòng học
- CRUD phòng học cho 2 cơ sở: **Hicado** & **Vạn Xuân**.
- Hiển thị sức chứa, ghi chú, trạng thái.

### 5. 💰 Tài chính & Học phí
- **Báo cáo THU**: Bảng chi tiết — Mã lớp, Tổng thu cần/đã nộp, Lợi nhuận.
- **Tính lương GV tự động**:
  ```
  Lương = Σ (Học phí buổi × Số buổi dạy × Tỷ lệ chiết khấu)
  ```
- **Webhook Simulator**: Giả lập tín hiệu ngân hàng → Tự động gạch nợ "ĐÃ NỘP".

### 6. ✅ Điểm danh
- Điểm danh theo lớp, theo vai trò giáo viên.
- Trạng thái: **Đi học** / **Nghỉ không phép** / **Xin nghỉ (Có phép)**.
- Dữ liệu liên kết trực tiếp với module Tài chính.

---

## 🗂️ Cấu trúc `ui_components`

```
src/
├── router/              # Định tuyến & phân quyền route
├── store/
│   └── modules/
│       ├── auth/        # Zustand Auth Store (role, login)
│       └── center/      # Zustand Center Store (data CRUD)
│           ├── types.ts # Type definitions
│           └── hooks.ts # Store + mock data
└── views/
    ├── layout/          # Sidebar, Header, Footer
    └── pages/
        ├── home/        # Dashboard Capacity Timeline
        ├── users/       # Quản lý GV & HS + Student Story
        ├── classes/     # Quản lý Lớp + Heatmap + Class Students
        ├── rooms/       # Quản lý Phòng học
        ├── finance/     # Báo cáo Tài chính
        ├── attendance/  # Điểm danh
        └── login/       # Trang đăng nhập
```

---

## 📊 Dữ liệu Mock (Dev Mode)

Hệ thống sử dụng **Zustand persist** với `localStorage` để lưu trữ dữ liệu demo:

| Đối tượng     | Số lượng | Ghi chú                                        |
| ------------- | -------- | ---------------------------------------------- |
| Giáo viên     | 2        | T1 (Toán), T2 (Tiếng Anh)                     |
| Học sinh      | 2        | S1 (Lê Văn C), S2 (Phạm Thị D)               |
| Lớp học       | 5        | Toán, Anh, Văn, Lý, Hóa — đa khung giờ       |
| Phòng học     | 4        | 2 Hicado (101, 102) + 2 Vạn Xuân (A1, A2)     |
| Điểm danh     | 10+      | Mock attendance với trạng thái LEAVE_REQUEST   |

> ⚠️ Xóa `localStorage` (DevTools → Application → Clear) để reset dữ liệu về trạng thái gốc.

---

## 🛣️ Roadmap

- [x] RBAC — Phân quyền Kế toán / Giáo viên
- [x] CRUD Giáo viên & Học sinh
- [x] Quản lý Lớp học & Thời khóa biểu
- [x] Quản lý Phòng học (Hicado & Vạn Xuân)
- [x] Center Capacity Dashboard (Timeline/Gantt)
- [x] Heatmap chuyên cần 60 ngày
- [x] Báo cáo Tài chính & Webhook Simulator
- [x] Student Story (Câu chuyện Học sinh)
- [ ] Tích hợp API ngân hàng thực tế (Open Banking)
- [ ] Export/Import Excel
- [ ] Module Gamification
- [ ] Mobile Responsive Optimization
- [ ] Multi-tenant (mở rộng cơ sở)

---

## 📜 License

MIT © 2025 — Trung tâm Giáo dục Quốc tế Hicado & Vạn Xuân
# hicado_elearning
