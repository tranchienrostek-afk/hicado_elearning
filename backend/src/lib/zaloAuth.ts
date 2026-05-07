import axios from 'axios';
import prisma from './prisma';

export const ZALO_OA_API = 'https://openapi.zalo.me';
const ZALO_CONFIG_KEYS = [
  'ZALO_APP_ID',
  'ZALO_SECRET_KEY',
  'ZALO_REFRESH_TOKEN',
  'ZALO_ACCESS_TOKEN',
  'ZALO_ACCESS_TOKEN_ISSUED_AT',
] as const;

// Function to get the latest credentials
export const getZaloConfig = async () => {
  const configs = await prisma.systemConfig.findMany({
    where: { key: { in: [...ZALO_CONFIG_KEYS] } }
  });
  return configs.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {} as Record<string, string>);
};

// Function to refresh the access token
export const refreshZaloToken = async () => {
  const cfg = await getZaloConfig();
  
  if (!cfg.ZALO_APP_ID || !cfg.ZALO_SECRET_KEY || !cfg.ZALO_REFRESH_TOKEN) {
    throw new Error('Thiếu cấu hình App ID, Secret Key hoặc Refresh Token');
  }

  const response = await axios.post<any>(
    'https://oauth.zaloapp.com/v4/oa/access_token',
    `app_id=${cfg.ZALO_APP_ID}&grant_type=refresh_token&refresh_token=${cfg.ZALO_REFRESH_TOKEN}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'secret_key': cfg.ZALO_SECRET_KEY
      }
    }
  );

  const { access_token, refresh_token } = response.data as any;
  const issuedAt = new Date().toISOString();
  
  if (!access_token || !refresh_token) {
    throw new Error(`Refresh token thất bại: ${JSON.stringify(response.data)}`);
  }

  await prisma.$transaction([
    prisma.systemConfig.upsert({
      where: { key: 'ZALO_ACCESS_TOKEN' },
      update: { value: access_token },
      create: { key: 'ZALO_ACCESS_TOKEN', value: access_token }
    }),
    prisma.systemConfig.upsert({
      where: { key: 'ZALO_REFRESH_TOKEN' },
      update: { value: refresh_token },
      create: { key: 'ZALO_REFRESH_TOKEN', value: refresh_token }
    }),
    prisma.systemConfig.upsert({
      where: { key: 'ZALO_ACCESS_TOKEN_ISSUED_AT' },
      update: { value: issuedAt },
      create: { key: 'ZALO_ACCESS_TOKEN_ISSUED_AT', value: issuedAt }
    }),
  ]);

  return access_token;
};

export const shouldProactiveRefresh = async (): Promise<boolean> => {
  const cfg = await getZaloConfig();
  if (!cfg.ZALO_REFRESH_TOKEN) return false;

  const issuedAt = cfg.ZALO_ACCESS_TOKEN_ISSUED_AT;
  if (!issuedAt) return true;

  const ageMs = Date.now() - new Date(issuedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return ageHours > 20;
};

// Create a custom Axios instance
export const zaloApiClient = axios.create({});

// Intercept responses
zaloApiClient.interceptors.response.use(
  async (response: any) => {
    // Zalo API returns HTTP 200 but error codes inside the body when token is invalid/expired
    if (response.data && (response.data.error === -216 || response.data.error === -124 || response.data.error === 3)) {
      console.log(`🔄 Zalo Token invalid (${response.data.error}). Auto-refreshing...`);
      
      const config = response.config;
      
      try {
        // Prevent infinite loop if the refresh token is also somehow returning -216 (unlikely for oauth, but safe guard)
        if (config._retry) {
            return response;
        }
        config._retry = true;

        const newAccessToken = await refreshZaloToken();
        console.log('✅ Zalo Token refreshed successfully.');

        // Update the access_token in the original request headers
        if (config.headers) {
          config.headers['access_token'] = newAccessToken;
        }

        // Retry the original request with the new token
        return zaloApiClient.request(config);
      } catch (err: any) {
        console.error('❌ Lỗi Refresh Token ngầm:', err.response?.data || err.message);
        // Return original error response if refresh fails
        return response; 
      }
    }
    
    // Pass through if no error or other error
    return response;
  },
  (error: any) => {
    return Promise.reject(error);
  }
);
