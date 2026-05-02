**Có, từ Zalo OA bạn có thể nhắn tin cho khách hàng qua số điện thoại mà không cần họ follow OA, nhờ dịch vụ ZNS (Zalo Notification Service).** [vihatsolutions](https://vihatsolutions.com/tin-cong-nghe/gui-tin-nhan-tu-dong-zalo/)

## Tin nhắn UID (thông thường)
- Yêu cầu khách hàng phải tương tác trước (gửi tin, gọi, follow OA) trong 7 ngày gần nhất mới gửi được. [omizcc](https://omizcc.com/chinh-sach-gui-tin-tu-zalo-oa/)
- Không gửi trực tiếp nếu chưa follow hoặc tương tác.

## ZNS từ số điện thoại
- Chỉ cần số điện thoại đăng ký Zalo, không cần follow OA. [eqvn](https://eqvn.net/zns-la-gi/)
- Dùng cho thông báo giao dịch, OTP, nhắc lịch, chăm sóc khách hàng; gửi qua API, có phí theo tin thành công. [esms](https://esms.vn/Tin-Tuc/tin-cong-nghe/hinh-thuc-nhan-tin-zalo-oa)

## Lưu ý sử dụng
- Broadcast chỉ gửi cho người đã follow. [oa.zalo](https://oa.zalo.me/home/documents/vie/guides/cau-hoi-thuong-gap-tin-broadcast)
- Kết nối Zalo OA để gửi ZNS, chuẩn bị danh sách số điện thoại hợp lệ. [hotro.hana](https://hotro.hana.ai/huong-dan-gui-tin-zns-cham-soc-khach-hang-zalo/)

**Dự án phần mềm gửi tin nhắc học phí 1 lần/tháng qua Zalo OA hoàn toàn khả thi, sử dụng ZNS để gửi đến số điện thoại mà không cần khách hàng follow.** [pandaloyalty](https://pandaloyalty.com/zns-trong-linh-vuc-giao-duc/)


## Lý do phù hợp
- ZNS hỗ trợ gửi thông báo học phí, nhắc lịch, kết quả thi định kỳ, phổ biến trong giáo dục. [v9.com](https://v9.com.vn/zalo-zns-giai-phap-gui-thong-bao/)
- Gửi hàng loạt tự động qua API, chỉ tính phí tin thành công (khoảng 200-300 VNĐ/tin). [voip24h](https://voip24h.vn/zalo-notification-service-zns/)

## Các loại tin phù hợp
| Loại tin | Yêu cầu follow | Phù hợp nhắc học phí | Chi phí |
|----------|----------------|----------------------|---------|
| Tư vấn/UID | Có (tương tác trước) | Không (hàng tháng) | Miễn phí giới hạn, sau 55đ/tin  [oa.zalo](https://oa.zalo.me/home/resources/news/thong-bao-chinh-sach-gui-tin-va-quy-dinh-phi-gui-tin_1433049880779375099) |
| ZNS | Không, chỉ cần số ĐT | Có (thông báo định kỳ) | 220-330đ/tin  [voip24h](https://voip24h.vn/zalo-notification-service-zns/) |
| Broadcast | Có (follower) | Không (chỉ nội dung chung) | Theo gói OA  [cellphones.com](https://cellphones.com.vn/sforum/gui-tin-nhan-hang-loat-tren-zalo-ao) |

## Triển khai dự án
- Tích hợp API ZNS vào phần mềm, chuẩn bị template "Nhắc nộp học phí [số tiền] trước [ngày]". [lib.hpu.edu](http://lib.hpu.edu.vn:8081/bitstream/handle/123456789/36237/Nguyen-Viet-Hong-CT2501.pdf?sequence=1&isAllowed=y)
- Kết nối Zalo OA xác minh, quản lý danh sách học sinh/phụ huynh. [help.jetpay](https://help.jetpay.vn/kb/gui-thong-bao-zalo/)