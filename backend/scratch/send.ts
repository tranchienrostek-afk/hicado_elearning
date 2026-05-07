import { zaloApiClient, getZaloConfig, ZALO_OA_API } from '../src/lib/zaloAuth';

async function send() {
  try {
    const cfg = await getZaloConfig();
    const response = await zaloApiClient.post(ZALO_OA_API + '/v3.0/oa/message/cs', {
      recipient: { user_id: '8866265516531733373' },
      message: { text: 'Xin chào Thầy Chiến! Hệ thống Hicado E-learning đang thử nghiệm tính năng nhắn tin tự động và tự động Refresh Token. Chúc thầy một ngày tốt lành!' }
    }, {
      headers: { access_token: cfg.ZALO_ACCESS_TOKEN, 'Content-Type': 'application/json' }
    });
    console.log('Result:', response.data);
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}
send();
