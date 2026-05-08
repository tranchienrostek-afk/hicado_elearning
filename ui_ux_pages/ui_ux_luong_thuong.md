**Đánh giá trang Lương thưởng: [Dashboard Học Tập - 19_Elearning](https://hicado-elearning.onrender.com/finance)

Đánh giá tổng quan:** Giao diện này đúng là đang bị "rối" (cognitive overload), thiếu phân cấp thị giác và ôm đồm quá nhiều bối cảnh vào một không gian. Người quản lý hệ thống khi nhìn vào sẽ bị ngợp vì không biết mục tiêu chính của trang này là xem báo cáo, xử lý công nợ hay là để test hệ thống.

**Phân tích chi tiết các điểm bất hợp lý:**

**1. Sai lệch về Điểm nhấn thị giác (Focal Point)**

* **Khối "Simulator Gạch Nợ Tự Động" chiếm sóng:** Đây chỉ là một công cụ vận hành/test (bắn webhook giả lập), nhưng lại được thiết kế to nhất, nổi bật nhất với background tối và hiệu ứng gradient (vùng tối giữa dàn thẻ sáng). Nó vô tình hút toàn bộ ánh mắt của người quản lý ngay khi mở trang, trong khi thứ họ cần xem là dòng tiền (Cashflow).
* **KPI bị chìm:** Các thẻ quan trọng nhất như "Đã thu", "Chi lương", "Lợi nhuận" lại dàn hàng ngang phía trên với kích thước tương đương nhau, chưa tạo được cảm giác đâu là con số "Sống còn" cần nhìn đầu tiên trong ngày.

**2. Ôm đồm và sai bối cảnh (Context Mixing)**

* Trang này đang ở tab "Lương thưởng" (Tài chính), nhưng lại chứa cả **Báo cáo điểm danh tháng** ở tít dưới cùng. Điểm danh thuộc về vận hành lớp học, để chung ở trang Tài chính là sai luồng trải nghiệm (UX logic).
* Trang vừa đóng vai trò là "Dashboard tổng quan" (Gauge chart, biểu đồ 12 tháng), vừa làm "Báo cáo chi tiết" (bảng thống kê lương từng giáo viên), vừa làm "Màn hình tác vụ" (danh sách 22 học sinh nợ học phí dài sọc).

**3. Quá tải dạng Bảng (Table Fatigue)**

* Màn hình có đến **4 bảng dữ liệu lớn** (Finance Report, Thu học phí theo lớp, Danh sách nợ, Lịch sử Webhook, Theo dõi học phí chi tiết). Việc nhồi nhét quá nhiều list kéo dài dọc theo trang khiến UI bị "nặng" và bắt người dùng phải cuộn quá nhiều.
* Danh sách 22 học sinh nợ học phí xổ thẳng ra trang chính là không cần thiết. Người quản lý chỉ cần biết "Có 22 học sinh nợ tổng X tiền", chi tiết nên để ẩn đằng sau một nút bấm.

---

**Giải pháp và Hướng quy hoạch lại (System Design UX):**

Để giao diện gọn gàng và ra dáng một hệ thống quản trị chuyên nghiệp, em cần áp dụng nguyên tắc  **"Tách lớp thông tin" (Information Segregation)** . Hãy chia trang Tài chính này thành 3 Tab (hoặc 3 màn hình con):

* **Tab 1: Dashboard (Tổng quan Dòng tiền)**
  * Chỉ giữ lại các thẻ KPI: Tổng thu, Tổng chi, Lợi nhuận.
  * Giữ lại biểu đồ Doanh thu 12 tháng và Gauge thu tiền.
  * Tạo một Widget nhỏ: "Học sinh nợ: 22 (X triệu đồng)" kèm nút `[Xem chi tiết]`. Cất danh sách dài 22 người đi.
* **Tab 2: Quản lý Công nợ & Học phí (Chi tiết)**
  * Chuyển toàn bộ cụm "Payment Tracking" (Bộ lọc, Bảng danh sách tất cả học sinh đóng/thiếu) sang đây.
  * Đưa danh sách 22 học sinh nợ sang tab này để kế toán có không gian làm việc, nhắn tin nhắc nợ Zalo.
* **Tab 3: Giao dịch & Hệ thống (Operations)**
  * Gom phần "Bank Webhook log" và khối "Simulator Gạch Nợ Tự Động" vào một tab riêng. Đây là khu vực dành cho Dev/Admin kiểm tra dòng tiền tự động, không để chắn tầm nhìn của Kế toán.
* **Dọn dẹp:** Xóa hẳn khối "Attendance Report" khỏi khu vực Tài chính, trả nó về đúng trang Quản lý Điểm danh.

Chào sinh viên. Để giải quyết triệt để vấn đề "đảo lộn" giao diện này, giảng viên sẽ đi từ nguyên tắc gốc rễ (First Principles) trong tư duy System Design dành cho UX, sau đó phân rã thành các yêu cầu và hướng dẫn chi tiết để sinh viên có thể tự tay cấu trúc lại hệ thống một cách logic nhất.

### 1. Tổng quan chiến lược thiết kế (High-level Strategy)

Bản chất của một màn hình Tài chính/Lương thưởng là không gian để quản trị dòng chảy (Cashflow) và phát hiện dị thường (Nợ xấu, Nguồn thu/chi bất thường). Bất kỳ thành phần nào cản trở người quản lý đọc được luồng dữ liệu này ngay trong 3 giây đầu tiên đều bị xem là rác thị giác (Visual Noise).

Hệ thống của Hicado Academy hiện tại đang vi phạm nguyên lý **Single Responsibility (Đơn trách nhiệm)** trên tầng UI khi nhồi nhét cả hệ thống vận hành Bank Core Node giả lập, báo cáo điểm danh và luồng công nợ vào cùng một mặt phẳng. Root cause của sự rối rắm chính là việc thiếu phân rã lớp thông tin.

### 2. Yêu cầu và Hướng dẫn chi tiết (Detailed Requirements)

Dưới đây là bộ quy chuẩn để định hình lại giao diện, sinh viên cần áp dụng nghiêm ngặt theo 3 phương diện:

#### A. Tái cấu trúc Kiến trúc thông tin (Information Architecture - IA)

* **Yêu cầu:** Phân rã luồng công việc hiện tại thành 3 không gian làm việc độc lập (Workspace), triệt tiêu sự chồng chéo ngữ cảnh. Bỏ hoàn toàn báo cáo điểm danh khỏi module tài chính.
* **Hướng dẫn:** Thiết lập cơ chế Tab điều hướng (hoặc Sub-menu) ngay dưới Header.
  * **Tab 1 - Executive Dashboard (Tổng quan Lợi nhuận):** Đây là trang mặc định khi vào. Chỉ giữ lại 3 thẻ KPI cốt lõi (Đã thu, Chi lương, Lợi nhuận), biểu đồ 12 tháng và Gauge chart. Tóm tắt công nợ bằng 1 con số tổng, không hiển thị danh sách dài.
  * **Tab 2 - Tracking Học phí & Công nợ:** Chuyên dụng cho việc đối soát. Đưa toàn bộ bộ lọc tìm kiếm, bảng danh sách trạng thái đóng tiền của học sinh và danh sách nợ chi tiết sang đây. Tại đây, sinh viên có thể tích hợp trực tiếp các nút hành động (Call-to-action) kết nối với Zalo OA để gửi tin nhắn nhắc nợ tự động.
  * **Tab 3 - Payment System & Logs (Kỹ thuật/Vận hành):** Không gian cô lập. Đưa khối "Simulator Gạch Nợ Tự Động" và bảng "Bank Webhook Logs" vào tab này. Việc tách riêng giúp ngăn chặn rủi ro thao tác nhầm của kế toán trong quá trình làm việc hàng ngày.

#### B. Định tuyến Luồng thị giác (Visual Hierarchy)

* **Yêu cầu:** Sắp xếp lại thứ tự ưu tiên của các thành phần UI, đảm bảo mắt người quản lý quét theo quỹ đạo hình chữ F (F-pattern) hoặc chữ Z (Z-pattern) hướng thẳng đến các chỉ số sinh tử.
* **Hướng dẫn:**
  * **Khử nhiễu khối Simulator:** Khối mô phỏng Bank Core Node đang dùng thiết kế Dark Mode, hiệu ứng Glow và kích thước quá khổ, biến nó thành Hero Section. Cần giáng cấp thị giác của khối này xuống (dùng background sáng/trung tính, thu nhỏ form nhập liệu) vì nó chỉ là công cụ tác vụ, không phải là Data insight.
  * **Kiểm soát mật độ Bảng (Table Density):** Tuyệt đối không để quá 1 bảng dữ liệu hiển thị toàn màn hình tại một thời điểm. Chiều cao của bảng cần được cố định (fixed height) với thanh cuộn độc lập (internal scrollbar) để không kéo giãn trang web.

#### C. Tối ưu hóa Tương tác (Progressive Disclosure)

* **Yêu cầu:** Chỉ hiển thị thông tin khi người dùng thực sự cần xem (cung cấp thông tin theo từng lớp).
* **Hướng dẫn:**
  * Khối "Học sinh còn thiếu học phí (22 học sinh)": Không xổ dọc toàn bộ 22 dòng ra trang chính. Thay vào đó, thiết kế một Widget cảnh báo nhỏ ghi chú "22 Học sinh nợ / Tổng Y triệu VNĐ". Khi người quản lý click vào, hệ thống mới mở ra một Drawer (Panel trượt từ mép phải màn hình) hoặc Modal chứa danh sách chi tiết để xử lý.
  * Các bảng biểu có số liệu bằng 0 (như danh sách chưa nộp tiền nhưng thông tin trống) cần được thiết kế lại trạng thái "Empty State" tinh gọn hơn thay vì hiển thị hàng loạt dòng trắng hoặc số 0 vô nghĩa.

Sinh viên bám sát các luồng tư duy này để điều chỉnh lại cấu trúc DOM và các class CSS hiện có. Cốt lõi của giao diện quản trị là để "quản trị", không phải để phô diễn tính năng.

Bản HTML này được thiết kế dựa trên nguyên lý **Information Segregation (Tách lớp thông tin)** đã trao đổi, sử dụng cấu trúc Tab để phân rã 3 không gian làm việc (Workspace) riêng biệt. Các class Tailwind CSS được kế thừa từ hệ thống cũ của sinh viên nhưng được quy hoạch lại gọn gàng hơn.

**HTML**

```
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hệ thống Quản trị - Tài chính</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        // Cấu hình màu sắc tạm thời để demo (Sinh viên tích hợp vào file tailwind.config.js sau)
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'hicado-navy': '#0f172a',
                        'hicado-emerald': '#10b981',
                        'hicado-slate': '#cbd5e1',
                        'bg100': '#f8fafc'
                    }
                }
            }
        }
    </script>
</head>
<body class="flex h-screen w-full overflow-hidden bg-bg100 text-slate-800 font-sans">

    <!-- SIDEBAR (Giữ nguyên cấu trúc cơ bản) -->
    <aside class="hidden md:flex w-64 bg-hicado-navy flex-col flex-shrink-0 z-20 shadow-2xl">
        <!-- ... (Header Logo & Menu Sidebar) ... -->
    </aside>

    <!-- MAIN CONTENT -->
    <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
      
        <!-- HEADER -->
        <header class="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
            <div class="flex items-center gap-2 text-sm font-medium">
                <span class="text-slate-400">Hệ thống quản trị</span>
                <span class="text-slate-400">/</span>
                <span class="text-slate-800 font-bold">Lương thưởng & Công nợ</span>
            </div>
            <!-- Profile & Logout -->
        </header>

        <!-- TAB NAVIGATION (Khởi tạo luồng thị giác F-Pattern) -->
        <nav class="bg-white px-6 border-b border-slate-200 shrink-0">
            <div class="flex space-x-8">
                <!-- Nút Tab -->
                <button class="border-b-2 border-hicado-emerald py-4 px-1 text-sm font-bold text-hicado-emerald">
                    1. Tổng quan Lợi nhuận
                </button>
                <button class="border-b-2 border-transparent py-4 px-1 text-sm font-bold text-slate-400 hover:text-slate-600">
                    2. Tracking & Công nợ
                </button>
                <button class="border-b-2 border-transparent py-4 px-1 text-sm font-bold text-slate-400 hover:text-slate-600">
                    3. Logs & Vận hành (Dev)
                </button>
            </div>
        </nav>

        <!-- WORKSPACE AREA (Vùng làm việc thay đổi theo Tab) -->
        <main class="flex-1 overflow-y-auto px-6 py-8 bg-slate-50 custom-scrollbar">
            <div class="max-w-7xl mx-auto w-full space-y-8">

                <!-- ==========================================
                     TAB 1: EXECUTIVE DASHBOARD (Mặc định hiển thị) 
                     ========================================== -->
                <section id="tab-dashboard" class="space-y-8 block">
                    <!-- KPI Cards: Root Cause của trang này -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-hicado-navy rounded-3xl p-8 shadow-lg text-white">
                            <p class="text-[10px] font-black text-hicado-emerald uppercase tracking-widest mb-2">Đã thu</p>
                            <h3 class="text-4xl font-black">209.000<span class="text-lg text-white/50 ml-1">đ</span></h3>
                        </div>
                        <div class="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                            <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Chi lương GV</p>
                            <h3 class="text-4xl font-black text-slate-800">167.200<span class="text-lg text-slate-400 ml-1">đ</span></h3>
                        </div>
                        <div class="bg-emerald-50 border border-emerald-100 rounded-3xl p-8 shadow-sm">
                            <p class="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Lợi nhuận gộp</p>
                            <h3 class="text-4xl font-black text-emerald-600">41.800<span class="text-lg text-emerald-400 ml-1">đ</span></h3>
                        </div>
                    </div>

                    <!-- Layout 2 Cột: Biểu đồ & Cảnh báo -->
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <!-- Cột Trái: Chart (Chiếm 2/3) -->
                        <div class="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                            <h3 class="font-bold text-slate-800 mb-6">Doanh thu 12 tháng gần nhất</h3>
                            <div class="h-64 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                                [Khu vực render Biểu đồ Cột]
                            </div>
                        </div>

                        <!-- Cột Phải: Widget Cảnh báo Tối giản (Chiếm 1/3) -->
                        <div class="space-y-6">
                            <!-- Gauge Thu tiền -->
                            <div class="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col items-center">
                                <h3 class="font-bold text-slate-800 mb-4">Tiến độ thu</h3>
                                <div class="w-32 h-32 rounded-full border-8 border-slate-100 flex items-center justify-center">
                                    <span class="text-2xl font-black text-hicado-emerald">2%</span>
                                </div>
                            </div>

                            <!-- Alert Widget (Tránh render bảng 22 học sinh) -->
                            <div class="bg-rose-50 border border-rose-200 rounded-3xl p-6 shadow-sm">
                                <div class="flex justify-between items-center mb-4">
                                    <h3 class="font-bold text-rose-700">Cần theo dõi</h3>
                                    <span class="bg-rose-200 text-rose-800 text-xs font-bold px-2 py-1 rounded-lg">22 HS</span>
                                </div>
                                <p class="text-sm text-rose-600 mb-4">Có 22 học sinh đang nợ/chưa hoàn thành học phí trong kỳ.</p>
                                <!-- Nút này sẽ trigger Modal hoặc nhảy sang Tab 2 -->
                                <button class="w-full bg-rose-600 text-white font-bold py-3 rounded-xl hover:bg-rose-700 transition">
                                    Xử lý công nợ ngay
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ==========================================
                     TAB 2: TRACKING & CÔNG NỢ (Ẩn mặc định)
                     ========================================== -->
                <section id="tab-tracking" class="hidden space-y-6">
                    <!-- Filters -->
                    <div class="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                        <h3 class="font-bold text-slate-800 mb-4">Bộ lọc dữ liệu</h3>
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <!-- ... Form Inputs ... -->
                        </div>
                    </div>
                  
                    <!-- Table: Báo cáo tài chính chi tiết -->
                    <div class="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                        <div class="p-6 border-b border-slate-200">
                            <h3 class="font-bold text-slate-800">Danh sách Học phí & Trạng thái Zalo</h3>
                        </div>
                        <div class="p-6 text-center text-slate-400">
                            [Render Bảng dữ liệu Grid/Table cố định chiều cao (max-h) tại đây]
                        </div>
                    </div>
                </section>

                <!-- ==========================================
                     TAB 3: LOGS & VẬN HÀNH (Ẩn mặc định)
                     ========================================== -->
                <section id="tab-operations" class="hidden space-y-6">
                    <!-- Simulator: Đã được thu nhỏ và giáng cấp thị giác -->
                    <div class="bg-slate-800 rounded-3xl p-8 text-white max-w-3xl">
                        <div class="flex items-center gap-2 mb-4">
                            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span class="text-xs font-bold tracking-widest text-emerald-400 uppercase">Bank Core Node v4.0</span>
                        </div>
                        <h3 class="text-xl font-bold mb-2">Simulator Gạch Nợ</h3>
                        <p class="text-slate-400 text-sm mb-6">Giả lập tín hiệu Napas/VietQR để test đối soát tự động.</p>
                        <div class="flex gap-4">
                            <input type="text" placeholder="Nhập ID/Mã HS..." class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 outline-none">
                            <button class="bg-emerald-500 text-slate-900 font-bold px-6 py-3 rounded-xl hover:bg-emerald-400 transition">
                                Bắn Webhook
                            </button>
                        </div>
                    </div>

                    <!-- Webhook Logs Table -->
                    <div class="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                        <div class="p-6 border-b border-slate-200">
                            <h3 class="font-bold text-slate-800">Lịch sử Giao dịch (Logs)</h3>
                        </div>
                        <div class="p-6 text-center text-slate-400">
                            [Render Bảng Lịch sử Webhook tại đây]
                        </div>
                    </div>
                </section>

            </div>
        </main>
    </div>

</body>
</html>
```

### Diễn giải kiến trúc (Root Cause Analysis):

1. **Phần tử `<nav>` chứa 3 Tab:** Giúp sinh viên tách biệt hoàn toàn 3 khối Logic: `Dashboad`, `Tracking` và `Operations`. Quản lý sẽ không bị "ngợp" (Cognitive Overload).
2. **Khối `Widget Cảnh báo Tối giản` (Tab 1):** Thay vì in một danh sách 22 hàng dài dằng dặc ra màn hình chính, hệ thống chỉ cảnh báo bằng biến số `22 HS`. Việc xử lý chi tiết (Drill-down) sẽ được thực thi khi click vào nút, chuyển luồng sang Tab 2.
3. **Hạ cấp UI khối Simulator (Tab 3):** Nó không còn là Hero Section (khối to nhất, hiệu ứng loè loẹt) chiếm 50% màn hình nữa. Nó được thu gọn thành một công cụ làm việc (Tool) nằm đúng ở không gian dành cho Developer/Admin.

Sinh viên hãy ánh xạ (map) các hàm Javascript đang có vào sự kiện `onclick` của các Tab để điều khiển class `hidden` và `block` giữa các `<section>` tương ứng.
