import { useState, useEffect, useCallback } from 'react';
import { useCenterStore, useAuthStore } from '@/store';

type Follower = {
  userId: string;
  displayName: string;
  avatar: string;
  tags: string[];
  linkedTeacher: { id: string; name: string; phone: string } | null;
  linkedStudent: { id: string; name: string; parentPhone: string } | null;
};

export const ZaloCampaignPage = () => {
  const { classes, students, teachers, fetchClasses, fetchStudents, fetchTeachers } = useCenterStore();
  const [activeTab, setActiveTab] = useState<'send' | 'followers' | 'config'>('send');

  // --- Tab Send ---
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendLog, setSendLog] = useState('');

  // --- Tab Followers ---
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [_followersLoading, setFollowersLoading] = useState(false);
  const [csMessage, setCsMessage] = useState('');
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>([]);
  const [isSendingCs, setIsSendingCs] = useState(false);
  // Manual entry
  const [manualUserId, setManualUserId] = useState('');
  const [manualLinkType, setManualLinkType] = useState('teacher');
  const [manualLinkId, setManualLinkId] = useState('');

  // --- Tab Config ---
  const [config, setConfig] = useState({ ZALO_APP_ID: '', ZALO_SECRET_KEY: '', ZALO_REFRESH_TOKEN: '', ZALO_ACCESS_TOKEN: '' });
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const { auth } = useAuthStore();
  const token = auth?.token;

  const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchZaloTemplates = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/zalo/templates', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await r.json();
      if (Array.isArray(data)) setTemplates(data);
    } catch {}
  }, [token]);

  const fetchZaloConfig = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/config/zalo', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await r.json();
      setConfig(prev => ({ ...prev, ...data }));
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchClasses();
    fetchStudents();
    fetchTeachers();
    fetchZaloTemplates();
    fetchZaloConfig();
  }, [fetchClasses, fetchStudents, fetchTeachers, fetchZaloTemplates, fetchZaloConfig]);

  // ── Config handlers ──────────────────────────────────────────
  const saveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const r = await fetch('/api/config/zalo', { method: 'POST', headers: authHeaders, body: JSON.stringify(config) });
      const data = await r.json();
      alert(data.message || (r.ok ? 'Thành công' : 'Thất bại'));
    } catch { alert('Lỗi lưu cấu hình'); } finally { setIsSavingConfig(false); }
  };

  const handleTestConnection = async () => {
    try {
      const r = await fetch('/api/config/zalo/test', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await r.json();
      alert(data.message);
    } catch { alert('Lỗi kết nối'); }
  };

  // ── Send (ZNS) handlers ──────────────────────────────────────
  const filteredStudents = students.filter(s => {
    const matchClass = selectedClass === 'all' || (s as any).classes?.some((c: any) => c.classId === selectedClass);
    const matchStatus = selectedStatus === 'all' || s.tuitionStatus === selectedStatus;
    return matchClass && matchStatus;
  });

  const toggleStudent = (id: string) =>
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelectedStudents(selectedStudents.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id));

  const syncTemplates = async () => {
    setIsSending(true);
    try {
      await fetch('/api/zalo/templates/sync', { headers: { 'Authorization': `Bearer ${token}` } });
      await fetchZaloTemplates();
    } catch {} finally { setIsSending(false); }
  };

  const handleSendZalo = async () => {
    if (selectedStudents.length === 0 || !selectedTemplate) return alert('Vui lòng chọn học sinh và mẫu tin nhắn.');
    if (!confirm(`Bạn sắp gửi ${selectedStudents.length} tin nhắn Zalo. Xác nhận?`)) return;
    setIsSending(true);
    try {
      const r = await fetch('/api/zalo/send/tuition', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ studentIds: selectedStudents, templateId: selectedTemplate })
      });
      const data = await r.json();
      setSendLog(data.message);
    } catch { alert('Lỗi khi gửi tin'); } finally { setIsSending(false); }
  };

  // ── Followers handlers ────────────────────────────────────────
  const fetchFollowers = async () => {
    setFollowersLoading(true);
    try {
      const r = await fetch('/api/zalo/followers', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await r.json();
      if (data.followers) setFollowers(data.followers);
      // else: Zalo tier limitation — use manual entry instead
    } catch {} finally { setFollowersLoading(false); }
  };

  const handleLinkFollower = async (followerId: string, type: 'teacher' | 'student', id: string) => {
    try {
      const r = await fetch('/api/zalo/link', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ zaloUserId: followerId, teacherId: type === 'teacher' ? id : undefined, studentId: type === 'student' ? id : undefined })
      });
      const data = await r.json();
      alert(data.message);
      await fetchFollowers();
    } catch { alert('Lỗi liên kết'); }
  };

  const toggleFollower = (id: string) =>
    setSelectedFollowers(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);

  const handleSendCS = async () => {
    if (selectedFollowers.length === 0 || !csMessage.trim()) return alert('Chọn người nhận và nhập nội dung tin nhắn.');
    if (!confirm(`Gửi tin OA cho ${selectedFollowers.length} người. Xác nhận?`)) return;
    setIsSendingCs(true);
    try {
      const r = await fetch('/api/zalo/send/cs', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ userIds: selectedFollowers, message: csMessage })
      });
      const data = await r.json();
      alert(data.message + (data.errors?.length ? '\n\nLỗi:\n' + data.errors.join('\n') : ''));
    } catch { alert('Lỗi gửi tin'); } finally { setIsSendingCs(false); }
  };

  const TAB_BTN = (tab: typeof activeTab, label: string) => (
    <button
      className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === tab ? 'bg-hicado-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
      onClick={() => setActiveTab(tab)}
    >{label}</button>
  );

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Chiến dịch Zalo OA</h1>
        <div className="flex gap-2">
          {TAB_BTN('send', 'Gửi ZNS')}
          {TAB_BTN('followers', 'Followers OA')}
          {TAB_BTN('config', 'Cài đặt')}
        </div>
      </div>

      {/* ══ TAB: SEND ZNS ══════════════════════════════════════════════ */}
      {activeTab === 'send' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left: filter + student list */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <h2 className="text-lg font-semibold mb-4 text-hicado-navy">1. Chọn học sinh</h2>
            <div className="flex gap-4 mb-4">
              <select className="border p-2 rounded-md flex-1 text-sm" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                <option value="all">-- Tất cả lớp --</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="border p-2 rounded-md flex-1 text-sm" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
                <option value="all">-- Học phí --</option>
                <option value="PENDING">Chưa nộp</option>
                <option value="DEBT">Nợ</option>
                <option value="PAID">Đã nộp</option>
              </select>
            </div>
            <div className="overflow-y-auto max-h-96 border rounded-md bg-white">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-3"><input type="checkbox" checked={filteredStudents.length > 0 && selectedStudents.length === filteredStudents.length} onChange={toggleAll} /></th>
                    <th className="p-3">Học sinh</th>
                    <th className="p-3">SĐT PH</th>
                    <th className="p-3">Học phí</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(s => (
                    <tr key={s.id} className="border-t hover:bg-gray-50">
                      <td className="p-3"><input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={() => toggleStudent(s.id)} /></td>
                      <td className="p-3 font-medium">
                        {s.name}
                        {(s as any).zaloUserId && <span className="ml-1 text-[10px] bg-green-100 text-green-700 px-1 rounded">Zalo</span>}
                      </td>
                      <td className="p-3 text-gray-500">{(s as any).parentPhone || '—'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.tuitionStatus === 'PAID' ? 'bg-green-100 text-green-700' : s.tuitionStatus === 'DEBT' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {s.tuitionStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredStudents.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400">Không có học sinh.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-sm text-gray-500">Đã chọn: {selectedStudents.length} / {filteredStudents.length}</p>
          </div>

          {/* Right: template + send */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-hicado-navy">2. Mẫu ZNS</h2>
              <button onClick={syncTemplates} disabled={isSending} className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-md hover:bg-blue-200">Đồng bộ</button>
            </div>
            <div className="space-y-4 mb-6">
              {templates.map(t => (
                <label key={t.id} className={`block p-4 border rounded-lg cursor-pointer transition-all ${selectedTemplate === t.templateId ? 'border-hicado-emerald ring-2 ring-hicado-emerald/20 bg-emerald-50' : 'border-gray-200 bg-white hover:border-hicado-emerald/40'}`}>
                  <div className="flex items-start gap-3">
                    <input type="radio" name="template" className="mt-1" checked={selectedTemplate === t.templateId} onChange={() => setSelectedTemplate(t.templateId)} />
                    <div>
                      <p className="font-semibold text-gray-800">{t.templateName} <span className="text-xs font-normal text-gray-400">(ID: {t.templateId})</span></p>
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">{t.status}</span>
                      <span className="inline-block mt-1 ml-2 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{t.price}đ/tin</span>
                    </div>
                  </div>
                </label>
              ))}
              {templates.length === 0 && <p className="text-sm text-gray-400">Chưa có mẫu. Bấm Đồng bộ.</p>}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
              <strong>Lưu ý:</strong> ZNS yêu cầu App được Zalo duyệt. Học sinh có <span className="bg-green-100 text-green-700 px-1 rounded">Zalo</span> sẽ nhận qua CS message (không cần duyệt).
            </div>

            <button onClick={handleSendZalo} disabled={isSending || selectedStudents.length === 0 || !selectedTemplate}
              className="w-full bg-hicado-navy hover:bg-hicado-emerald hover:text-hicado-navy text-white font-bold py-3 rounded-xl disabled:bg-gray-300 transition-colors shadow-md">
              {isSending ? 'Đang xử lý...' : `Gửi (${selectedStudents.length} tin)`}
            </button>
            {sendLog && <div className="mt-4 p-3 bg-green-50 text-green-800 border border-green-200 rounded-lg text-sm">{sendLog}</div>}
          </div>
        </div>
      )}

      {/* ══ TAB: FOLLOWERS OA ══════════════════════════════════════════ */}
      {activeTab === 'followers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* LEFT: Manual link + webhook guide */}
          <div className="space-y-5">

            {/* Manual user_id input */}
            <div className="bg-hicado-navy/5 rounded-xl border border-hicado-navy/10 p-5">
              <h2 className="font-bold text-hicado-navy mb-1">Liên kết Zalo User ID thủ công</h2>
              <p className="text-xs text-gray-500 mb-4">
                Lấy User ID từ <a href="https://oa.zalo.me" target="_blank" className="text-blue-500 underline">oa.zalo.me</a> → Tin nhắn → click vào người dùng → copy ID trong URL.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Zalo User ID</label>
                  <input type="text" className="w-full border rounded-lg p-2.5 text-sm font-mono" placeholder="VD: 1234567890123456"
                    value={manualUserId} onChange={e => setManualUserId(e.target.value)} />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Loại</label>
                    <select className="w-full border rounded-lg p-2.5 text-sm" value={manualLinkType} onChange={e => setManualLinkType(e.target.value)}>
                      <option value="teacher">Giáo viên</option>
                      <option value="student">Học sinh</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Người dùng</label>
                    <select className="w-full border rounded-lg p-2.5 text-sm" value={manualLinkId} onChange={e => setManualLinkId(e.target.value)}>
                      <option value="">-- Chọn --</option>
                      {manualLinkType === 'teacher'
                        ? teachers.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.phone})</option>)
                        : students.slice(0, 100).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)
                      }
                    </select>
                  </div>
                </div>
                <button
                  disabled={!manualUserId.trim() || !manualLinkId}
                  onClick={() => {
                    if (!manualUserId.trim() || !manualLinkId) return;
                    handleLinkFollower(manualUserId.trim(), manualLinkType as 'teacher' | 'student', manualLinkId);
                    if (!selectedFollowers.includes(manualUserId.trim())) {
                      setSelectedFollowers(prev => [...prev, manualUserId.trim()]);
                    }
                    setFollowers(prev => {
                      if (prev.some(f => f.userId === manualUserId.trim())) return prev;
                      return [...prev, { userId: manualUserId.trim(), displayName: 'Manual Entry', avatar: '', tags: [], linkedTeacher: null, linkedStudent: null }];
                    });
                    setManualUserId('');
                  }}
                  className="w-full bg-hicado-navy text-white font-semibold py-2.5 rounded-lg hover:bg-hicado-emerald hover:text-hicado-navy transition disabled:bg-gray-200 disabled:text-gray-400 text-sm"
                >
                  Liên kết
                </button>
              </div>
            </div>

            {/* Webhook auto-detect guide */}
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
              <h2 className="font-bold text-hicado-emerald mb-1">Tự động nhận diện qua Webhook</h2>
              <p className="text-xs text-gray-600 mb-3">Khi thầy/cô nhắn tin vào OA với nội dung là <strong>username</strong> của họ trong hệ thống, hệ thống sẽ tự động lưu Zalo User ID.</p>
              <ol className="text-xs text-gray-600 space-y-1.5 list-decimal list-inside">
                <li>Cấu hình Webhook URL tại <strong>oa.zalo.me → Cài đặt → Webhook</strong></li>
                <li>URL Webhook: <code className="bg-white px-1.5 py-0.5 rounded text-hicado-navy font-mono">https://your-domain.com/api/webhook/zalo</code></li>
                <li>Thầy Chiến nhắn tin vào OA nội dung: <code className="bg-white px-1.5 py-0.5 rounded text-hicado-navy font-mono">thaychien</code></li>
                <li>Hệ thống tự động liên kết Zalo ID với tài khoản <strong>thaychien</strong></li>
              </ol>
            </div>

            {/* Follower list (if loaded) */}
            {followers.length > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                <div className="bg-hicado-navy px-4 py-3 flex justify-between items-center">
                  <h2 className="text-white font-semibold text-sm">{followers.length} mục đã thêm</h2>
                  <span className="text-xs text-white/60">{selectedFollowers.length} đang chọn</span>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto custom-scrollbar">
                  {followers.map(f => (
                    <div key={f.userId} className={`flex items-center gap-3 p-3 hover:bg-white transition cursor-pointer ${selectedFollowers.includes(f.userId) ? 'bg-emerald-50' : ''}`}
                      onClick={() => toggleFollower(f.userId)}>
                      <input type="checkbox" checked={selectedFollowers.includes(f.userId)} readOnly />
                      <div className="w-8 h-8 rounded-full bg-hicado-navy text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                        {f.displayName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm truncate">{f.displayName}</p>
                        <p className="text-xs text-gray-400 font-mono truncate">{f.userId}</p>
                        {f.linkedTeacher && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded">GV: {f.linkedTeacher.name}</span>}
                        {f.linkedStudent && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 rounded">HS: {f.linkedStudent.name}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: CS Send */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-5 self-start sticky top-6">
            <h2 className="font-bold text-hicado-navy mb-1">Gửi tin OA (Customer Service)</h2>
            <p className="text-xs text-gray-500 mb-4">Gửi trực tiếp cho followers đã liên kết. Không cần ZNS approval — chỉ cần họ đã follow OA.</p>

            <textarea
              className="w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-hicado-emerald/30 mb-2"
              rows={6}
              placeholder="Nội dung tin nhắn OA..."
              value={csMessage}
              onChange={e => setCsMessage(e.target.value)}
            />
            <p className="text-xs text-gray-400 mb-4">Người nhận: <strong>{selectedFollowers.length}</strong> người</p>

            <button onClick={handleSendCS}
              disabled={isSendingCs || selectedFollowers.length === 0 || !csMessage.trim()}
              className="w-full bg-hicado-emerald text-hicado-navy font-bold py-3 rounded-xl disabled:bg-gray-300 disabled:text-gray-400 transition text-sm shadow">
              {isSendingCs ? 'Đang gửi...' : `Gửi ${selectedFollowers.length} tin OA`}
            </button>

            {selectedFollowers.length > 0 && (
              <div className="mt-4 bg-white rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Sẽ gửi tới:</p>
                {selectedFollowers.map(uid => {
                  const f = followers.find(x => x.userId === uid);
                  return (
                    <div key={uid} className="flex items-center justify-between text-xs py-1">
                      <span className="text-gray-700">{f?.displayName || uid.slice(0, 16) + '...'}</span>
                      <button onClick={() => setSelectedFollowers(prev => prev.filter(x => x !== uid))} className="text-gray-300 hover:text-red-400 ml-2">×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ TAB: CONFIG ════════════════════════════════════════════════ */}
      {activeTab === 'config' && (
        <div className="max-w-3xl mx-auto bg-gray-50 p-6 rounded-xl border border-gray-100">
          <h2 className="text-lg font-semibold mb-2 text-hicado-navy">Cấu hình API Zalo OA</h2>
          <p className="text-sm text-gray-500 mb-6">
            Truy cập <a href="https://developers.zalo.me" target="_blank" className="text-blue-500 underline">developers.zalo.me</a> để lấy thông tin.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">App ID</label>
              <input type="text" className="w-full border p-2 rounded-md text-sm" value={config.ZALO_APP_ID} onChange={e => setConfig({ ...config, ZALO_APP_ID: e.target.value })} placeholder="VD: 1234567890123" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
              <input type="password" className="w-full border p-2 rounded-md text-sm" value={config.ZALO_SECRET_KEY} onChange={e => setConfig({ ...config, ZALO_SECRET_KEY: e.target.value })} />
            </div>
            <div className="pt-4 border-t border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-1">Refresh Token</label>
              <textarea className="w-full border p-2 rounded-md text-sm font-mono" rows={3} value={config.ZALO_REFRESH_TOKEN} onChange={e => setConfig({ ...config, ZALO_REFRESH_TOKEN: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
              <textarea className="w-full border p-2 rounded-md text-sm font-mono" rows={3} value={config.ZALO_ACCESS_TOKEN} onChange={e => setConfig({ ...config, ZALO_ACCESS_TOKEN: e.target.value })} />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button onClick={handleTestConnection} className="px-4 py-2 bg-green-100 text-green-700 font-medium rounded-md hover:bg-green-200 text-sm">Test Kết Nối</button>
            <button onClick={saveConfig} disabled={isSavingConfig} className="px-6 py-2 bg-hicado-navy text-white font-medium rounded-md hover:bg-hicado-emerald hover:text-hicado-navy transition">
              {isSavingConfig ? 'Đang lưu...' : 'Lưu Cấu Hình'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
