import { useState, useEffect, useCallback } from 'react';
import { useCenterStore, useAuthStore } from '@/store';

// ── Types ─────────────────────────────────────────────────────────────────────
type MainTab = 'campaigns' | 'create' | 'tracking' | 'followers' | 'config';
type WizardStep = 1 | 2 | 3 | 4 | 5;
type CampaignType = 'TUITION_REMINDER' | 'GENERAL';

interface Campaign {
  id: string; name: string; type: CampaignType; status: string;
  sentCount: number; readCount: number; failedCount: number; readRate: number;
  createdAt: string; sentAt?: string;
}
interface CampaignLog {
  id: string; status: string; sentAt: string; readAt?: string;
  student: { name: string; studentCode?: string } | null;
}
interface CampaignDetail extends Campaign { logs: CampaignLog[] }

interface Follower {
  userId: string; displayName: string; avatar: string; tags: string[];
  linkedTeacher: { id: string; name: string; phone: string } | null;
  linkedStudent: { id: string; name: string; parentPhone: string } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const ZaloCampaignPage = () => {
  const { classes, students, teachers, fetchClasses, fetchStudents, fetchTeachers } = useCenterStore();
  const { auth } = useAuthStore();
  const token = auth?.token;
  const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  const [activeTab, setActiveTab] = useState<MainTab>('campaigns');

  // ── Campaign list ──────────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignDetail, setCampaignDetail] = useState<CampaignDetail | null>(null);
  const [trackingCampaignId, setTrackingCampaignId] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Wizard ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);
  const [wizardName, setWizardName] = useState('');
  const [wizardType, setWizardType] = useState<CampaignType>('TUITION_REMINDER');
  const [wizardClassIds, setWizardClassIds] = useState<string[]>([]);
  const [wizardStatuses, setWizardStatuses] = useState<string[]>(['PENDING', 'DEBT']);
  const [wizardRequireZalo, setWizardRequireZalo] = useState(true);
  const [wizardMessage, setWizardMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sentCount: number; failedCount: number } | null>(null);

  // ── Followers (existing) ───────────────────────────────────────────────────
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [csMessage, setCsMessage] = useState('');
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>([]);
  const [isSendingCs, setIsSendingCs] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const [manualLinkType, setManualLinkType] = useState('teacher');
  const [manualLinkId, setManualLinkId] = useState('');

  // ── Config (existing) ──────────────────────────────────────────────────────
  const [config, setConfig] = useState({ ZALO_APP_ID: '', ZALO_SECRET_KEY: '', ZALO_REFRESH_TOKEN: '', ZALO_ACCESS_TOKEN: '' });
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // ── Legacy ZNS send ────────────────────────────────────────────────────────
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [sendLog, setSendLog] = useState('');

  const fetchZaloConfig = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/config/zalo', { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setConfig(prev => ({ ...prev, ...d })); }
    } catch {}
  }, [token]);

  const fetchZaloTemplates = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/zalo/templates', { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (Array.isArray(d)) setTemplates(d);
    } catch {}
  }, [token]);

  const fetchCampaigns = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch('/api/campaigns', { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) setCampaigns(await r.json());
    } catch {}
  }, [token]);

  const loadCampaignDetail = async (id: string) => {
    if (!id) return;
    setDetailLoading(true);
    try {
      const r = await fetch(`/api/campaigns/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) setCampaignDetail(await r.json());
    } catch {} finally { setDetailLoading(false); }
  };

  useEffect(() => {
    fetchClasses(); fetchStudents(); fetchTeachers();
    fetchZaloTemplates(); fetchZaloConfig(); fetchCampaigns();
  }, [fetchClasses, fetchStudents, fetchTeachers, fetchZaloTemplates, fetchZaloConfig, fetchCampaigns]);

  // ── Recipient preview (client-side filter) ────────────────────────────────
  const recipientPreview = students.filter(s => {
    if (wizardStatuses.length && !wizardStatuses.includes((s as any).tuitionStatus)) return false;
    if (wizardRequireZalo && !(s as any).zaloUserId) return false;
    if (wizardClassIds.length) {
      const sClassIds = ((s as any).classes || []).map((c: any) => c.classId ?? c.id);
      if (!wizardClassIds.some(id => sClassIds.includes(id))) return false;
    }
    return true;
  });

  const buildSampleMessage = () => {
    const first = recipientPreview[0] as any;
    if (!first) return 'Không có người nhận phù hợp.';
    if (wizardType === 'GENERAL') return wizardMessage || '(Chưa nhập nội dung)';
    const cls = classes.find(c => ((first.classes || []).map((x: any) => x.classId ?? x.id)).includes(c.id));
    const amount = cls ? cls.tuitionPerSession * cls.totalSessions : 0;
    return [
      `Kính gửi phụ huynh em ${first.name}!`,
      `Trung tâm Hicado xin thông báo học phí:\n`,
      cls ? `• Lớp ${cls.name}\n  Học phí ước tính: ${amount.toLocaleString('vi-VN')}đ` : '• (Dữ liệu lớp)',
      `\n💰 Tổng: ${amount.toLocaleString('vi-VN')}đ`,
      `📱 Quét QR nộp tiền: [link QR]`,
      first.studentCode ? `📝 Nội dung CK: ${first.studentCode}` : '',
    ].filter(Boolean).join('\n');
  };

  const handleSendCampaign = async () => {
    setIsSending(true);
    setSendResult(null);
    try {
      const r = await fetch('/api/campaigns', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          name: wizardName, type: wizardType,
          filters: {
            classIds: wizardClassIds.length ? wizardClassIds : undefined,
            tuitionStatuses: wizardStatuses,
            requireZalo: wizardRequireZalo,
            message: wizardType === 'GENERAL' ? wizardMessage : undefined,
          },
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setSendResult({ sentCount: data.campaign.sentCount, failedCount: data.campaign.failedCount });
        fetchCampaigns();
      } else { alert(data.message || 'Gửi thất bại'); }
    } catch { alert('Lỗi kết nối'); } finally { setIsSending(false); }
  };

  const resetWizard = () => {
    setStep(1); setWizardName(''); setWizardType('TUITION_REMINDER');
    setWizardClassIds([]); setWizardStatuses(['PENDING', 'DEBT']); setWizardRequireZalo(true);
    setWizardMessage(''); setSendResult(null);
  };

  // ── Followers helpers ──────────────────────────────────────────────────────
  const fetchFollowers = async () => {
    try {
      const r = await fetch('/api/zalo/followers', { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (d.followers) setFollowers(d.followers);
    } catch {}
  };

  const handleLinkFollower = async (followerId: string, type: 'teacher' | 'student', id: string) => {
    try {
      const r = await fetch('/api/zalo/link', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ zaloUserId: followerId, teacherId: type === 'teacher' ? id : undefined, studentId: type === 'student' ? id : undefined }),
      });
      alert((await r.json()).message);
      fetchFollowers();
    } catch { alert('Lỗi liên kết'); }
  };

  const toggleFollower = (id: string) =>
    setSelectedFollowers(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);

  const handleSendCS = async () => {
    if (!selectedFollowers.length || !csMessage.trim()) return alert('Chọn người nhận và nhập nội dung.');
    if (!confirm(`Gửi tin OA cho ${selectedFollowers.length} người?`)) return;
    setIsSendingCs(true);
    try {
      const r = await fetch('/api/zalo/send/cs', { method: 'POST', headers: authHeaders, body: JSON.stringify({ userIds: selectedFollowers, message: csMessage }) });
      const d = await r.json();
      alert(d.message + (d.errors?.length ? '\n' + d.errors.join('\n') : ''));
    } catch { alert('Lỗi gửi tin'); } finally { setIsSendingCs(false); }
  };

  const saveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const r = await fetch('/api/config/zalo', { method: 'POST', headers: authHeaders, body: JSON.stringify(config) });
      alert((await r.json()).message || (r.ok ? 'Thành công' : 'Thất bại'));
    } catch { alert('Lỗi lưu cấu hình'); } finally { setIsSavingConfig(false); }
  };

  const handleTestConnection = async () => {
    try {
      const r = await fetch('/api/config/zalo/test', { headers: { 'Authorization': `Bearer ${token}` } });
      alert((await r.json()).message);
    } catch { alert('Lỗi kết nối'); }
  };

  // ── Legacy ZNS send ────────────────────────────────────────────────────────
  const filteredStudents = students.filter(s => {
    const matchClass = selectedClass === 'all' || ((s as any).classes || []).some((c: any) => (c.classId ?? c.id) === selectedClass);
    const matchStatus = selectedStatus === 'all' || (s as any).tuitionStatus === selectedStatus;
    return matchClass && matchStatus;
  });
  const toggleStudent = (id: string) =>
    setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelectedStudents(selectedStudents.length === filteredStudents.length ? [] : filteredStudents.map(s => s.id));
  const handleSendZns = async () => {
    if (!selectedStudents.length || !selectedTemplate) return alert('Vui lòng chọn học sinh và mẫu tin nhắn.');
    if (!confirm(`Gửi ${selectedStudents.length} tin ZNS?`)) return;
    setIsSending(true);
    try {
      const r = await fetch('/api/zalo/send/tuition', { method: 'POST', headers: authHeaders, body: JSON.stringify({ studentIds: selectedStudents, templateId: selectedTemplate }) });
      setSendLog((await r.json()).message);
    } catch { alert('Lỗi khi gửi'); } finally { setIsSending(false); }
  };

  // ── Status badge helper ───────────────────────────────────────────────────
  const statusBadge = (status: string) => {
    const m: Record<string, string> = {
      READ: 'bg-green-100 text-green-700', SENT: 'bg-blue-100 text-blue-700',
      DELIVERED: 'bg-indigo-100 text-indigo-700', FAILED: 'bg-red-100 text-red-700',
    };
    return m[status] ?? 'bg-gray-100 text-gray-500';
  };

  const TAB = (tab: MainTab, label: string) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-hicado-navy text-white shadow' : 'bg-hicado-slate/30 text-hicado-navy/50 hover:bg-hicado-slate'}`}
    >{label}</button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-hicado-slate shadow-premium">
        <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-[0.3em] mb-2">Zalo OA</p>
        <h2 className="text-4xl font-serif font-black text-hicado-navy tracking-tight">Quản lý Chiến dịch</h2>
        <p className="text-hicado-navy/40 text-sm font-bold uppercase tracking-widest mt-2">Thiết kế · Gửi · Theo dõi kết quả</p>
        <div className="flex flex-wrap gap-2 mt-6">
          {TAB('campaigns', 'Chiến dịch')}
          {TAB('create', 'Tạo chiến dịch')}
          {TAB('tracking', 'Theo dõi')}
          {TAB('followers', 'Followers')}
          {TAB('config', 'Cài đặt')}
        </div>
      </div>

      {/* ══ TAB: CAMPAIGNS ══════════════════════════════════════════════════ */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm font-black text-hicado-navy/50 uppercase tracking-widest">{campaigns.length} chiến dịch</p>
            <button onClick={() => { resetWizard(); setActiveTab('create'); }}
              className="bg-hicado-navy text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-lg">
              + Tạo chiến dịch mới
            </button>
          </div>
          {campaigns.length === 0 && (
            <div className="bg-white border border-hicado-slate rounded-[2rem] p-16 text-center">
              <p className="text-4xl mb-4">📭</p>
              <p className="font-black text-hicado-navy/30 uppercase tracking-widest text-sm">Chưa có chiến dịch nào</p>
            </div>
          )}
          {campaigns.map(c => (
            <div key={c.id} className="bg-white border border-hicado-slate rounded-[1.5rem] p-6 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-lg transition-all">
              <div className="flex-1">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <span className="font-black text-hicado-navy text-base">{c.name}</span>
                  <span className={`text-xs px-3 py-1 rounded-full font-black uppercase tracking-widest ${c.type === 'TUITION_REMINDER' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {c.type === 'TUITION_REMINDER' ? 'Học phí' : 'Thông báo'}
                  </span>
                  <span className={`text-xs px-3 py-1 rounded-full font-black ${c.status === 'SENT' ? 'bg-green-100 text-green-700' : c.status === 'SENDING' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.status}
                  </span>
                </div>
                <div className="flex gap-6 text-xs text-hicado-navy/40 font-bold">
                  <span>📤 Đã gửi: <strong className="text-hicado-navy">{c.sentCount}</strong></span>
                  <span>👁 Đã đọc: <strong className="text-hicado-emerald">{c.readCount} ({c.readRate}%)</strong></span>
                  <span>❌ Lỗi: <strong className="text-rose-500">{c.failedCount}</strong></span>
                </div>
                {c.sentAt && <p className="text-[10px] text-hicado-navy/20 mt-1 font-bold">Gửi lúc: {new Date(c.sentAt).toLocaleString('vi-VN')}</p>}
              </div>
              <button
                onClick={() => { setTrackingCampaignId(c.id); loadCampaignDetail(c.id); setActiveTab('tracking'); }}
                className="bg-hicado-slate/40 hover:bg-hicado-navy hover:text-white text-hicado-navy px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all">
                Xem chi tiết →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ══ TAB: CREATE (5-step wizard) ══════════════════════════════════ */}
      {activeTab === 'create' && (
        <div className="bg-white border border-hicado-slate rounded-[2.5rem] p-8 max-w-2xl mx-auto">
          {/* Step progress */}
          <div className="flex items-center gap-2 mb-8">
            {([1, 2, 3, 4, 5] as WizardStep[]).map(s => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs flex-shrink-0 transition-colors ${step >= s ? 'bg-hicado-navy text-white' : 'bg-hicado-slate text-hicado-navy/30'}`}>{s}</div>
                {s < 5 && <div className={`flex-1 h-0.5 transition-colors ${step > s ? 'bg-hicado-navy' : 'bg-hicado-slate'}`} />}
              </div>
            ))}
          </div>

          {/* Step 1: Name + Type */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-xl font-serif font-black text-hicado-navy">Tên & Loại chiến dịch</h3>
              <div>
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Tên chiến dịch</label>
                <input value={wizardName} onChange={e => setWizardName(e.target.value)}
                  className="w-full bg-hicado-slate/20 border border-transparent rounded-2xl px-5 py-4 text-hicado-navy font-black focus:bg-white focus:border-hicado-navy/30 outline-none"
                  placeholder="VD: Nhắc học phí tháng 5/2026" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(['TUITION_REMINDER', 'GENERAL'] as CampaignType[]).map(t => (
                  <label key={t} onClick={() => setWizardType(t)}
                    className={`p-5 border-2 rounded-2xl cursor-pointer transition-all ${wizardType === t ? 'border-hicado-navy bg-hicado-navy/5' : 'border-hicado-slate hover:border-hicado-navy/30'}`}>
                    <p className="text-2xl mb-2">{t === 'TUITION_REMINDER' ? '💰' : '📢'}</p>
                    <p className="font-black text-hicado-navy text-sm">{t === 'TUITION_REMINDER' ? 'Nhắc học phí' : 'Thông báo chung'}</p>
                    <p className="text-xs text-hicado-navy/40 mt-1">{t === 'TUITION_REMINDER' ? 'Số buổi + tổng tiền + QR nộp tiền' : 'Tự soạn nội dung tự do'}</p>
                  </label>
                ))}
              </div>
              <button onClick={() => setStep(2)} disabled={!wizardName.trim()}
                className="w-full bg-hicado-navy text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest disabled:bg-hicado-slate transition-all hover:scale-[1.02]">
                Tiếp theo →
              </button>
            </div>
          )}

          {/* Step 2: Filters */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-xl font-serif font-black text-hicado-navy">Lọc đối tượng nhận</h3>
              <div>
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-3">Lớp học (để trống = tất cả lớp)</label>
                <div className="grid grid-cols-2 gap-2">
                  {classes.map(cls => (
                    <label key={cls.id} className={`flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-all text-sm ${wizardClassIds.includes(cls.id) ? 'border-hicado-navy bg-hicado-navy/5 font-black' : 'border-hicado-slate hover:border-hicado-navy/30'}`}>
                      <input type="checkbox" className="accent-hicado-navy" checked={wizardClassIds.includes(cls.id)}
                        onChange={() => setWizardClassIds(prev => prev.includes(cls.id) ? prev.filter(x => x !== cls.id) : [...prev, cls.id])} />
                      <span className="text-hicado-navy font-bold truncate">{cls.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-3">Trạng thái học phí</label>
                <div className="flex gap-3 flex-wrap">
                  {[{ v: 'PENDING', l: 'Chưa nộp', c: 'amber' }, { v: 'DEBT', l: 'Nợ', c: 'red' }, { v: 'PAID', l: 'Đã nộp', c: 'green' }].map(({ v, l, c }) => (
                    <label key={v} className={`flex items-center gap-2 px-4 py-2 border rounded-xl cursor-pointer text-sm font-bold transition-all ${wizardStatuses.includes(v) ? `border-${c}-400 bg-${c}-50 text-${c}-700` : 'border-hicado-slate text-hicado-navy/40'}`}>
                      <input type="checkbox" className="accent-hicado-navy" checked={wizardStatuses.includes(v)}
                        onChange={() => setWizardStatuses(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])} />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
              <div onClick={() => setWizardRequireZalo(v => !v)}
                className="flex items-center gap-4 p-4 bg-hicado-slate/20 rounded-2xl cursor-pointer">
                <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-0.5 ${wizardRequireZalo ? 'bg-hicado-emerald' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${wizardRequireZalo ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
                <div>
                  <p className="font-black text-hicado-navy text-sm">Chỉ gửi học sinh có Zalo</p>
                  <p className="text-xs text-hicado-navy/40">Bỏ tắt để thử gửi cho tất cả (có thể thất bại nếu chưa link)</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-2xl border border-hicado-slate font-black text-sm text-hicado-navy/40 hover:bg-hicado-slate transition-all">← Quay lại</button>
                <button onClick={() => setStep(3)} className="flex-1 bg-hicado-navy text-white py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-[1.02] transition-all">Xem danh sách →</button>
              </div>
            </div>
          )}

          {/* Step 3: Preview recipients */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-xl font-serif font-black text-hicado-navy">Danh sách người nhận</h3>
              <div className="flex gap-4 text-sm font-bold text-hicado-navy/60">
                <span>Tổng: <strong className="text-hicado-navy">{recipientPreview.length}</strong></span>
                <span>Có Zalo: <strong className="text-hicado-emerald">{recipientPreview.filter(s => (s as any).zaloUserId).length}</strong></span>
              </div>
              <div className="border border-hicado-slate rounded-2xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-left">
                  <thead className="bg-hicado-slate/20 sticky top-0">
                    <tr>
                      {['Học sinh', 'Lớp', 'Học phí', 'Zalo'].map(h => (
                        <th key={h} className="px-4 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recipientPreview.map(s => (
                      <tr key={s.id} className="border-t border-hicado-slate/30 hover:bg-hicado-slate/10">
                        <td className="px-4 py-3 font-bold text-hicado-navy">{s.name}</td>
                        <td className="px-4 py-3 text-xs text-hicado-navy/40">
                          {((s as any).classes || []).slice(0, 2).map((c: any) => {
                            const cls = classes.find(x => x.id === (c.classId ?? c.id));
                            return cls?.name ?? '—';
                          }).join(', ')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${(s as any).tuitionStatus === 'PAID' ? 'bg-green-100 text-green-700' : (s as any).tuitionStatus === 'DEBT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {(s as any).tuitionStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {(s as any).zaloUserId
                            ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✓ Có</span>
                            : <span className="text-xs text-hicado-navy/20 font-bold">—</span>}
                        </td>
                      </tr>
                    ))}
                    {recipientPreview.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-hicado-navy/30 text-sm font-bold">Không có học sinh phù hợp điều kiện.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-2xl border border-hicado-slate font-black text-sm text-hicado-navy/40 hover:bg-hicado-slate transition-all">← Quay lại</button>
                <button onClick={() => setStep(4)} disabled={recipientPreview.length === 0}
                  className="flex-1 bg-hicado-navy text-white py-3 rounded-2xl font-black text-sm uppercase tracking-widest disabled:bg-hicado-slate hover:scale-[1.02] transition-all">
                  Preview nội dung →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Message preview */}
          {step === 4 && (
            <div className="space-y-5">
              <h3 className="text-xl font-serif font-black text-hicado-navy">Nội dung tin nhắn</h3>
              {wizardType === 'TUITION_REMINDER' ? (
                <div>
                  <p className="text-xs font-bold text-hicado-navy/40 uppercase tracking-widest mb-3">Mẫu tin gửi cho: <strong className="text-hicado-navy">{recipientPreview[0]?.name ?? '—'}</strong></p>
                  <div className="bg-[#e7f3ff] rounded-2xl p-5 font-mono text-sm text-gray-800 whitespace-pre-wrap leading-relaxed border border-blue-100">
                    {buildSampleMessage()}
                  </div>
                  <p className="text-xs text-hicado-navy/30 mt-3 font-bold">Nội dung thực tế sẽ được tính chính xác từ dữ liệu điểm danh và lớp của từng học sinh.</p>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Nội dung thông báo</label>
                  <textarea value={wizardMessage} onChange={e => setWizardMessage(e.target.value)} rows={6}
                    className="w-full bg-hicado-slate/20 border border-transparent rounded-2xl px-5 py-4 text-hicado-navy font-bold focus:bg-white focus:border-hicado-navy/30 outline-none resize-none"
                    placeholder="Nhập nội dung thông báo gửi đến phụ huynh/học sinh..." />
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-2xl border border-hicado-slate font-black text-sm text-hicado-navy/40 hover:bg-hicado-slate transition-all">← Quay lại</button>
                <button onClick={() => setStep(5)} disabled={wizardType === 'GENERAL' && !wizardMessage.trim()}
                  className="flex-1 bg-hicado-navy text-white py-3 rounded-2xl font-black text-sm uppercase tracking-widest disabled:bg-hicado-slate hover:scale-[1.02] transition-all">
                  Xác nhận →
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Confirm + Send */}
          {step === 5 && (
            <div className="space-y-5">
              <h3 className="text-xl font-serif font-black text-hicado-navy">Xác nhận & Gửi</h3>
              <div className="bg-hicado-slate/20 rounded-2xl p-5 space-y-3 text-sm">
                {[
                  { l: 'Chiến dịch', v: wizardName },
                  { l: 'Loại', v: wizardType === 'TUITION_REMINDER' ? 'Nhắc học phí' : 'Thông báo chung' },
                  { l: 'Người nhận', v: `${recipientPreview.length} học sinh` },
                  { l: 'Có Zalo', v: `${recipientPreview.filter(s => (s as any).zaloUserId).length} người (sẽ thực sự gửi được)` },
                ].map(({ l, v }) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-hicado-navy/40 font-black uppercase text-xs tracking-widest">{l}</span>
                    <span className="font-black text-hicado-navy text-right">{v}</span>
                  </div>
                ))}
              </div>
              {sendResult ? (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="font-black text-green-700">Gửi thành công {sendResult.sentCount} tin</p>
                  {sendResult.failedCount > 0 && <p className="text-sm text-rose-500 font-bold mt-1">Thất bại: {sendResult.failedCount}</p>}
                  <div className="flex gap-3 mt-4">
                    <button onClick={resetWizard} className="flex-1 py-3 rounded-2xl border border-hicado-slate font-black text-sm text-hicado-navy/60 hover:bg-hicado-slate transition-all">Tạo chiến dịch mới</button>
                    <button onClick={() => setActiveTab('campaigns')} className="flex-1 py-3 bg-hicado-navy text-white rounded-2xl font-black text-sm uppercase tracking-widest">Xem danh sách</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button onClick={handleSendCampaign} disabled={isSending}
                    className="w-full bg-hicado-navy text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest disabled:bg-hicado-slate/50 hover:scale-[1.02] transition-all shadow-lg">
                    {isSending ? '⏳ Đang gửi...' : `🚀 Gửi ${recipientPreview.filter(s => (s as any).zaloUserId).length} tin Zalo`}
                  </button>
                  <button onClick={() => setStep(4)} disabled={isSending} className="w-full py-3 rounded-2xl border border-hicado-slate font-black text-sm text-hicado-navy/40 hover:bg-hicado-slate transition-all">← Quay lại</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: TRACKING ══════════════════════════════════════════════════ */}
      {activeTab === 'tracking' && (
        <div className="space-y-5">
          <div className="flex gap-4 items-center flex-wrap">
            <select value={trackingCampaignId}
              onChange={e => { setTrackingCampaignId(e.target.value); loadCampaignDetail(e.target.value); }}
              className="border border-hicado-slate bg-white px-4 py-3 rounded-xl text-sm font-bold text-hicado-navy outline-none flex-1 max-w-sm">
              <option value="">-- Chọn chiến dịch --</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name} — {new Date(c.createdAt).toLocaleDateString('vi-VN')}</option>
              ))}
            </select>
            {campaignDetail && (
              <div className="flex gap-4 text-sm font-bold">
                <span className="text-hicado-navy/40">Gửi: <strong className="text-hicado-navy">{campaignDetail.sentCount}</strong></span>
                <span className="text-hicado-navy/40">Đọc: <strong className="text-hicado-emerald">{campaignDetail.readCount} ({campaignDetail.readRate}%)</strong></span>
                <span className="text-hicado-navy/40">Lỗi: <strong className="text-rose-500">{campaignDetail.failedCount}</strong></span>
              </div>
            )}
          </div>

          {detailLoading && <div className="text-center py-8 text-hicado-navy/30 font-bold">Đang tải...</div>}

          {campaignDetail && !detailLoading && (
            <div className="bg-white border border-hicado-slate rounded-[2rem] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[600px]">
                  <thead className="bg-hicado-slate/20">
                    <tr>
                      {['Học sinh', 'Mã HS', 'Trạng thái', 'Giờ gửi', 'Giờ đọc'].map(h => (
                        <th key={h} className="px-5 py-4 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaignDetail.logs.map(log => (
                      <tr key={log.id} className="border-t border-hicado-slate/30 hover:bg-hicado-slate/10">
                        <td className="px-5 py-4 font-bold text-hicado-navy">{log.student?.name ?? '—'}</td>
                        <td className="px-5 py-4 font-mono text-xs text-hicado-navy/40">{log.student?.studentCode ?? '—'}</td>
                        <td className="px-5 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest ${statusBadge(log.status)}`}>{log.status}</span>
                        </td>
                        <td className="px-5 py-4 text-xs text-hicado-navy/40">{new Date(log.sentAt).toLocaleString('vi-VN')}</td>
                        <td className="px-5 py-4 text-xs text-hicado-navy/40">{log.readAt ? new Date(log.readAt).toLocaleString('vi-VN') : '—'}</td>
                      </tr>
                    ))}
                    {campaignDetail.logs.length === 0 && (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-hicado-navy/30 font-bold">Không có bản ghi.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!trackingCampaignId && !detailLoading && (
            <div className="bg-white border border-hicado-slate rounded-[2rem] p-16 text-center">
              <p className="text-4xl mb-4">📊</p>
              <p className="font-black text-hicado-navy/30 uppercase tracking-widest text-sm">Chọn chiến dịch để xem kết quả</p>
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: FOLLOWERS (existing) ═══════════════════════════════════ */}
      {activeTab === 'followers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div className="bg-hicado-navy/5 rounded-[1.5rem] border border-hicado-navy/10 p-5">
              <h2 className="font-black text-hicado-navy mb-1">Liên kết Zalo User ID thủ công</h2>
              <p className="text-xs text-hicado-navy/50 mb-4">Lấy User ID từ oa.zalo.me → Tin nhắn → click người dùng → copy ID trong URL.</p>
              <div className="space-y-3">
                <input type="text" className="w-full border border-hicado-slate rounded-xl p-3 text-sm font-mono bg-white"
                  placeholder="Zalo User ID" value={manualUserId} onChange={e => setManualUserId(e.target.value)} />
                <div className="flex gap-3">
                  <select className="flex-1 border border-hicado-slate rounded-xl p-3 text-sm bg-white" value={manualLinkType} onChange={e => setManualLinkType(e.target.value)}>
                    <option value="teacher">Giáo viên</option>
                    <option value="student">Học sinh</option>
                  </select>
                  <select className="flex-1 border border-hicado-slate rounded-xl p-3 text-sm bg-white" value={manualLinkId} onChange={e => setManualLinkId(e.target.value)}>
                    <option value="">-- Chọn --</option>
                    {manualLinkType === 'teacher'
                      ? teachers.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)
                      : students.slice(0, 100).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button disabled={!manualUserId.trim() || !manualLinkId}
                  onClick={() => {
                    handleLinkFollower(manualUserId.trim(), manualLinkType as 'teacher' | 'student', manualLinkId);
                    if (!selectedFollowers.includes(manualUserId.trim())) setSelectedFollowers(p => [...p, manualUserId.trim()]);
                    setFollowers(p => p.some(f => f.userId === manualUserId.trim()) ? p : [...p, { userId: manualUserId.trim(), displayName: 'Manual Entry', avatar: '', tags: [], linkedTeacher: null, linkedStudent: null }]);
                    setManualUserId('');
                  }}
                  className="w-full bg-hicado-navy text-white py-3 rounded-xl font-black text-sm disabled:bg-hicado-slate transition-all">
                  Liên kết
                </button>
              </div>
            </div>
            <div className="bg-emerald-50 rounded-[1.5rem] border border-emerald-200 p-5">
              <h2 className="font-black text-hicado-emerald mb-1">Tự động qua Webhook</h2>
              <p className="text-xs text-gray-600 mb-2">Khi thầy/cô nhắn username của họ vào OA, hệ thống tự động lưu Zalo User ID.</p>
              <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
                <li>Cấu hình Webhook URL tại oa.zalo.me → Webhook</li>
                <li><code className="bg-white px-1 rounded font-mono">/api/webhook/zalo</code></li>
                <li>Nhắn username (VD: <code className="bg-white px-1 rounded font-mono">thaychien</code>) vào OA</li>
              </ol>
            </div>
            {followers.length > 0 && (
              <div className="bg-white border border-hicado-slate rounded-[1.5rem] overflow-hidden">
                <div className="bg-hicado-navy px-5 py-3 flex justify-between">
                  <span className="text-white font-black text-sm">{followers.length} follower</span>
                  <span className="text-white/50 text-xs font-bold">{selectedFollowers.length} đã chọn</span>
                </div>
                <div className="divide-y divide-hicado-slate/30 max-h-56 overflow-y-auto custom-scrollbar">
                  {followers.map(f => (
                    <div key={f.userId} onClick={() => toggleFollower(f.userId)}
                      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-hicado-slate/10 transition-all ${selectedFollowers.includes(f.userId) ? 'bg-emerald-50' : ''}`}>
                      <input type="checkbox" checked={selectedFollowers.includes(f.userId)} readOnly className="accent-hicado-navy" />
                      <div className="w-8 h-8 rounded-full bg-hicado-navy text-white flex items-center justify-center font-black text-xs">{f.displayName.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-hicado-navy text-sm truncate">{f.displayName}</p>
                        <p className="text-xs text-hicado-navy/30 font-mono truncate">{f.userId}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={fetchFollowers} className="w-full py-3 border border-hicado-slate rounded-xl font-black text-xs text-hicado-navy/50 hover:bg-hicado-slate transition-all uppercase tracking-widest">
              Tải Followers từ Zalo OA
            </button>
          </div>
          <div className="bg-white border border-hicado-slate rounded-[1.5rem] p-5 self-start sticky top-6">
            <h2 className="font-black text-hicado-navy mb-1">Gửi tin OA (Customer Service)</h2>
            <p className="text-xs text-hicado-navy/40 mb-4">Gửi trực tiếp cho followers đã liên kết. Không cần ZNS approval.</p>
            <textarea className="w-full border border-hicado-slate rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-hicado-emerald mb-2" rows={6}
              placeholder="Nội dung tin nhắn OA..." value={csMessage} onChange={e => setCsMessage(e.target.value)} />
            <p className="text-xs text-hicado-navy/30 mb-3 font-bold">Người nhận: <strong className="text-hicado-navy">{selectedFollowers.length}</strong></p>
            <button onClick={handleSendCS} disabled={isSendingCs || !selectedFollowers.length || !csMessage.trim()}
              className="w-full bg-hicado-emerald text-hicado-navy font-black py-3 rounded-xl disabled:bg-hicado-slate/30 disabled:text-hicado-navy/20 transition-all text-sm">
              {isSendingCs ? 'Đang gửi...' : `Gửi ${selectedFollowers.length} tin OA`}
            </button>
          </div>
        </div>
      )}

      {/* ══ TAB: CONFIG (existing) ══════════════════════════════════════ */}
      {activeTab === 'config' && (
        <div className="max-w-2xl mx-auto bg-white border border-hicado-slate rounded-[2.5rem] p-8">
          <h2 className="text-xl font-serif font-black text-hicado-navy mb-2">Cấu hình API Zalo OA</h2>
          <p className="text-sm text-hicado-navy/40 mb-6">Truy cập developers.zalo.me để lấy thông tin API.</p>
          <div className="space-y-4">
            {[
              { label: 'App ID', key: 'ZALO_APP_ID', type: 'text' },
              { label: 'Secret Key', key: 'ZALO_SECRET_KEY', type: 'password' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">{label}</label>
                <input type={type} className="w-full bg-hicado-slate/20 border border-transparent rounded-2xl px-5 py-4 text-hicado-navy font-bold focus:bg-white focus:border-hicado-navy/30 outline-none"
                  value={(config as any)[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })} />
              </div>
            ))}
            <div className="pt-4 border-t border-hicado-slate">
              <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Refresh Token</label>
              <textarea className="w-full bg-hicado-slate/20 border border-transparent rounded-2xl px-5 py-4 text-hicado-navy font-mono text-xs focus:bg-white focus:border-hicado-navy/30 outline-none" rows={3}
                value={config.ZALO_REFRESH_TOKEN} onChange={e => setConfig({ ...config, ZALO_REFRESH_TOKEN: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Access Token</label>
              <textarea className="w-full bg-hicado-slate/20 border border-transparent rounded-2xl px-5 py-4 text-hicado-navy font-mono text-xs focus:bg-white focus:border-hicado-navy/30 outline-none" rows={3}
                value={config.ZALO_ACCESS_TOKEN} onChange={e => setConfig({ ...config, ZALO_ACCESS_TOKEN: e.target.value })} />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={handleTestConnection} className="flex-1 py-3 bg-hicado-emerald/10 text-hicado-emerald font-black rounded-2xl text-sm hover:bg-hicado-emerald/20 transition-all">Test Kết Nối</button>
            <button onClick={saveConfig} disabled={isSavingConfig} className="flex-1 py-3 bg-hicado-navy text-white font-black rounded-2xl text-sm disabled:bg-hicado-slate transition-all hover:scale-[1.02]">
              {isSavingConfig ? 'Đang lưu...' : 'Lưu Cấu Hình'}
            </button>
          </div>

          {/* Legacy ZNS send (collapsed) */}
          <details className="mt-6 border-t border-hicado-slate pt-5">
            <summary className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest cursor-pointer">Gửi ZNS (nâng cao)</summary>
            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <select className="border border-hicado-slate rounded-xl p-2 text-sm flex-1 bg-white" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
                  <option value="all">-- Tất cả lớp --</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="border border-hicado-slate rounded-xl p-2 text-sm flex-1 bg-white" value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>
                  <option value="all">-- Học phí --</option>
                  <option value="PENDING">Chưa nộp</option>
                  <option value="DEBT">Nợ</option>
                  <option value="PAID">Đã nộp</option>
                </select>
              </div>
              <div className="border border-hicado-slate rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-hicado-slate/20 sticky top-0"><tr>
                    <th className="p-2"><input type="checkbox" checked={filteredStudents.length > 0 && selectedStudents.length === filteredStudents.length} onChange={toggleAll} /></th>
                    <th className="p-2 text-left">Học sinh</th><th className="p-2 text-left">Học phí</th>
                  </tr></thead>
                  <tbody>{filteredStudents.map(s => (
                    <tr key={s.id} className="border-t border-hicado-slate/30">
                      <td className="p-2"><input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={() => toggleStudent(s.id)} /></td>
                      <td className="p-2 font-bold">{s.name}</td>
                      <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-xs font-bold ${(s as any).tuitionStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{(s as any).tuitionStatus}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <select className="w-full border border-hicado-slate rounded-xl p-2 text-sm bg-white" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                <option value="">-- Chọn mẫu ZNS --</option>
                {templates.map(t => <option key={t.id} value={t.templateId}>{t.templateName}</option>)}
              </select>
              <button onClick={handleSendZns} disabled={isSending || !selectedStudents.length || !selectedTemplate}
                className="w-full bg-hicado-navy text-white py-2.5 rounded-xl font-black text-sm disabled:bg-hicado-slate/50 transition-all">
                {isSending ? 'Đang xử lý...' : `Gửi ZNS (${selectedStudents.length})`}
              </button>
              {sendLog && <p className="text-xs text-green-700 bg-green-50 p-2 rounded-xl">{sendLog}</p>}
            </div>
          </details>
        </div>
      )}
    </div>
  );
};
