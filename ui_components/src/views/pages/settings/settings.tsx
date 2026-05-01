import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/store';

type ZaloStatus = { success: boolean; message: string } | null;

const BANKS = [
  { bin: '970436', name: 'Vietcombank (VCB)' },
  { bin: '970415', name: 'Vietinbank (CTG)' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970407', name: 'Techcombank (TCB)' },
  { bin: '970416', name: 'ACB' },
  { bin: '970433', name: 'MB Bank' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970400', name: 'Sacombank (STB)' },
  { bin: '970426', name: 'MSB' },
  { bin: '970422', name: 'Military Bank (MBB)' },
  { bin: '970448', name: 'OCB' },
  { bin: '970406', name: 'Đông Á Bank' },
  { bin: '970458', name: 'Shinhan Bank' },
];

type BankConfig = {
  BANK_BIN: string;
  BANK_ACC: string;
  BANK_NAME: string;
  BANK_LABEL: string;
  SEPAY_API_KEY: string;
  SEPAY_ACCOUNT_NUMBER: string;
};

type Transaction = {
  id: string;
  amount: number;
  date: string;
  status: string;
  content: string | null;
  gateway: string | null;
  sepayId: number | null;
  referenceCode: string | null;
  student?: { name: string; studentCode: string | null } | null;
};

const empty: BankConfig = { BANK_BIN: '', BANK_ACC: '', BANK_NAME: '', BANK_LABEL: '', SEPAY_API_KEY: '', SEPAY_ACCOUNT_NUMBER: '' };

export const SettingsPage = () => {
  const { auth } = useAuthStore();
  const token = auth?.token;

  const [activeTab, setActiveTab] = useState<'bank' | 'zalo' | 'log'>('bank');
  const [cfg, setCfg] = useState<BankConfig>(empty);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => window.location.origin.replace('5173', '5000'));
  const [saveMsg, setSaveMsg] = useState('');
  const copyTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Zalo OA state
  const [zaloStatus, setZaloStatus] = useState<ZaloStatus>(null);
  const [isTestingZalo, setIsTestingZalo] = useState(false);
  const [zaloAuthMsg, setZaloAuthMsg] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const oauthHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchConfig = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/config/bank', { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) { const data = await r.json(); setCfg(c => ({ ...c, ...data })); }
    } catch {}
  }, [token]);

  const fetchTransactions = useCallback(async () => {
    if (!token) return;
    setTxLoading(true);
    try {
      const r = await fetch('/api/config/bank/transactions', { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) setTransactions(await r.json());
    } catch {} finally { setTxLoading(false); }
  }, [token]);

  const testZaloConnection = useCallback(async () => {
    if (!token) return;
    setIsTestingZalo(true);
    setZaloStatus(null);
    try {
      const r = await fetch('/api/config/zalo/test', { headers: { 'Authorization': `Bearer ${token}` } });
      setZaloStatus(await r.json());
    } catch { setZaloStatus({ success: false, message: 'Không thể kết nối server' }); }
    finally { setIsTestingZalo(false); }
  }, [token]);

  const startZaloAuth = async () => {
    setZaloAuthMsg('');
    try {
      const r = await fetch('/api/config/zalo/oauth-url', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await r.json();
      if (!data.authUrl) { setZaloAuthMsg('Lỗi: ' + (data.message || 'Không lấy được URL')); return; }
      if (data.callbackUrl) setCallbackUrl(data.callbackUrl);

      if (oauthHandlerRef.current) window.removeEventListener('message', oauthHandlerRef.current);

      oauthHandlerRef.current = (e: MessageEvent) => {
        if (e.data === 'zalo_auth_success') {
          setZaloAuthMsg('Kết nối thành công! Đang kiểm tra...');
          testZaloConnection();
          window.removeEventListener('message', oauthHandlerRef.current!);
          oauthHandlerRef.current = null;
        } else if (typeof e.data === 'string' && e.data.startsWith('zalo_auth_error:')) {
          setZaloAuthMsg('Lỗi: ' + e.data.slice(16));
          window.removeEventListener('message', oauthHandlerRef.current!);
          oauthHandlerRef.current = null;
        }
      };
      window.addEventListener('message', oauthHandlerRef.current);

      const popup = window.open(data.authUrl, 'zalo_auth', 'width=620,height=720,top=80,left=200');
      if (!popup) setZaloAuthMsg('Trình duyệt chặn popup — vui lòng cho phép popup cho trang này');
    } catch { setZaloAuthMsg('Lỗi khởi tạo OAuth'); }
  };

  useEffect(() => {
    return () => {
      if (oauthHandlerRef.current) window.removeEventListener('message', oauthHandlerRef.current);
    };
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => { if (activeTab === 'log') fetchTransactions(); }, [activeTab, fetchTransactions]);
  useEffect(() => {
    if (activeTab === 'zalo') {
      testZaloConnection();
      setCallbackUrl(`${window.location.origin.replace('5173', '5000')}/api/config/zalo/oauth-callback`);
    }
  }, [activeTab, testZaloConnection]);

  const save = async () => {
    setIsSaving(true); setSaveMsg('');
    try {
      const r = await fetch('/api/config/bank', { method: 'POST', headers: authHeaders, body: JSON.stringify(cfg) });
      const d = await r.json();
      setSaveMsg(d.message || (r.ok ? 'Đã lưu' : 'Lỗi'));
      setTimeout(() => setSaveMsg(''), 3000);
    } catch { setSaveMsg('Lỗi lưu cấu hình'); } finally { setIsSaving(false); }
  };

  const testConnection = async () => {
    setIsTesting(true); setTestResult(null);
    try {
      const r = await fetch('/api/config/bank/test', { headers: { 'Authorization': `Bearer ${token}` } });
      setTestResult(await r.json());
    } catch { setTestResult({ success: false, message: 'Không thể kết nối tới server' }); }
    finally { setIsTesting(false); }
  };

  const webhookUrl = `${serverUrl}/api/webhook/sepay`;

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => setCopied(false), 2000);
  };

  const selectedBank = BANKS.find(b => b.bin === cfg.BANK_BIN);

  const TAB = (key: typeof activeTab, label: string) => (
    <button
      onClick={() => setActiveTab(key)}
      className={`px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${activeTab === key ? 'bg-hicado-navy text-white shadow' : 'text-gray-500 hover:text-hicado-navy hover:bg-gray-100'}`}
    >{label}</button>
  );

  const zaloConnected = zaloStatus?.success === true;

  return (
    <div className="p-6 min-h-screen bg-hicado-slate/30">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.4em] mb-1">Hệ thống</p>
        <h1 className="text-3xl font-serif font-black text-hicado-navy tracking-tight">Cài đặt & Tích hợp</h1>
        <p className="text-sm text-hicado-navy/40 mt-1">Cấu hình thanh toán, webhook ngân hàng và nhật ký giao dịch tự động</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-white p-1.5 rounded-2xl inline-flex shadow-sm border border-gray-100">
        {TAB('bank', 'Ngân hàng & SePay')}
        {TAB('zalo', zaloConnected ? '✓ Zalo OA' : 'Zalo OA')}
        {TAB('log', 'Nhật ký Webhook')}
      </div>

      {/* ══ TAB: BANK CONFIG ══════════════════════════════════════════════ */}
      {activeTab === 'bank' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* LEFT: Bank account */}
          <div className="xl:col-span-2 space-y-5">

            {/* Bank account card */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="premium-gradient px-6 py-4">
                <h2 className="text-white font-bold text-base">Tài khoản Ngân hàng</h2>
                <p className="text-white/60 text-xs mt-0.5">Thông tin dùng để tạo mã VietQR thanh toán học phí</p>
              </div>
              <div className="p-6 space-y-5">

                {/* Bank selector */}
                <div>
                  <label className="block text-xs font-black text-hicado-navy/50 uppercase tracking-widest mb-2">Ngân hàng</label>
                  <select
                    className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-semibold text-hicado-navy bg-hicado-slate/20 focus:outline-none focus:border-hicado-emerald/50 transition"
                    value={cfg.BANK_BIN}
                    onChange={e => {
                      const bank = BANKS.find(b => b.bin === e.target.value);
                      setCfg(c => ({ ...c, BANK_BIN: e.target.value, BANK_LABEL: bank?.name || c.BANK_LABEL }));
                    }}
                  >
                    <option value="">-- Chọn ngân hàng --</option>
                    {BANKS.map(b => <option key={b.bin} value={b.bin}>{b.name}</option>)}
                  </select>
                  {cfg.BANK_BIN && <p className="text-xs text-gray-400 mt-1 ml-1">BIN: <code className="font-mono">{cfg.BANK_BIN}</code></p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-hicado-navy/50 uppercase tracking-widest mb-2">Số tài khoản</label>
                    <input type="text" className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-mono font-semibold text-hicado-navy bg-hicado-slate/20 focus:outline-none focus:border-hicado-emerald/50 transition"
                      placeholder="VD: 1234567890"
                      value={cfg.BANK_ACC}
                      onChange={e => setCfg(c => ({ ...c, BANK_ACC: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-hicado-navy/50 uppercase tracking-widest mb-2">Tên chủ tài khoản</label>
                    <input type="text" className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-semibold text-hicado-navy bg-hicado-slate/20 focus:outline-none focus:border-hicado-emerald/50 transition uppercase"
                      placeholder="NGUYEN VAN A"
                      value={cfg.BANK_NAME}
                      onChange={e => setCfg(c => ({ ...c, BANK_NAME: e.target.value.toUpperCase() }))} />
                  </div>
                </div>

                {/* Preview QR label */}
                {(cfg.BANK_ACC || cfg.BANK_NAME) && (
                  <div className="bg-hicado-emerald/5 border border-hicado-emerald/20 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 bg-hicado-emerald/10 rounded-xl flex items-center justify-center text-2xl">🏦</div>
                    <div>
                      <p className="font-bold text-hicado-navy text-sm">{selectedBank?.name || 'Ngân hàng'}</p>
                      <p className="text-xs text-gray-500 font-mono">{cfg.BANK_ACC}</p>
                      <p className="text-xs font-semibold text-hicado-emerald mt-0.5">{cfg.BANK_NAME}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* SePay config card */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-blue-600 px-6 py-4">
                <h2 className="text-white font-bold text-base">Kết nối SePay</h2>
                <p className="text-white/60 text-xs mt-0.5">SePay đọc giao dịch ngân hàng và bắn webhook tự động xác nhận học phí</p>
              </div>
              <div className="p-6 space-y-5">

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-black text-hicado-navy/50 uppercase tracking-widest mb-2">SePay API Key</label>
                    <input type="password" className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-mono text-hicado-navy bg-hicado-slate/20 focus:outline-none focus:border-blue-400 transition"
                      placeholder="••••••••••••••••"
                      value={cfg.SEPAY_API_KEY}
                      onChange={e => setCfg(c => ({ ...c, SEPAY_API_KEY: e.target.value }))} />
                    <p className="text-[10px] text-gray-400 mt-1 ml-1">Lấy tại my.sepay.vn → API</p>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-hicado-navy/50 uppercase tracking-widest mb-2">Số TK theo dõi</label>
                    <input type="text" className="w-full border-2 border-gray-100 rounded-2xl px-4 py-3 text-sm font-mono text-hicado-navy bg-hicado-slate/20 focus:outline-none focus:border-blue-400 transition"
                      placeholder="Số TK nhận học phí"
                      value={cfg.SEPAY_ACCOUNT_NUMBER}
                      onChange={e => setCfg(c => ({ ...c, SEPAY_ACCOUNT_NUMBER: e.target.value }))} />
                    <p className="text-[10px] text-gray-400 mt-1 ml-1">Để trống = dùng BANK_ACC</p>
                  </div>
                </div>

                {/* Test connection */}
                <div className="flex items-center gap-3">
                  <button onClick={testConnection} disabled={isTesting || !cfg.SEPAY_API_KEY}
                    className="px-5 py-2.5 bg-blue-50 text-blue-700 font-semibold rounded-xl hover:bg-blue-100 transition text-sm disabled:opacity-40">
                    {isTesting ? 'Đang kiểm tra...' : 'Test kết nối SePay'}
                  </button>
                  {testResult && (
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                      <span>{testResult.success ? '✓' : '✗'}</span>
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Webhook URL + How-to */}
          <div className="space-y-5">

            {/* Webhook URL card */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-hicado-navy px-5 py-4">
                <h2 className="text-white font-bold text-sm">URL Webhook</h2>
                <p className="text-white/50 text-[11px] mt-0.5">Dán vào SePay để nhận thông báo giao dịch</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Domain server của bạn</label>
                  <input type="text" className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-xs font-mono text-gray-600 focus:outline-none focus:border-hicado-emerald/50"
                    value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
                </div>

                <div className="bg-hicado-slate/30 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest mb-2">Webhook URL</p>
                  <p className="font-mono text-xs text-hicado-navy break-all leading-relaxed">{webhookUrl}</p>
                  <button onClick={copyUrl}
                    className={`mt-3 w-full py-2 rounded-xl text-xs font-bold transition-all ${copied ? 'bg-hicado-emerald text-hicado-navy' : 'bg-hicado-navy text-white hover:bg-hicado-emerald hover:text-hicado-navy'}`}>
                    {copied ? '✓ Đã sao chép!' : 'Sao chép URL'}
                  </button>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1.5">Xác thực</p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">SePay gửi header: <code className="bg-white px-1 rounded font-mono">Authorization: Apikey YOUR_KEY</code> — hệ thống kiểm tra khớp với SePay API Key bên trên.</p>
                </div>
              </div>
            </div>

            {/* Setup guide */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-bold text-hicado-navy text-sm mb-4">Hướng dẫn cài đặt</h3>
              <ol className="space-y-3">
                {[
                  ['Đăng ký SePay', 'my.sepay.vn → Tài khoản ngân hàng → Thêm tài khoản'],
                  ['Lấy API Key', 'my.sepay.vn → Cấu hình → API → Tạo token mới'],
                  ['Điền thông tin', 'Nhập ngân hàng, số TK, API Key vào form bên trái'],
                  ['Cấu hình Webhook', 'SePay → Cấu hình → Webhook → Dán URL bên trên + chọn "Apikey"'],
                  ['Nội dung CK', 'Học sinh chuyển khoản ghi: HS001 TOAN (mã HS + mã lớp)'],
                ].map(([title, desc], i) => (
                  <li key={i} className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-hicado-emerald text-hicado-navy font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                    <div>
                      <p className="text-xs font-bold text-hicado-navy">{title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Save button */}
            <button onClick={save} disabled={isSaving}
              className="w-full py-4 bg-hicado-navy text-white font-black rounded-2xl hover:bg-hicado-emerald hover:text-hicado-navy transition shadow-lg text-sm tracking-widest uppercase disabled:opacity-50">
              {isSaving ? 'Đang lưu...' : 'Lưu tất cả cấu hình'}
            </button>
            {saveMsg && (
              <div className="text-center py-2 px-4 bg-green-50 text-green-700 rounded-xl text-sm font-semibold">{saveMsg}</div>
            )}
          </div>
        </div>
      )}

      {/* ══ TAB: ZALO OA ══════════════════════════════════════════════════ */}
      {activeTab === 'zalo' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Connection status + auth button */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className={`px-6 py-4 ${zaloConnected ? 'bg-blue-500' : 'bg-slate-400'}`}>
              <h2 className="text-white font-bold text-base">Trạng thái Zalo OA</h2>
              <p className="text-white/60 text-xs mt-0.5">Kết nối tài khoản OA để gửi tin nhắn tự động</p>
            </div>
            <div className="p-6 space-y-5">

              {/* Status indicator */}
              {isTestingZalo ? (
                <div className="text-center py-8 text-gray-400 text-sm">Đang kiểm tra kết nối...</div>
              ) : zaloStatus ? (
                <div className={`flex items-center gap-3 p-4 rounded-2xl ${zaloStatus.success ? 'bg-blue-50 border border-blue-100' : 'bg-red-50 border border-red-100'}`}>
                  <span className="text-3xl">{zaloStatus.success ? '✅' : '❌'}</span>
                  <div>
                    <p className={`font-bold text-sm ${zaloStatus.success ? 'text-blue-700' : 'text-red-600'}`}>
                      {zaloStatus.success ? 'Đang kết nối' : 'Chưa kết nối'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{zaloStatus.message}</p>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-gray-400 text-sm">Chưa kiểm tra</div>
              )}

              {/* Auth button */}
              <button
                onClick={startZaloAuth}
                className={`w-full py-3.5 font-black rounded-2xl transition text-sm tracking-wider uppercase ${zaloConnected ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-blue-600 text-white hover:bg-blue-700'} shadow-sm`}
              >
                {zaloConnected ? '🔄 Ủy quyền lại' : '🔗 Kết nối Zalo OA'}
              </button>

              {zaloAuthMsg && (
                <div className={`text-center py-2.5 px-4 rounded-xl text-sm font-medium ${zaloAuthMsg.startsWith('Lỗi') ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'}`}>
                  {zaloAuthMsg}
                </div>
              )}

              <button onClick={testZaloConnection} disabled={isTestingZalo}
                className="w-full py-2.5 border-2 border-gray-100 text-gray-500 font-semibold rounded-2xl hover:border-blue-200 hover:text-blue-600 transition text-xs">
                {isTestingZalo ? 'Đang kiểm tra...' : '↻ Kiểm tra lại kết nối'}
              </button>
            </div>
          </div>

          {/* Setup guide + callback URL */}
          <div className="space-y-5">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-hicado-navy px-6 py-4">
                <h2 className="text-white font-bold text-sm">Cấu hình tại Zalo Developer</h2>
                <p className="text-white/50 text-xs mt-0.5">Đăng ký Redirect URI trước khi ủy quyền</p>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-hicado-slate/30 rounded-2xl p-4">
                  <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest mb-2">Redirect URI cần đăng ký</p>
                  <p className="font-mono text-xs text-hicado-navy break-all leading-relaxed">{callbackUrl}</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(callbackUrl); }}
                    className="mt-2 w-full py-1.5 bg-hicado-navy text-white text-xs font-bold rounded-xl hover:bg-hicado-emerald hover:text-hicado-navy transition"
                  >Sao chép</button>
                </div>

                <ol className="space-y-3">
                  {[
                    ['Vào developers.zalo.me', 'Chọn ứng dụng OA của bạn → Cài đặt'],
                    ['Thêm Redirect URI', 'Tab "Đăng nhập với Zalo" → dán URL ở trên'],
                    ['Nhấn "Kết nối Zalo OA"', 'Đăng nhập bằng tài khoản quản lý OA'],
                    ['Xác nhận quyền truy cập', 'Cho phép ứng dụng gửi tin nhắn OA'],
                  ].map(([title, desc], i) => (
                    <li key={i} className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-blue-500 text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</div>
                      <div>
                        <p className="text-xs font-bold text-hicado-navy">{title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Lưu ý</p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">Token Zalo có hiệu lực <strong>1 giờ</strong>. Refresh token sẽ tự động lấy token mới khi hết hạn (nếu còn hợp lệ). Nếu cả hai đều hết hạn, cần ủy quyền lại.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB: WEBHOOK LOG ══════════════════════════════════════════════ */}
      {activeTab === 'log' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="premium-gradient px-6 py-4 flex justify-between items-center">
            <div>
              <h2 className="text-white font-bold text-base">Nhật ký Webhook SePay</h2>
              <p className="text-white/50 text-xs mt-0.5">30 giao dịch gần nhất nhận từ ngân hàng</p>
            </div>
            <button onClick={fetchTransactions} disabled={txLoading}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition">
              {txLoading ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>

          {transactions.length === 0 && !txLoading && (
            <div className="text-center py-20 text-gray-400">
              <p className="text-5xl mb-4">📭</p>
              <p className="font-semibold text-lg">Chưa có giao dịch nào</p>
              <p className="text-sm mt-1">Hệ thống sẽ ghi nhật ký khi SePay gửi webhook</p>
            </div>
          )}

          {transactions.length > 0 && (
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm text-left min-w-[800px]">
                <thead>
                  <tr className="bg-hicado-slate/30 border-b border-gray-100">
                    <th className="px-5 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Thời gian</th>
                    <th className="px-5 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Học sinh</th>
                    <th className="px-5 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Số tiền</th>
                    <th className="px-5 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Nội dung CK</th>
                    <th className="px-5 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Kênh</th>
                    <th className="px-5 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-hicado-slate/10 transition">
                      <td className="px-5 py-3.5 text-gray-500 font-mono text-xs whitespace-nowrap">
                        {new Date(tx.date).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-3.5">
                        {tx.student ? (
                          <div>
                            <p className="font-semibold text-hicado-navy text-xs">{tx.student.name}</p>
                            <p className="text-gray-400 font-mono text-[10px]">{tx.student.studentCode}</p>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs italic">— Không xác định</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-black text-hicado-emerald text-sm">
                          {tx.amount.toLocaleString('vi-VN')}đ
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-600 max-w-[200px] truncate" title={tx.content || ''}>
                        {tx.content || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold">{tx.gateway || '—'}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${tx.status === 'SUCCESS' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                          {tx.status === 'SUCCESS' ? 'Thành công' : 'Lỗi'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
