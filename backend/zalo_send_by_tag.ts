import axios from 'axios';
import fs from 'fs';
import dotenv from 'dotenv';

// Đọc cấu hình token từ file .env
const envConfig = dotenv.parse(fs.readFileSync('../../.env'));
const ZALO_TOKEN = envConfig.ACCESS_TOKEN;

const ZALO_API = 'https://openapi.zalo.me/v2.0/oa';

// Cấu hình headers
const headers = { 'access_token': ZALO_TOKEN, 'Content-Type': 'application/json' };

async function sendTestMessageToTag(tagName: string, message: string) {
  try {
    console.log(`[1] Đang lấy danh sách các nhãn (tags) của Zalo OA...`);
    const tagsRes = await axios.get(`${ZALO_API}/tag/gettagsofoa`, { headers });
    
    // Xử lý lỗi -209 App chưa được duyệt
    if (tagsRes.data.error === -209) {
      console.error("\n❌ LỖI ZALO (Error -209): App has been not approved.");
      console.error("-> Ứng dụng Zalo Developer của bạn CHƯA ĐƯỢC DUYỆT. Bạn cần vào developers.zalo.me -> Quản lý App -> Xin xét duyệt quyền 'Official Account API' và 'Zalo Notification Service'.\n");
      return;
    }

    if (tagsRes.data.error !== 0) {
      throw new Error(`Lỗi lấy tags: ${JSON.stringify(tagsRes.data)}`);
    }

    const tags = tagsRes.data.data;
    const targetTag = tags.find((t: any) => t.name === tagName);

    if (!targetTag) {
      console.error(`❌ Không tìm thấy nhãn nào tên là "${tagName}"`);
      return;
    }

    console.log(`[2] Đã tìm thấy nhãn "${tagName}" (ID: ${targetTag.name}). Đang lấy danh sách người theo dõi...`);

    // Zalo API không hỗ trợ lấy user ID trực tiếp theo Tag, phải duyệt tất cả user và lọc
    // (Trong ứng dụng thực tế, database của bạn nên lưu ánh xạ UID -> Nhãn để tránh limit)
    const followersRes = await axios.get(`${ZALO_API}/getfollowers?data={"offset":0,"count":50}`, { headers });
    
    if (followersRes.data.error !== 0) {
       throw new Error(`Lỗi lấy danh sách user: ${JSON.stringify(followersRes.data)}`);
    }

    const uids = followersRes.data.data.followers;
    console.log(`Đã lấy xong danh sách ${uids.length} followers. Đang lọc...`);

    let sentCount = 0;

    for (const follower of uids) {
      // 3. Lấy thông tin chi tiết của từng người xem có gắn Tag này không
      const profile = await axios.get(`${ZALO_API}/getprofile?data={"user_id":"${follower.user_id}"}`, { headers });
      const userTags = profile.data.data.tags_and_notes_info?.tags || [];

      if (userTags.includes(targetTag.name)) {
        console.log(`[3] Đang gửi tin nhắn cho UID: ${follower.user_id}...`);
        
        // 4. Bắn tin nhắn chăm sóc khách hàng (CS)
        const sendRes = await axios.post(`https://openapi.zalo.me/v3.0/oa/message/cs`, {
          "recipient": { "user_id": follower.user_id },
          "message": { "text": message }
        }, { headers });

        if (sendRes.data.error === 0) {
          console.log(`✅ Thành công!`);
          sentCount++;
        } else {
          console.error(`❌ Thất bại:`, sendRes.data);
        }
      }
    }

    console.log(`\n🎉 KẾT QUẢ: Đã bắn tin nhắn thành công cho ${sentCount} người có nhãn "${tagName}".`);

  } catch (error: any) {
    console.error("Lỗi Exception:", error.response?.data || error.message);
  }
}

// CHẠY TEST
sendTestMessageToTag('Toán 8 T Chiến', 'Chào bạn, chúc bạn học tốt khóa Toán 8 của thầy Chiến nhé!');
