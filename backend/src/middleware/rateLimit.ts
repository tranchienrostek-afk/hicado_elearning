import rateLimit from 'express-rate-limit';

export const zaloSearchLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 phút
  max: 30,                    // tối đa 30 request/phút/IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Quá nhiều yêu cầu tìm kiếm, thử lại sau 1 phút.' },
});
