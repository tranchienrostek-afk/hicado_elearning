import { useState, useEffect, useCallback, useMemo } from 'react';
import { useCenterStore, useAuthStore } from '@/store';
import { shouldLoadMultiClassPreview } from '@/utils/zalo-campaign-preview';

// ── Types ─────────────────────────────────────────────────────────────────────
type MainTab = 'campaigns' | 'create' | 'tracking' | 'followers' | 'mapping' | 'config';
type WizardStep = 1 | 2 | 3 | 4 | 5;
type CampaignType = 'TUITION_REMINDER' | 'GENERAL' | 'CUSTOM_TUITION';

interface Campaign {
  id: string; name: string; type: CampaignType; status: string;
  sentCount: number; znsSentCount?: number; readCount: number; failedCount: number; skippedCount?: number; readRate: number;
  createdAt: string; sentAt?: string;
}
interface CampaignLog {
  id: string; status: string; sentAt: string; readAt?: string; errorReason?: string | null;
  student: { name: string; studentCode?: string } | null;
}
interface CampaignDetail extends Campaign { logs: CampaignLog[] }

interface MultiClassPreviewItem {
  studentId: string;
  studentName: string;
  studentCode?: string;
  hasZalo: boolean;
  mainClass: { classId: string; className: string; teacherNames?: string[]; attended: number; tuitionPerSession: number; subtotal: number };
  otherClasses: Array<{ classId: string; className: string; classCode?: string; teacherNames?: string[]; attended: number; tuitionPerSession: number; subtotal: number }>;
  alreadySent: boolean;
  sentLogs: Array<{ sentAt: string; coveredClassIds: string[] }>;
}

interface MergeOption {
  extraClassIds: string[];
  forceResend: boolean;
}


interface Follower {
  userId: string; displayName: string; avatar: string; tags: string[];
  linkedTeacher: { id: string; name: string; phone: string } | null;
  linkedStudent: { id: string; name: string; parentPhone: string } | null;
}

interface MappingCandidate {
  id: string;
  name: string;
  phone?: string;
  parentPhone?: string;
  schoolClass?: string;
  zaloUserId?: string | null;
}

interface MappingAudit {
  id: string;
  action: 'LINK' | 'UNLINK' | 'OVERRIDE';
  zaloUserId: string;
  targetType: string;
  targetId: string;
  targetName: string;
  previousTargetId?: string;
  previousTargetName?: string;
  performedByName: string;
  performedAt: string;
}

// ── Follower mapping helpers ───────────────────────────────────────────────────
const deaccent = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

const nameMatchScore = (a: string, b: string): number => {
  const na = deaccent(a);
  const nb = deaccent(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 88;
  const wa = na.split(/\s+/);
  const wb = nb.split(/\s+/);
  const common = wa.filter(w => wb.includes(w)).length;
  return Math.round((common / Math.max(wa.length, wb.length)) * 75);
};

// ── Component ─────────────────────────────────────────────────────────────────
export const ZaloCampaignPage = () => {
  const { classes, students, fetchClasses, fetchStudents, fetchTeachers } = useCenterStore();
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
  const [wizardFallbackZNS, setWizardFallbackZNS] = useState(false);
  const [wizardZnsTemplateId, setWizardZnsTemplateId] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sentCount: number; znsSentCount: number; failedCount: number; skippedCount: number; skippedStudents?: any[] } | null>(null);

  // Date range for tuition reminder
  const [wizardFromDate, setWizardFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [wizardToDate, setWizardToDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10));
  const [wizardBillingMonth, setWizardBillingMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [collectionFromDate, setCollectionFromDate] = useState(new Date().toISOString().slice(0, 10));
  const [collectionToDate, setCollectionToDate] = useState(new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

  // Custom Tuition State (Task #9)
  const [customTuitionItems, setCustomTuitionItems] = useState<Record<string, { sessions: number; pricePerSession: number; totalOverride?: number; note?: string }>>({});
  const [customGlobalSessions, setCustomGlobalSessions] = useState(8);
  const [customGlobalPrice, setCustomGlobalPrice] = useState(150000);
  const [customSendVia, setCustomSendVia] = useState<'AUTO' | 'CS' | 'ZNS'>('AUTO');

  // Multi-class Deduplication State (Task #10)
  const [multiClassPreview, setMultiClassPreview] = useState<MultiClassPreviewItem[]>([]);
  const [mergeOptions, setMergeOptions] = useState<Record<string, MergeOption>>({});
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // ── Followers ──────────────────────────────────────────────────────────────
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [csMessage, setCsMessage] = useState('');
  const [selectedFollowers, setSelectedFollowers] = useState<string[]>([]);
  const [isSendingCs, setIsSendingCs] = useState(false);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followerFilter, setFollowerFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [drawerFollower, setDrawerFollower] = useState<Follower | null>(null);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  // ── Manual Mapping ────────────────────────────────────────────────────────
  const [candidateType, setCandidateType] = useState<'STUDENTS' | 'TEACHERS'>('STUDENTS');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidates, setCandidates] = useState<MappingCandidate[]>([]);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mappingAudits, setMappingAudits] = useState<MappingAudit[]>([]);
  const [mappingAuditsLoading, setMappingAuditsLoading] = useState(false);
  const [classStats, setClassStats] = useState<Array<{
    classId: string; className: string; classCode?: string;
    totalStudents: number; mappedStudents: number; mappedPercent: number;
  }>>([]);
  const [classStatsLoading, setClassStatsLoading] = useState(false);
  const [selectedMappingClass, setSelectedMappingClass] = useState<string>('ALL');
  const [mappingStatusFilter, setMappingStatusFilter] = useState<'ALL' | 'LINKED' | 'UNLINKED'>('ALL');
  const [conflictData, setConflictData] = useState<{
    zaloUserId: string;
    targetId: string;
    targetType: string;
    message: string;
    conflictName: string;
    conflictNames: string;
  } | null>(null);

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

  // ── Recipient preview (3 groups) ─────────────────────────────────────────
  const allFiltered = students.filter((s: any) => {
    if (wizardStatuses.length && !wizardStatuses.includes(s.tuitionStatus)) return false;
    if (wizardClassIds.length) {
      const sClassIds = (s.classes || []).map((c: any) => c.classId ?? c.id);
      if (!wizardClassIds.some((id: string) => sClassIds.includes(id))) return false;
    }
    return true;
  });
  const uidGroup = allFiltered.filter((s: any) => !!s.zaloUserId);
  const phoneGroup = allFiltered.filter((s: any) => !s.zaloUserId && !!(s.parentPhone || s.studentPhone));
  const noContactGroup = allFiltered.filter((s: any) => !s.zaloUserId && !(s.parentPhone || s.studentPhone));
  const recipientPreview = wizardRequireZalo ? uidGroup : allFiltered;

  const primaryWizardClassId = wizardClassIds[0];
  const getMergeOption = (studentId: string): MergeOption => mergeOptions[studentId] ?? { extraClassIds: [], forceResend: false };
  const getCoveredClassIdsForStudent = (studentId: string) => {
    if (!primaryWizardClassId) return [];
    const opt = getMergeOption(studentId);
    return Array.from(new Set([primaryWizardClassId, ...opt.extraClassIds]));
  };
  const buildStudentCoveredClasses = () => {
    const result: Record<string, string[]> = {};
    recipientPreview.forEach(s => { result[s.id] = getCoveredClassIdsForStudent(s.id); });
    return result;
  };
  const buildForceResendStudentIds = () => recipientPreview.filter(s => getMergeOption(s.id).forceResend).map(s => s.id);
  const setMergeExtra = (studentId: string, classId: string, checked: boolean) => {
    setMergeOptions(prev => {
      const current = prev[studentId] ?? { extraClassIds: [], forceResend: false };
      const nextExtra = checked
        ? Array.from(new Set([...current.extraClassIds, classId]))
        : current.extraClassIds.filter(id => id !== classId);
      return { ...prev, [studentId]: { ...current, extraClassIds: nextExtra } };
    });
  };
  const setForceResend = (studentId: string, checked: boolean) => {
    setMergeOptions(prev => {
      const current = prev[studentId] ?? { extraClassIds: [], forceResend: false };
      return { ...prev, [studentId]: { ...current, forceResend: checked } };
    });
  };




  const handleSendCampaign = async () => {
    setIsSending(true);
    setSendResult(null);
    try {
      if (wizardType === 'CUSTOM_TUITION') {
        const items = recipientPreview.map(s => {
          const c = customTuitionItems[s.id] || { sessions: customGlobalSessions, pricePerSession: customGlobalPrice };
          return {
            studentId: s.id,
            sessions: c.sessions,
            pricePerSession: c.pricePerSession,
            totalOverride: c.totalOverride,
            note: c.note,
            classId: primaryWizardClassId,
          };
        });

        const r = await fetch('/api/zalo/send/custom-tuition', {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({
            name: wizardName,
            items,
            sendVia: customSendVia,
            templateId: customSendVia !== 'CS' ? wizardZnsTemplateId : undefined,
            fromDate: wizardFromDate,
            toDate: wizardToDate,
            collectionFromDate,
            collectionToDate,
            studentCoveredClasses: buildStudentCoveredClasses(),
            forceResendStudentIds: buildForceResendStudentIds(),
            billingMonth: wizardBillingMonth,
          }),
        });
        const data = await r.json();
        if (r.ok) {
          setSendResult({
            sentCount: data.sentCount,
            znsSentCount: data.znsSentCount ?? 0,
            failedCount: data.failedCount,
            skippedCount: data.skippedCount ?? 0,
            skippedStudents: (data.results || []).filter((r: any) => r.status === 'SKIPPED')
          });
          fetchCampaigns();
        } else { alert(data.message || 'Gửi thất bại'); }
        return;
      }

      // Normal TUITION_REMINDER or GENERAL
      const r = await fetch('/api/campaigns', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          name: wizardName, type: wizardType,
          filters: {
            classIds: wizardClassIds.length ? wizardClassIds : undefined,
            tuitionStatuses: wizardStatuses,
            requireZalo: wizardRequireZalo,
            message: wizardType === 'GENERAL' ? wizardMessage : undefined,
            fallbackZNS: wizardFallbackZNS,
            znsTemplateId: wizardFallbackZNS ? wizardZnsTemplateId : undefined,
            fromDate: wizardFromDate,
            toDate: wizardToDate,
            collectionFromDate,
            collectionToDate,
            studentCoveredClasses: buildStudentCoveredClasses(),
            forceResendStudentIds: buildForceResendStudentIds(),
            billingMonth: wizardBillingMonth,
          },
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setSendResult({
          sentCount: data.campaign.sentCount,
          znsSentCount: data.campaign.znsSentCount ?? 0,
          failedCount: data.campaign.failedCount,
          skippedCount: data.campaign.skippedCount ?? 0,
          skippedStudents: (data.campaign.results || []).filter((r: any) => r.status === 'SKIPPED')
        });
        fetchCampaigns();
      } else { alert(data.message || 'Gửi thất bại'); }
    } catch { alert('Lỗi kết nối'); } finally { setIsSending(false); }
  };

  const resetWizard = () => {
    setStep(1); setWizardName(''); setWizardType('TUITION_REMINDER');
    setWizardClassIds([]); setWizardStatuses(['PENDING', 'DEBT']); setWizardRequireZalo(true);
    setWizardMessage(''); setSendResult(null); setCustomTuitionItems({}); setMergeOptions({}); setCustomSendVia('AUTO');
    setCollectionFromDate(new Date().toISOString().slice(0, 10));
    setCollectionToDate(new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  };

  // ── Followers helpers ──────────────────────────────────────────────────────
  const fetchFollowers = useCallback(async () => {
    setFollowersLoading(true);
    try {
      const r = await fetch('/api/zalo/followers', { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (!r.ok) {
        alert(d.message || `Lỗi ${r.status}: Không thể tải followers`);
        return;
      }
      if (Array.isArray(d.followers)) {
        setFollowers(d.followers);
      } else {
        alert(d.message || 'Phản hồi không hợp lệ từ Zalo OA');
      }
    } catch (e: any) {
      alert('Lỗi kết nối: ' + (e.message || 'Không xác định'));
    } finally {
      setFollowersLoading(false);
    }
  }, [token]);

  const fetchCandidates = useCallback(async (type: string, search: string, page: number, classId = 'ALL', status = 'ALL') => {
    if (!token) return;
    setCandidatesLoading(true);
    try {
      const params = new URLSearchParams({ type, search, page: String(page) });
      if (classId && classId !== 'ALL') params.set('classId', classId);
      if (status && status !== 'ALL') params.set('status', status);
      const r = await fetch(`/api/zalo/mapping/candidates?${params}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) { setCandidates(d.items); setCandidateTotal(d.total); }
    } catch {} finally { setCandidatesLoading(false); }
  }, [token]);

  const fetchClassStats = useCallback(async () => {
    if (!token) return;
    setClassStatsLoading(true);
    try {
      const r = await fetch('/api/zalo/mapping/class-stats', { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) setClassStats(await r.json());
    } catch {} finally { setClassStatsLoading(false); }
  }, [token]);

  const fetchMappingAudits = useCallback(async () => {
    if (!token) return;
    setMappingAuditsLoading(true);
    try {
      const r = await fetch('/api/zalo/mapping/audit-log', { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) setMappingAudits(d);
    } catch {} finally { setMappingAuditsLoading(false); }
  }, [token]);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(candidateSearch), 500);
    return () => clearTimeout(h);
  }, [candidateSearch]);

  useEffect(() => {
    if (activeTab === 'mapping') {
      fetchCandidates(candidateType, debouncedSearch, candidatePage, selectedMappingClass, mappingStatusFilter);
    }
  }, [activeTab, candidateType, debouncedSearch, candidatePage, selectedMappingClass, mappingStatusFilter, fetchCandidates]);

  useEffect(() => {
    if (activeTab === 'mapping') fetchMappingAudits();
  }, [activeTab, fetchMappingAudits]);

  useEffect(() => {
    if (activeTab === 'mapping' || activeTab === 'create') fetchClassStats();
  }, [activeTab, fetchClassStats]);

  // Fetch Multi-class preview when entering Step 3 (Task #10)
  // ── Auto-populate custom tuition items with overrides ─────────────────────
  useEffect(() => {
    if (activeTab === 'create' && step === 3 && wizardType === 'CUSTOM_TUITION' && recipientPreview.length > 0) {
      const next = { ...customTuitionItems };
      let changed = false;
      
      recipientPreview.forEach(s => {
        if (!next[s.id]) {
          const cls = classes.find(c => c.id === primaryWizardClassId);
          let price = cls?.tuitionPerSession || customGlobalPrice;
          
          const override = cls?.students?.find((cs: any) => cs.studentId === s.id);
          if (override?.customTuitionPerSession != null) {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const from = override.discountFrom ? new Date(override.discountFrom) : null;
            const to = override.discountTo ? new Date(override.discountTo) : null;
            if (to) to.setHours(23, 59, 59, 999);
            
            const isAfterFrom = !from || now >= from;
            const isBeforeTo = !to || now <= to;
            
            if (isAfterFrom && isBeforeTo) {
              price = override.customTuitionPerSession;
            }
          }

          next[s.id] = { sessions: customGlobalSessions, pricePerSession: price };
          changed = true;
        }
      });
      if (changed) setCustomTuitionItems(next);
    }
  }, [activeTab, step, wizardType, recipientPreview, classes, primaryWizardClassId, customGlobalSessions, customGlobalPrice]);

  useEffect(() => {
    if (shouldLoadMultiClassPreview(activeTab, step, wizardType)) {
      const fetchPreview = async () => {
        setIsPreviewLoading(true);
        try {
          const ids = wizardClassIds.join(',');
          const r = await fetch(`/api/zalo/tuition/preview-multiclass?classIds=${ids}&fromDate=${wizardFromDate}&toDate=${wizardToDate}`, { headers: authHeaders });
          if (r.ok) setMultiClassPreview(await r.json());
        } catch { console.error('Failed to fetch multi-class preview'); }
        finally { setIsPreviewLoading(false); }
      };
      fetchPreview();
    } else {
      setMultiClassPreview([]);
    }
  }, [activeTab, step, wizardType, wizardClassIds, wizardFromDate, wizardToDate, token]);

  const handleLinkManual = async (zaloUserId: string, targetId: string, targetType: string, force = false) => {
    if (!zaloUserId) return;
    setIsLinking(true);
    try {
      const body: any = { zaloUserId, force };
      if (targetType === 'STUDENTS') body.studentId = targetId;
      else body.teacherId = targetId;

      const r = await fetch('/api/zalo/link', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      const d = await r.json();

      if (r.status === 409 && d.conflict) {
        setConflictData({ zaloUserId, targetId, targetType, message: d.message, conflictName: d.conflictName, conflictNames: d.conflictNames });
        return;
      }

      if (r.ok) {
        setConflictData(null);
        fetchCandidates(candidateType, candidateSearch, candidatePage, selectedMappingClass, mappingStatusFilter);
        fetchMappingAudits();
        fetchFollowers();
        fetchClassStats();
      } else {
        alert(d.message || 'Lỗi liên kết');
      }
    } catch { alert('Lỗi kết nối'); } finally { setIsLinking(false); }
  };

  const handleUnlinkManual = async (targetId: string, targetType: string) => {
    if (!confirm('Xác nhận hủy liên kết Zalo cho người này?')) return;
    try {
      const body: any = {};
      if (targetType === 'STUDENTS') body.studentId = targetId;
      else body.teacherId = targetId;

      const r = await fetch('/api/zalo/link', {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      if (r.ok) {
        fetchCandidates(candidateType, candidateSearch, candidatePage, selectedMappingClass, mappingStatusFilter);
        fetchMappingAudits();
        fetchFollowers();
        fetchClassStats();
      } else alert(((await r.json()).message) || 'Lỗi hủy liên kết');
    } catch { alert('Lỗi kết nối'); }
  };

  useEffect(() => {
    if (activeTab === 'followers' && followers.length === 0 && !followersLoading) {
      fetchFollowers();
    }
  }, [activeTab, fetchFollowers]);

  const handleLink = async (follower: Follower, studentId: string) => {
    setIsLinking(true);
    try {
      const r = await fetch('/api/zalo/link', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ zaloUserId: follower.userId, studentId }),
      });
      if (r.ok) {
        const s = (students as any[]).find(s => s.id === studentId);
        setFollowers(prev => prev.map(f =>
          f.userId === follower.userId
            ? { ...f, linkedStudent: { id: studentId, name: s?.name ?? '', parentPhone: s?.parentPhone ?? '' } }
            : f
        ));
        setDrawerFollower(null);
        setDrawerSearch('');
      } else alert(((await r.json()).message) || 'Lỗi liên kết');
    } catch { alert('Lỗi kết nối'); }
    finally { setIsLinking(false); }
  };

  const handleUnlink = async (follower: Follower) => {
    if (!follower.linkedStudent) return;
    try {
      const r = await fetch('/api/zalo/link', {
        method: 'DELETE', headers: authHeaders,
        body: JSON.stringify({ studentId: follower.linkedStudent.id }),
      });
      if (r.ok) setFollowers(prev => prev.map(f => f.userId === follower.userId ? { ...f, linkedStudent: null } : f));
      else alert(((await r.json()).message) || 'Lỗi hủy liên kết');
    } catch { alert('Lỗi kết nối'); }
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

  // ── Follower mapping computed values ─────────────────────────────────────
  const mappedFollowers = useMemo(() => {
    if (followerFilter === 'linked') return followers.filter(f => !!f.linkedStudent);
    if (followerFilter === 'unlinked') return followers.filter(f => !f.linkedStudent);
    return followers;
  }, [followers, followerFilter]);

  const drawerStudentList = useMemo(() => {
    if (!drawerFollower) return { suggestions: [] as { s: any; score: number }[], all: students as any[] };
    const keyword = drawerSearch.trim().toLowerCase();
    const suggestions = (students as any[])
      .map(s => ({ s, score: nameMatchScore(drawerFollower.displayName, s.name) }))
      .filter(x => x.score >= 60)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const all = keyword
      ? (students as any[]).filter(s =>
          s.name.toLowerCase().includes(keyword) ||
          (s.studentCode ?? '').toLowerCase().includes(keyword)
        )
      : (students as any[]);
    return { suggestions, all };
  }, [drawerFollower, drawerSearch, students]);

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
    <>
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
          {TAB('mapping', 'Ghép danh tính')}
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
                <div className="flex flex-wrap gap-4 text-xs text-hicado-navy/40 font-bold">
                  <span>📤 Đã gửi: <strong className="text-hicado-navy">{c.sentCount}</strong></span>
                  {(c.znsSentCount ?? 0) > 0 && (
                    <span>📱 ZNS: <strong className="text-amber-600">{c.znsSentCount}</strong></span>
                  )}
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
              <div className="grid grid-cols-1 gap-3">
                {(['TUITION_REMINDER', 'CUSTOM_TUITION', 'GENERAL'] as CampaignType[]).map(t => (
                  <label key={t} onClick={() => setWizardType(t)}
                    className={`p-4 border-2 rounded-2xl cursor-pointer transition-all flex items-center gap-4 ${wizardType === t ? 'border-hicado-navy bg-hicado-navy/5' : 'border-hicado-slate hover:border-hicado-navy/30'}`}>
                    <p className="text-2xl">{t === 'TUITION_REMINDER' ? '💰' : t === 'CUSTOM_TUITION' ? '📝' : '📢'}</p>
                    <div className="flex-1">
                      <p className="font-black text-hicado-navy text-sm">
                        {t === 'TUITION_REMINDER' ? 'Nhắc học phí (Tự động)' : t === 'CUSTOM_TUITION' ? 'Thu học phí thủ công' : 'Thông báo chung'}
                      </p>
                      <p className="text-[10px] text-hicado-navy/40 font-bold uppercase tracking-widest mt-0.5">
                        {t === 'TUITION_REMINDER' ? 'Dựa trên điểm danh' : t === 'CUSTOM_TUITION' ? 'Nhập số buổi & giá' : 'Nội dung tự do'}
                      </p>
                    </div>
                    {wizardType === t && <div className="w-5 h-5 rounded-full bg-hicado-navy flex items-center justify-center text-white text-[10px]">✓</div>}
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
                  {classes.map(cls => {
                    const stat = classStats.find(s => s.classId === cls.id);
                    return (
                      <label key={cls.id} className={`flex items-center gap-2 p-3 border rounded-xl cursor-pointer transition-all text-sm ${wizardClassIds.includes(cls.id) ? 'border-hicado-navy bg-hicado-navy/5 font-black' : 'border-hicado-slate hover:border-hicado-navy/30'}`}>
                        <input type="checkbox" className="accent-hicado-navy" checked={wizardClassIds.includes(cls.id)}
                          onChange={() => setWizardClassIds(prev => prev.includes(cls.id) ? prev.filter(x => x !== cls.id) : [...prev, cls.id])} />
                        <span className="text-hicado-navy font-bold truncate flex-1">{cls.name}</span>
                        {stat && (
                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${stat.mappedPercent === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                            {stat.mappedPercent < 100 && (
                              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            )}
                            {stat.mappedStudents}/{stat.totalStudents}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {/* Warning banner if any selected class has unmapped students */}
                {wizardClassIds.length > 0 && classStats.some(s => wizardClassIds.includes(s.classId) && s.mappedPercent < 100) && (
                  <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mt-3">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>
                      Một số lớp được chọn có học sinh <strong>chưa ghép Zalo</strong>. Tin nhắn sẽ không đến được những học sinh này.{' '}
                      <button type="button" onClick={() => setActiveTab('mapping')} className="underline font-bold">Ghép ngay →</button>
                    </span>
                  </div>
                )}
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

              {wizardType === 'TUITION_REMINDER' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Từ ngày (điểm danh)</label>
                      <input
                        type="date"
                        value={wizardFromDate}
                        onChange={e => setWizardFromDate(e.target.value)}
                        className="w-full bg-hicado-slate/20 border border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-hicado-navy outline-none focus:bg-white focus:border-hicado-navy/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Đến ngày (điểm danh)</label>
                      <input
                        type="date"
                        value={wizardToDate}
                        onChange={e => setWizardToDate(e.target.value)}
                        className="w-full bg-hicado-slate/20 border border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-hicado-navy outline-none focus:bg-white focus:border-hicado-navy/30"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Hạn thu: Từ ngày</label>
                      <input
                        type="date"
                        value={collectionFromDate}
                        onChange={e => setCollectionFromDate(e.target.value)}
                        className="w-full bg-hicado-slate/20 border border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-hicado-navy outline-none focus:bg-white focus:border-hicado-navy/30"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Hạn thu: Đến ngày</label>
                      <input
                        type="date"
                        value={collectionToDate}
                        onChange={e => setCollectionToDate(e.target.value)}
                        className="w-full bg-hicado-slate/20 border border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-hicado-navy outline-none focus:bg-white focus:border-hicado-navy/30"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest block mb-2">Kỳ thu học phí (Tháng)</label>
                    <input
                      type="month"
                      value={wizardBillingMonth}
                      onChange={e => setWizardBillingMonth(e.target.value)}
                      className="w-full bg-hicado-slate/20 border border-transparent rounded-xl px-4 py-2.5 text-sm font-bold text-hicado-navy outline-none focus:bg-white focus:border-hicado-navy/30"
                    />
                    <p className="text-[10px] text-hicado-navy/40 font-bold mt-1">Dùng để phân biệt "thu tháng 5" với "thu tháng 6" khi lưu lịch sử</p>
                  </div>
                </div>
              )}

              <div onClick={() => setWizardRequireZalo(v => !v)}
                className="flex items-center gap-4 p-4 bg-hicado-slate/20 rounded-2xl cursor-pointer">
                <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-0.5 ${wizardRequireZalo ? 'bg-hicado-emerald' : 'bg-gray-300'}`}>
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${wizardRequireZalo ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
                <div>
                  <p className="font-black text-hicado-navy text-sm">Chỉ gửi học sinh có Zalo UID</p>
                  <p className="text-xs text-hicado-navy/40">Tắt để mở rộng sang gửi ZNS qua SĐT bên dưới</p>
                </div>
              </div>

              {/* ZNS fallback toggle — only for TUITION_REMINDER + requireZalo OFF */}
              {wizardType === 'TUITION_REMINDER' && (
                <div className={`space-y-3 rounded-2xl border p-4 transition-all ${!wizardRequireZalo ? 'border-amber-300 bg-amber-50/50' : 'border-hicado-slate/30 opacity-40 pointer-events-none'}`}>
                  <div onClick={() => !wizardRequireZalo && setWizardFallbackZNS(v => !v)} className="flex items-center gap-4 cursor-pointer">
                    <div className={`w-12 h-6 rounded-full flex items-center px-0.5 transition-colors ${wizardFallbackZNS && !wizardRequireZalo ? 'bg-amber-500' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${wizardFallbackZNS && !wizardRequireZalo ? 'translate-x-6' : 'translate-x-0'}`} />
                    </div>
                    <div>
                      <p className="font-black text-hicado-navy text-sm">Gửi ZNS qua SĐT cho học sinh chưa có Zalo UID</p>
                      <p className="text-xs text-amber-600">⚠ ~220-330đ/tin thành công · OA phải xác thực · Template phải được duyệt</p>
                    </div>
                  </div>
                  {wizardFallbackZNS && !wizardRequireZalo && (
                    <div>
                      <label className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest mb-1 block">Chọn ZNS Template</label>
                      <select
                        value={wizardZnsTemplateId}
                        onChange={e => setWizardZnsTemplateId(e.target.value)}
                        className="w-full bg-white border border-amber-200 rounded-xl px-4 py-2 text-sm font-bold text-hicado-navy outline-none focus:border-amber-400"
                      >
                        <option value="">-- Chọn template --</option>
                        {templates.filter((t: any) => t.status === 'APPROVED').map((t: any) => (
                          <option key={t.templateId} value={t.templateId}>{t.templateName} (ID: {t.templateId})</option>
                        ))}
                      </select>
                      {templates.filter((t: any) => t.status === 'APPROVED').length === 0 && (
                        <p className="text-xs text-rose-500 mt-1">Không có template đã duyệt. Đồng bộ template trong tab Cài đặt.</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-2xl border border-hicado-slate font-black text-sm text-hicado-navy/40 hover:bg-hicado-slate transition-all">← Quay lại</button>
                <button onClick={() => setStep(3)} className="flex-1 bg-hicado-navy text-white py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-[1.02] transition-all">Xem danh sách →</button>
              </div>
            </div>
          )}

          {/* Step 3: Preview recipients / Itemized table */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <h3 className="text-xl font-serif font-black text-hicado-navy">
                  {wizardType === 'CUSTOM_TUITION' ? 'Chi tiết học phí thủ công' : 'Danh sách người nhận'}
                </h3>
                <div className="flex items-center gap-2">
                  {isPreviewLoading && <div className="w-4 h-4 border-2 border-hicado-navy border-t-transparent rounded-full animate-spin" />}
                  <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest">{recipientPreview.length} học sinh</p>
                </div>
              </div>

              {wizardType !== 'CUSTOM_TUITION' && (
                <div className="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-tight">
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg">✅ {uidGroup.length} Zalo UID</span>
                  <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg">📱 {phoneGroup.length} Phone {wizardFallbackZNS ? '(ZNS)' : ''}</span>
                  {noContactGroup.length > 0 && <span className="px-2 py-1 bg-rose-100 text-rose-600 rounded-lg">❌ {noContactGroup.length} No Contact</span>}
                </div>
              )}

              {wizardType === 'CUSTOM_TUITION' && (
                <div className="bg-hicado-slate/10 p-4 rounded-2xl space-y-3">
                  <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest mb-1">Thiết lập nhanh cho toàn bộ</p>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[9px] font-bold text-hicado-navy/50 block mb-1">SỐ BUỔI</label>
                      <input type="number" value={customGlobalSessions} onChange={e => setCustomGlobalSessions(Number(e.target.value))}
                        className="w-full bg-white border border-hicado-slate rounded-xl px-3 py-2 text-sm font-bold outline-none" />
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] font-bold text-hicado-navy/50 block mb-1">ĐƠN GIÁ</label>
                      <input type="number" value={customGlobalPrice} onChange={e => setCustomGlobalPrice(Number(e.target.value))}
                        className="w-full bg-white border border-hicado-slate rounded-xl px-3 py-2 text-sm font-bold outline-none" />
                    </div>
                    <button onClick={() => {
                      if (!confirm('Áp dụng số buổi & đơn giá này cho tất cả học sinh đang chọn?')) return;
                      const next = { ...customTuitionItems };
                      recipientPreview.forEach(s => {
                        next[s.id] = { ...next[s.id], sessions: customGlobalSessions, pricePerSession: customGlobalPrice };
                      });
                      setCustomTuitionItems(next);
                    }} className="bg-hicado-navy text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase self-end h-[38px]">Áp dụng</button>
                  </div>
                </div>
              )}

              <div className="border border-hicado-slate rounded-2xl overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm text-left">
                  <thead className="bg-hicado-slate/20 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Học sinh</th>
                      {wizardType === 'CUSTOM_TUITION' ? (
                        <>
                          <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest w-20">Buổi</th>
                          <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest w-32">Đơn giá</th>
                          <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest w-32 text-right">Tổng tiền</th>
                        </>
                      ) : (
                        <>
                          <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Lớp</th>
                          <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Học phí</th>
                          <th className="px-4 py-3 text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Zalo</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {recipientPreview.map(s => {
                      const item = customTuitionItems[s.id] || { sessions: customGlobalSessions, pricePerSession: customGlobalPrice };
                      const total = item.totalOverride ?? (item.sessions * item.pricePerSession);
                      const mc = multiClassPreview.find(p => p.studentId === s.id);

                      return (
                        <tr key={s.id} className={`border-t border-hicado-slate/30 hover:bg-hicado-slate/10 ${mc?.alreadySent ? 'bg-amber-50/50' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-hicado-navy">{s.name}</p>
                              {mc?.alreadySent && (
                                <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[8px] font-black uppercase rounded shadow-sm" title={`Đã gửi lúc: ${new Date(mc.sentLogs[0].sentAt).toLocaleString('vi-VN')}`}>Đã gửi</span>
                              )}
                              {(mc?.otherClasses?.length ?? 0) > 0 && (
                                <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[8px] font-black uppercase rounded shadow-sm" title={`Học lớp khác: ${mc?.otherClasses?.map((o: any) => o.className).join(', ') ?? ''}`}>Nhiều lớp</span>
                              )}
                            </div>
                            {mc && wizardType !== 'GENERAL' && (
                              <div className="mt-2 space-y-1 text-[10px] font-bold">
                                {mc.alreadySent && (
                                  <label className="flex items-center gap-2 text-amber-700">
                                    <input type="checkbox" checked={getMergeOption(s.id).forceResend} onChange={e => setForceResend(s.id, e.target.checked)} />
                                    Vẫn gửi lại học phí kỳ này
                                  </label>
                                )}
                                {mc.otherClasses.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {mc.otherClasses.map((o: any) => (
                                      <label key={o.classId} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg">
                                        <input type="checkbox" checked={getMergeOption(s.id).extraClassIds.includes(o.classId)} onChange={e => setMergeExtra(s.id, o.classId, e.target.checked)} />
                                        Gộp {o.className} ({o.subtotal.toLocaleString('vi-VN')}đ)
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {wizardType === 'CUSTOM_TUITION' && (
                              <input type="text" placeholder="Ghi chú (VD: Kèm riêng...)" value={item.note || ''}
                                onChange={e => setCustomTuitionItems(prev => ({ ...prev, [s.id]: { ...item, note: e.target.value } }))}
                                className="text-[10px] bg-transparent border-b border-transparent hover:border-hicado-slate focus:border-hicado-navy outline-none w-full text-hicado-navy/50" />
                            )}
                          </td>
                          {wizardType === 'CUSTOM_TUITION' ? (
                            <>
                              <td className="px-4 py-3">
                                <input type="number" min={1} value={item.sessions} onChange={e => setCustomTuitionItems(prev => ({ ...prev, [s.id]: { ...item, sessions: Math.max(1, Number(e.target.value) || 1), totalOverride: undefined } }))}
                                  className="w-full bg-hicado-slate/20 rounded-lg px-2 py-1 text-xs font-bold outline-none" />
                              </td>
                              <td className="px-4 py-3">
                                <input type="number" min={0} value={item.pricePerSession} onChange={e => setCustomTuitionItems(prev => ({ ...prev, [s.id]: { ...item, pricePerSession: Math.max(0, Number(e.target.value) || 0), totalOverride: undefined } }))}
                                  className="w-full bg-hicado-slate/20 rounded-lg px-2 py-1 text-xs font-bold outline-none" />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <input type="number" min={0} value={total} onChange={e => setCustomTuitionItems(prev => ({ ...prev, [s.id]: { ...item, totalOverride: Math.max(0, Number(e.target.value) || 0) } }))}
                                  className="w-full bg-hicado-navy/10 text-hicado-navy rounded-lg px-2 py-1 text-xs font-black text-right outline-none" />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-xs text-hicado-navy/40">
                                {mc ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-bold text-hicado-navy">{classes.find(c => c.id === wizardClassIds[0])?.name}</span>
                                    {mc.otherClasses.map((o: any) => (
                                      <span key={o.classId} className="opacity-60">+ {o.className}</span>
                                    ))}
                                  </div>
                                ) : (
                                  ((s as any).classes || []).slice(0, 2).map((c: any) => {
                                    const cls = classes.find(x => x.id === (c.classId ?? c.id));
                                    return cls?.name ?? '—';
                                  }).join(', ')
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {mc ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-black text-hicado-navy">{mc.mainClass.subtotal.toLocaleString('vi-VN')}đ</span>
                                    {mc.otherClasses.map((o: any) => (
                                      <span key={o.classId} className="text-[10px] opacity-40">+{o.subtotal.toLocaleString()}đ</span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${(s as any).tuitionStatus === 'PAID' ? 'bg-green-100 text-green-700' : (s as any).tuitionStatus === 'DEBT' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {(s as any).tuitionStatus}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {(s as any).zaloUserId
                                  ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">✓ Có</span>
                                  : <span className="text-xs text-hicado-navy/20 font-bold">—</span>}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {recipientPreview.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-hicado-navy/30 text-sm font-bold">Không có học sinh phù hợp điều kiện.</td></tr>
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
              {wizardType === 'CUSTOM_TUITION' ? (
                <div className="space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar">
                  {recipientPreview.slice(0, 20).map(s => {
                    const item = customTuitionItems[s.id] || { sessions: customGlobalSessions, pricePerSession: customGlobalPrice };
                    const coveredNames = getCoveredClassIdsForStudent(s.id).map(id => classes.find(c => c.id === id)?.name ?? id).join(' + ') || 'Chưa chọn lớp';
                    const fmt = (d: string) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const fmtFrom = wizardFromDate ? fmt(wizardFromDate) : '';
                    const fmtTo = wizardToDate ? fmt(wizardToDate) : '';
                    const fmtCollFrom = collectionFromDate ? fmt(collectionFromDate) : '';
                    const fmtCollTo = collectionToDate ? fmt(collectionToDate) : '';
                    
                    return (
                      <details key={s.id} className="border border-hicado-slate rounded-2xl p-4 bg-white" open={recipientPreview.length <= 3}>
                        <summary className="cursor-pointer font-black text-hicado-navy flex justify-between gap-3">
                          <span>{s.name}</span>
                          <span className="text-xs text-hicado-emerald">{((item.totalOverride ?? (item.sessions * item.pricePerSession))).toLocaleString('vi-VN')}đ</span>
                        </summary>
                        <p className="text-[10px] font-bold text-hicado-navy/40 uppercase mt-2">Cover: {coveredNames}</p>
                        <div className="mt-3 bg-[#e7f3ff] rounded-xl p-4 font-mono text-xs text-gray-800 whitespace-pre-wrap leading-relaxed border border-blue-100">
                          {[
                            `Kính gửi phụ huynh em ${s.name}`,
                            `Trung tâm Hicado xin thông báo học phí từ ${fmtFrom} đến ${fmtTo}`,
                            ``,
                            (() => {
                              const coveredIds = getCoveredClassIdsForStudent(s.id);
                              const names = coveredIds.map(cid => classes.find(c => c.id === cid)?.name || cid).join(' + ');
                              const cItem = customTuitionItems[s.id] || { sessions: customGlobalSessions, pricePerSession: customGlobalPrice };
                              const subtotal = cItem.totalOverride ?? (cItem.sessions * cItem.pricePerSession);
                              return cItem.sessions > 0
                                ? `${names} | Số buổi học: ${cItem.sessions} | Học phí: ${cItem.pricePerSession.toLocaleString('vi-VN')}đ/buổi | Thành tiền: ${subtotal.toLocaleString('vi-VN')}đ`
                                : `(Không có buổi học trong kỳ)`;
                            })(),
                            ``,
                            `Tổng cộng: ${(item.totalOverride ?? (item.sessions * item.pricePerSession)).toLocaleString('vi-VN')}đ`,
                            `PH có thể thanh toán qua chuyển khoản hoặc đóng tiền mặt tại Trung tâm.`,
                            `Thời gian thu: từ ngày ${fmtCollFrom} đến ngày ${fmtCollTo}`,
                            `Phụ huynh vui lòng thanh toán đúng hạn`,
                            `Trân trọng - Hicado Center`,
                          ].join('\n')}
                        </div>
                      </details>
                    );
                  })}
                  {recipientPreview.length > 20 && <p className="text-xs text-hicado-navy/40 font-bold">Chỉ hiển thị 20 preview đầu tiên để giữ trang nhẹ.</p>}
                </div>
              ) : wizardType === 'TUITION_REMINDER' ? (
                <div className="space-y-3 max-h-[420px] overflow-y-auto custom-scrollbar">
                  {recipientPreview.slice(0, 20).map(s => {
                    const mc = multiClassPreview.find(p => p.studentId === s.id);
                    const fmt = (d: string) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    const fmtFrom = wizardFromDate ? fmt(wizardFromDate) : '';
                    const fmtTo = wizardToDate ? fmt(wizardToDate) : '';
                    const fmtCollFrom = collectionFromDate ? fmt(collectionFromDate) : '';
                    const fmtCollTo = collectionToDate ? fmt(collectionToDate) : '';

                    const allItems = mc
                      ? [{ name: mc.mainClass.className, teacherNames: mc.mainClass.teacherNames ?? [], sessions: mc.mainClass.attended, price: mc.mainClass.tuitionPerSession, subtotal: mc.mainClass.subtotal },
                         ...mc.otherClasses.map(o => ({ name: o.className, teacherNames: o.teacherNames ?? [], sessions: o.attended, price: o.tuitionPerSession, subtotal: o.subtotal }))]
                      : [];
                    const total = allItems.reduce((sum, it) => sum + it.subtotal, 0);
                    const itemLines = allItems.length > 0
                      ? allItems.map(it => `${it.name}${it.teacherNames.length ? ` | Giáo viên: ${it.teacherNames.join(', ')}` : ''} | Số buổi học: ${it.sessions} | Học phí: ${it.price.toLocaleString('vi-VN')}đ/buổi | Thành tiền: ${it.subtotal.toLocaleString('vi-VN')}đ`)
                      : ["(Không có buổi học trong kỳ)"];

                    const previewText = [
                      `Kính gửi phụ huynh em ${s.name}`,
                      `Trung tâm Hicado xin thông báo học phí từ ${fmtFrom} đến ${fmtTo}`,
                      ``,
                      ...itemLines,
                      ``,
                      `Tổng cộng: ${total.toLocaleString('vi-VN')}đ`,
                      `PH có thể thanh toán qua chuyển khoản hoặc đóng tiền mặt tại Trung tâm.`,
                      `Thời gian thu: từ ngày ${fmtCollFrom} đến ngày ${fmtCollTo}`,
                      `Phụ huynh vui lòng thanh toán đúng hạn`,
                      `Trân trọng - Hicado Center`,
                    ].join('\n');
                    return (
                      <details key={s.id} className="border border-hicado-slate rounded-[1.75rem] p-4 bg-white shadow-sm" open={recipientPreview.length <= 3}>
                        <summary className="cursor-pointer font-black text-hicado-navy flex justify-between gap-3 items-center">
                          <span className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-2xl bg-hicado-navy text-white grid place-items-center text-[10px]">HS</span>
                            <span>{s.name}</span>
                          </span>
                          <span className={`text-xs px-3 py-1 rounded-full ${total > 0 ? 'bg-hicado-emerald/10 text-hicado-emerald' : 'bg-red-50 text-red-600'}`}>{total.toLocaleString('vi-VN')}đ</span>
                        </summary>
                        <div className="mt-4 grid gap-3">
                          <div className="grid md:grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-hicado-slate bg-hicado-slate/10 p-3">
                              <p className="text-[10px] uppercase tracking-widest font-black text-hicado-navy/35">Kỳ học phí</p>
                              <p className="text-sm font-black text-hicado-navy mt-1">{fmtFrom} đến {fmtTo}</p>
                            </div>
                            <div className="rounded-2xl border border-hicado-slate bg-hicado-slate/10 p-3">
                              <p className="text-[10px] uppercase tracking-widest font-black text-hicado-navy/35">Thời gian thu</p>
                              <p className="text-sm font-black text-hicado-navy mt-1">{fmtCollFrom} đến {fmtCollTo}</p>
                            </div>
                          </div>
                          <div className="rounded-2xl border border-hicado-slate overflow-hidden">
                            <div className="grid grid-cols-[1.4fr_.7fr_.8fr_.8fr] bg-hicado-slate/20 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-hicado-navy/45">
                              <span>Lớp / Giáo viên</span><span>Buổi</span><span>Học phí</span><span>Thành tiền</span>
                            </div>
                            {allItems.length > 0 ? allItems.map(it => (
                              <div key={`${s.id}-${it.name}`} className="grid grid-cols-[1.4fr_.7fr_.8fr_.8fr] gap-2 px-3 py-3 border-t border-hicado-slate/60 text-xs">
                                <div>
                                  <p className="font-black text-hicado-navy">{it.name}</p>
                                  <p className="text-[10px] font-bold text-hicado-navy/40">{it.teacherNames.length ? it.teacherNames.join(', ') : 'Chưa có giáo viên'}</p>
                                </div>
                                <span className="font-bold text-hicado-navy">{it.sessions}</span>
                                <span className="font-bold text-hicado-navy">{it.price.toLocaleString('vi-VN')}đ</span>
                                <span className="font-black text-hicado-emerald">{it.subtotal.toLocaleString('vi-VN')}đ</span>
                              </div>
                            )) : (
                              <div className="px-3 py-3 text-xs font-bold text-red-600">Không có buổi học trong kỳ, cần kiểm tra lại trước khi gửi.</div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 bg-[#e7f3ff] rounded-xl p-4 font-mono text-xs text-gray-800 whitespace-pre-wrap leading-relaxed border border-blue-100">
                          {previewText}
                        </div>
                      </details>
                    );
                  })}
                  {recipientPreview.length > 20 && <p className="text-xs text-hicado-navy/40 font-bold">Chỉ hiển thị 20 preview đầu tiên để giữ trang nhẹ.</p>}
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
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center space-y-2">
                    <p className="text-3xl mb-1">✅</p>
                    <p className="font-black text-green-700 text-lg">Chiến dịch đã gửi!</p>
                    <div className="flex justify-center gap-3 flex-wrap text-xs font-black mt-2">
                      <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl">
                        Zalo UID: {sendResult.sentCount - (sendResult.znsSentCount ?? 0)}
                      </span>
                      {(sendResult.znsSentCount ?? 0) > 0 && (
                        <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-xl">
                          📱 ZNS Phone: {sendResult.znsSentCount}
                        </span>
                      )}
                      {sendResult.failedCount > 0 && (
                        <span className="px-3 py-1.5 bg-rose-100 text-rose-600 rounded-xl">
                          Thất bại: {sendResult.failedCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {sendResult.skippedCount > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <div>
                          <p className="font-black text-amber-700 text-sm">Đã bỏ qua {sendResult.skippedCount} học sinh</p>
                          <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest">Lý do: Đã gửi thông báo kỳ {wizardBillingMonth} trước đó</p>
                        </div>
                      </div>
                      <div className="max-h-32 overflow-y-auto custom-scrollbar pr-2">
                        <div className="flex flex-wrap gap-2">
                          {sendResult.skippedStudents?.map((s: any) => (
                            <span key={s.studentId} className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-[10px] font-bold text-amber-700 shadow-sm">
                              {s.studentName}
                            </span>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-amber-500 italic font-bold">Tick "Gửi lại" ở bước trước nếu bạn thực sự muốn gửi thêm.</p>
                    </div>
                  )}

                  <div className="flex gap-3 mt-2">
                    <button onClick={resetWizard} className="flex-1 py-3 rounded-2xl border border-hicado-slate font-black text-sm text-hicado-navy/60 hover:bg-hicado-slate transition-all">Tạo chiến dịch mới</button>
                    <button onClick={() => setActiveTab('campaigns')} className="flex-1 py-3 bg-hicado-navy text-white rounded-2xl font-black text-sm uppercase tracking-widest">Xem danh sách</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button onClick={handleSendCampaign} disabled={isSending}
                    className="w-full bg-hicado-navy text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest disabled:bg-hicado-slate/50 hover:scale-[1.02] transition-all shadow-lg">
                    {isSending ? '⏳ Đang gửi...' : `🚀 Gửi cho ${uidGroup.length + (wizardFallbackZNS && !wizardRequireZalo ? phoneGroup.length : 0)} người nhận`}
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
                <span className="text-hicado-navy/40">Bỏ qua: <strong className="text-amber-600">{campaignDetail.skippedCount ?? 0}</strong></span>
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
                      {['Học sinh', 'Mã HS', 'Trạng thái', 'Lý do lỗi', 'Giờ gửi', 'Giờ đọc'].map(h => (
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
                        <td className="px-5 py-4 max-w-[280px]">
                          {log.errorReason ? (
                            <div className="flex flex-wrap gap-1">
                              {log.errorReason.split(' → ').map((step, i) => {
                                const ok = step.includes('_OK') || step.includes('CS_OK');
                                const fail = step.includes('_FAIL') || step.includes('EXCEPTION') || step.includes('FALLBACK');
                                return (
                                  <span key={i} title={step} className={`px-2 py-0.5 rounded text-[10px] font-bold truncate max-w-[160px] ${ok ? 'bg-emerald-100 text-emerald-700' : fail ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {step}
                                  </span>
                                );
                              })}
                            </div>
                          ) : <span className="text-hicado-navy/30 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-4 text-xs text-hicado-navy/40">{new Date(log.sentAt).toLocaleString('vi-VN')}</td>
                        <td className="px-5 py-4 text-xs text-hicado-navy/40">{log.readAt ? new Date(log.readAt).toLocaleString('vi-VN') : '—'}</td>
                      </tr>
                    ))}
                    {campaignDetail.logs.length === 0 && (
                      <tr><td colSpan={6} className="px-5 py-8 text-center text-hicado-navy/30 font-bold">Không có bản ghi.</td></tr>
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

      {/* ══ TAB: FOLLOWERS ══════════════════════════════════════════════ */}
      {activeTab === 'followers' && (
        <div className="space-y-4">
          {/* Summary + filter bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 bg-white border border-hicado-slate rounded-2xl p-1.5">
              {([['all', `Tất cả (${followers.length})`], ['linked', `✓ Đã liên kết (${followers.filter(f => f.linkedStudent).length})`], ['unlinked', `⚪ Chưa (${followers.filter(f => !f.linkedStudent).length})`]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFollowerFilter(key)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${followerFilter === key ? 'bg-hicado-navy text-white shadow' : 'text-hicado-navy/40 hover:text-hicado-navy'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={fetchFollowers} disabled={followersLoading}
              className="px-5 py-2.5 border border-hicado-slate rounded-2xl text-xs font-black uppercase tracking-widest text-hicado-navy/50 hover:bg-hicado-slate/30 disabled:opacity-50 transition-all">
              {followersLoading ? 'Đang tải...' : '↺ Tải lại từ Zalo OA'}
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            {/* Mapping table */}
            <div className="xl:col-span-2">
              {followers.length === 0 ? (
                <div className="bg-white border border-hicado-slate rounded-[2rem] p-16 text-center">
                  <p className="text-5xl mb-4">📱</p>
                  <p className="font-black text-hicado-navy/30 uppercase tracking-widest text-sm mb-6">Chưa có dữ liệu followers</p>
                  <button onClick={fetchFollowers} disabled={followersLoading}
                    className="px-8 py-3 bg-hicado-navy text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all disabled:opacity-50">
                    {followersLoading ? 'Đang tải...' : 'Tải followers từ Zalo OA'}
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-[1.5rem] border border-hicado-slate overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-hicado-slate/20 border-b border-hicado-slate">
                          <th className="px-4 py-3 text-left text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Followers Zalo OA</th>
                          <th className="px-4 py-3 text-left text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Học sinh đã liên kết</th>
                          <th className="px-4 py-3 text-left text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Gợi ý tự động</th>
                          <th className="px-4 py-3 text-right text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hicado-slate/30">
                        {mappedFollowers.map(f => {
                          const topMatch = (() => {
                            if (f.linkedStudent) return null;
                            const best = (students as any[])
                              .map(s => ({ s, score: nameMatchScore(f.displayName, s.name) }))
                              .filter(x => x.score >= 60)
                              .sort((a, b) => b.score - a.score)[0];
                            return best ?? null;
                          })();
                          const isSelected = selectedFollowers.includes(f.userId);
                          return (
                            <tr key={f.userId} className={`hover:bg-hicado-slate/5 transition-all ${isSelected ? 'bg-emerald-50/30' : ''}`}>
                              {/* Follower info */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <input type="checkbox" checked={isSelected} onChange={() => toggleFollower(f.userId)} className="accent-hicado-navy shrink-0" />
                                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${f.linkedStudent ? 'bg-hicado-emerald text-white' : 'bg-hicado-slate text-hicado-navy/50'}`}>
                                    {f.displayName.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold text-hicado-navy text-sm truncate">{f.displayName}</p>
                                    <p className="text-[10px] text-hicado-navy/30 font-mono truncate">{f.userId}</p>
                                  </div>
                                </div>
                              </td>
                              {/* Linked student */}
                              <td className="px-4 py-3">
                                {f.linkedStudent ? (
                                  <span className="text-xs font-bold text-hicado-emerald">✓ {f.linkedStudent.name}</span>
                                ) : (
                                  <span className="text-xs text-hicado-navy/20">—</span>
                                )}
                              </td>
                              {/* Auto suggestion */}
                              <td className="px-4 py-3">
                                {topMatch ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-amber-600 truncate max-w-[100px]">💡 {topMatch.s.name}</span>
                                    <span className="text-[10px] text-amber-400 shrink-0">{topMatch.score}%</span>
                                    <button onClick={() => handleLink(f, topMatch.s.id)} disabled={isLinking}
                                      className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-200 disabled:opacity-50 shrink-0 transition-all">
                                      Chọn
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-hicado-navy/20">—</span>
                                )}
                              </td>
                              {/* Action */}
                              <td className="px-4 py-3 text-right">
                                {f.linkedStudent ? (
                                  <button onClick={() => handleUnlink(f)}
                                    className="text-[10px] font-black text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-all">
                                    Hủy
                                  </button>
                                ) : (
                                  <button onClick={() => { setDrawerFollower(f); setDrawerSearch(''); }}
                                    className="text-[10px] font-black bg-hicado-navy text-white px-3 py-1.5 rounded-lg hover:bg-hicado-emerald hover:text-hicado-navy transition-all">
                                    Liên kết
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* CS send panel */}
            <div className="bg-white border border-hicado-slate rounded-[1.5rem] p-5 self-start sticky top-6 space-y-4">
              <div>
                <h2 className="font-black text-hicado-navy mb-0.5">Gửi tin OA</h2>
                <p className="text-xs text-hicado-navy/40">Tích chọn followers trong bảng, sau đó nhập nội dung và gửi.</p>
              </div>
              <textarea className="w-full border border-hicado-slate rounded-xl p-3 text-sm resize-none focus:outline-none focus:border-hicado-emerald"
                rows={6} placeholder="Nội dung tin nhắn OA..." value={csMessage} onChange={e => setCsMessage(e.target.value)} />
              <p className="text-xs text-hicado-navy/30 font-bold">Người nhận: <strong className="text-hicado-navy">{selectedFollowers.length}</strong></p>
              <button onClick={handleSendCS} disabled={isSendingCs || !selectedFollowers.length || !csMessage.trim()}
                className="w-full bg-hicado-emerald text-hicado-navy font-black py-3 rounded-xl disabled:bg-hicado-slate/30 disabled:text-hicado-navy/20 transition-all text-sm">
                {isSendingCs ? 'Đang gửi...' : `Gửi ${selectedFollowers.length} tin OA`}
              </button>
            </div>
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

      {/* ══ TAB: MAPPING (Manual Identity Mapping) ══════════════════════ */}
      {activeTab === 'mapping' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex gap-5 items-start">

            {/* ── LEFT SIDEBAR: Class Stats ─────────────────────────────── */}
            <div className="w-56 flex-shrink-0 space-y-1.5">
              <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest px-1 mb-3">Lọc theo lớp</p>
              <button
                onClick={() => { setSelectedMappingClass('ALL'); setCandidatePage(1); }}
                className={`w-full text-left px-4 py-3 rounded-xl transition-all text-sm font-bold ${selectedMappingClass === 'ALL' ? 'bg-hicado-navy text-white shadow-lg' : 'bg-white border border-hicado-slate hover:border-hicado-navy/30 text-hicado-navy'}`}
              >Tất cả lớp</button>
              {classStatsLoading && <div className="h-10 bg-hicado-slate/20 rounded-xl animate-pulse" />}
              {classStats.map(cs => (
                <button
                  key={cs.classId}
                  onClick={() => { setSelectedMappingClass(cs.classId); setCandidatePage(1); }}
                  className={`w-full text-left px-4 py-2.5 rounded-xl transition-all flex flex-col gap-1.5 ${selectedMappingClass === cs.classId ? 'bg-hicado-navy text-white shadow-lg' : 'bg-white border border-hicado-slate hover:border-hicado-navy/30 text-hicado-navy'}`}
                >
                  <span className="text-xs font-black truncate">{cs.className}</span>
                  <div className="flex items-center gap-2">
                    <div className={`h-1 rounded-full flex-1 ${selectedMappingClass === cs.classId ? 'bg-white/20' : 'bg-hicado-slate/30'}`}>
                      <div
                        className={`h-1 rounded-full transition-all ${cs.mappedPercent === 100 ? 'bg-emerald-400' : cs.mappedPercent >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`}
                        style={{ width: `${cs.mappedPercent}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-black flex-shrink-0 ${selectedMappingClass === cs.classId ? 'text-white/70' : cs.mappedPercent === 100 ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {cs.mappedStudents}/{cs.totalStudents}
                    </span>
                    {cs.mappedPercent < 100 && (
                      <svg className={`w-3 h-3 flex-shrink-0 ${selectedMappingClass === cs.classId ? 'text-amber-300' : 'text-amber-400'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* ── RIGHT PANEL: Header & Search ──────────────────────────── */}
            <div className="flex-1 min-w-0 space-y-4">
          {/* Header & Search */}
          <div className="bg-white border border-hicado-slate rounded-[2rem] p-6 shadow-premium">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center flex-wrap">
              <div className="flex bg-hicado-slate/30 p-1 rounded-xl">
                <button
                  onClick={() => { setCandidateType('STUDENTS'); setCandidatePage(1); }}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${candidateType === 'STUDENTS' ? 'bg-hicado-navy text-white shadow' : 'text-hicado-navy/40 hover:text-hicado-navy'}`}
                >Học sinh</button>
                <button
                  onClick={() => { setCandidateType('TEACHERS'); setCandidatePage(1); }}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${candidateType === 'TEACHERS' ? 'bg-hicado-navy text-white shadow' : 'text-hicado-navy/40 hover:text-hicado-navy'}`}
                >Giáo viên</button>
              </div>

              {/* Status filter */}
              <div className="flex bg-hicado-slate/30 p-1 rounded-xl">
                {(['ALL', 'LINKED', 'UNLINKED'] as const).map(f => (
                  <button key={f} onClick={() => { setMappingStatusFilter(f); setCandidatePage(1); }}
                    className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${mappingStatusFilter === f ? 'bg-hicado-navy text-white shadow' : 'text-hicado-navy/40 hover:text-hicado-navy'}`}>
                    {f === 'ALL' ? 'Tất cả' : f === 'LINKED' ? 'Đã ghép' : 'Chưa ghép'}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 w-full min-w-[160px]">
                <input
                  type="text"
                  value={candidateSearch}
                  onChange={(e) => { setCandidateSearch(e.target.value); setCandidatePage(1); }}
                  placeholder={`Tìm ${candidateType === 'STUDENTS' ? 'tên học sinh' : 'tên giáo viên'}...`}
                  className="w-full bg-hicado-slate/10 border border-hicado-slate/30 rounded-2xl px-5 py-3 text-sm font-bold text-hicado-navy outline-none focus:bg-white focus:border-hicado-navy/30 transition-all"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-hicado-navy/20">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs font-black uppercase tracking-widest text-hicado-navy/40">
                <span>{candidateTotal} kết quả</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={candidatePage <= 1}
                    onClick={() => setCandidatePage(p => p - 1)}
                    className="p-2 hover:bg-hicado-slate rounded-lg disabled:opacity-30"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <span>Trang {candidatePage}</span>
                  <button
                    disabled={candidatePage * 20 >= candidateTotal}
                    onClick={() => setCandidatePage(p => p + 1)}
                    className="p-2 hover:bg-hicado-slate rounded-lg disabled:opacity-30"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Candidates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {candidatesLoading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white border border-hicado-slate rounded-[1.5rem] p-5 h-32 animate-pulse flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-hicado-slate/20 rounded w-2/3"></div>
                  <div className="h-3 bg-hicado-slate/10 rounded w-1/2"></div>
                </div>
                <div className="h-8 bg-hicado-slate/20 rounded-xl"></div>
              </div>
            ))}

            {!candidatesLoading && candidates.map(c => (
              <div key={c.id} className="bg-white border border-hicado-slate rounded-[1.5rem] p-5 hover:shadow-premium transition-all group flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-black text-hicado-navy leading-tight">{c.name}</h4>
                    {c.zaloUserId ? (
                      <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Đã ghép</span>
                    ) : (
                      <span className="bg-gray-100 text-gray-400 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Chưa ghép</span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-hicado-navy/40 mb-1">
                    {candidateType === 'STUDENTS' ? `Lớp: ${c.schoolClass || '—'}` : `Môn: ${c.phone || '—'}`}
                  </p>
                  <p className="text-[10px] font-mono text-hicado-navy/20 truncate" title={c.zaloUserId || ''}>
                    UID: {c.zaloUserId || '(Trống)'}
                  </p>
                </div>

                <div className="mt-4 pt-4 border-t border-hicado-slate/50 flex gap-2">
                  {c.zaloUserId ? (
                    <button
                      onClick={() => handleUnlinkManual(c.id, candidateType)}
                      className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 hover:bg-rose-100 transition-all"
                    >Hủy ghép</button>
                  ) : (
                    <button
                      onClick={() => {
                        const raw = prompt(`Nhập Zalo User ID hoặc link OA cho ${c.name}:`);
                        if (raw) {
                          let uid = raw.trim();
                          try { const u = new URL(uid); const p = u.searchParams.get('uid'); if (p) uid = p; } catch {}
                          handleLinkManual(uid, c.id, candidateType);
                        }
                      }}
                      className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-hicado-navy bg-hicado-slate/40 hover:bg-hicado-navy hover:text-white transition-all"
                    >Ghép thủ công</button>
                  )}
                  <button
                    onClick={() => {
                      // Mở tab Followers và scroll đến người này (nếu có thể)
                      setActiveTab('followers');
                      setDrawerSearch(c.name);
                    }}
                    className="p-2 rounded-xl bg-hicado-slate/20 text-hicado-navy/40 hover:text-hicado-navy transition-all"
                    title="Tìm trên danh sách Follower"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m1-5l2 2 4-4" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
            </div>{/* end right panel */}
          </div>{/* end two-panel flex */}

          {/* Audit Logs */}
          <div className="bg-white border border-hicado-slate rounded-[2rem] p-6 overflow-hidden">
            <h3 className="text-sm font-black text-hicado-navy/40 uppercase tracking-widest mb-4">Nhật ký định danh</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-hicado-slate/50">
                    {['Thời gian', 'Hành động', 'Đối tượng', 'Zalo UID', 'Người thực hiện'].map(h => (
                      <th key={h} className="px-4 py-3 font-black text-hicado-navy/30 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hicado-slate/30">
                  {mappingAuditsLoading && Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-4 py-4"><div className="h-4 bg-hicado-slate/10 rounded"></div></td>
                    </tr>
                  ))}
                  {mappingAudits.map(log => (
                    <tr key={log.id} className="hover:bg-hicado-slate/10 transition-colors">
                      <td className="px-4 py-4 text-hicado-navy/40 font-bold whitespace-nowrap">
                        {new Date(log.performedAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-0.5 rounded font-black uppercase text-[10px] ${
                          log.action === 'LINK' ? 'bg-green-100 text-green-700' :
                          log.action === 'OVERRIDE' ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-black text-hicado-navy">{log.targetName}</p>
                        <p className="text-[10px] text-hicado-navy/40 uppercase tracking-tighter">
                          {log.targetType === 'STUDENT' ? 'Học sinh' : 'Giáo viên'}
                          {log.previousTargetName && ` (Thay cho ${log.previousTargetName})`}
                        </p>
                      </td>
                      <td className="px-4 py-4 font-mono text-hicado-navy/40 truncate max-w-[120px]" title={log.zaloUserId}>
                        {log.zaloUserId}
                      </td>
                      <td className="px-4 py-4 font-bold text-hicado-navy">
                        {log.performedByName}
                      </td>
                    </tr>
                  ))}
                  {!mappingAuditsLoading && mappingAudits.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-hicado-navy/20 font-bold">Chưa có lịch sử thay đổi</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* ══ SLIDE-IN DRAWER: chọn học sinh để liên kết ══════════════════════ */}
    {drawerFollower && (
      <div className="fixed inset-0 z-[200] flex justify-end" onClick={() => setDrawerFollower(null)}>
        <div className="w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="p-6 border-b border-hicado-slate flex items-start justify-between shrink-0">
            <div>
              <p className="text-[10px] font-black text-hicado-navy/40 uppercase tracking-widest mb-1">Liên kết Zalo → Học sinh</p>
              <div className="flex items-center gap-3 mt-1">
                <div className="w-10 h-10 rounded-full bg-hicado-slate flex items-center justify-center font-black text-hicado-navy/60">
                  {drawerFollower.displayName.charAt(0)}
                </div>
                <div>
                  <p className="font-black text-hicado-navy">{drawerFollower.displayName}</p>
                  <p className="text-[10px] text-hicado-navy/30 font-mono">{drawerFollower.userId}</p>
                </div>
              </div>
            </div>
            <button onClick={() => setDrawerFollower(null)} className="p-2 text-hicado-navy/30 hover:text-hicado-navy hover:bg-hicado-slate rounded-xl transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b border-hicado-slate shrink-0">
            <input type="text" value={drawerSearch} onChange={e => setDrawerSearch(e.target.value)}
              placeholder="Tìm tên, mã học sinh..."
              className="w-full border border-hicado-slate rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-hicado-emerald transition-all bg-hicado-slate/10" />
          </div>

          {/* Student list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
            {/* Auto-suggestions (only when not searching) */}
            {!drawerSearch && drawerStudentList.suggestions.length > 0 && (
              <>
                <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest px-1 mb-2">💡 Gợi ý theo tên</p>
                {drawerStudentList.suggestions.map(({ s, score }) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-2xl border border-amber-200 bg-amber-50/60">
                    <div className="min-w-0 mr-3">
                      <p className="font-bold text-hicado-navy text-sm truncate">{s.name}</p>
                      <p className="text-xs text-hicado-navy/40">{s.studentCode || '—'} · {s.parentPhone || s.studentPhone || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black text-amber-500">{score}%</span>
                      <button onClick={() => handleLink(drawerFollower, s.id)} disabled={isLinking}
                        className="text-xs font-black bg-hicado-navy text-white px-3 py-1.5 rounded-xl hover:bg-hicado-emerald hover:text-hicado-navy disabled:opacity-50 transition-all">
                        Chọn
                      </button>
                    </div>
                  </div>
                ))}
                <div className="border-t border-hicado-slate/50 pt-3 mt-1">
                  <p className="text-[10px] font-black text-hicado-navy/30 uppercase tracking-widest px-1 mb-2">Tất cả học sinh</p>
                </div>
              </>
            )}

            {/* Full list */}
            {drawerStudentList.all.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-2xl border border-hicado-slate hover:bg-hicado-slate/10 transition-all">
                <div className="min-w-0 mr-3">
                  <p className="font-bold text-hicado-navy text-sm truncate">{s.name}</p>
                  <p className="text-xs text-hicado-navy/40">{s.studentCode || '—'} · {s.parentPhone || s.studentPhone || '—'}</p>
                  {s.zaloUserId && (
                    <p className="text-[10px] text-amber-500 font-bold mt-0.5">⚠ Đang liên kết Zalo UID khác</p>
                  )}
                </div>
                <button onClick={() => handleLink(drawerFollower, s.id)} disabled={isLinking}
                  className="text-xs font-black bg-hicado-slate text-hicado-navy px-3 py-1.5 rounded-xl hover:bg-hicado-navy hover:text-white disabled:opacity-50 transition-all shrink-0">
                  Chọn
                </button>
              </div>
            ))}

            {drawerStudentList.all.length === 0 && drawerSearch && (
              <p className="text-center text-sm text-hicado-navy/30 font-bold py-10">Không tìm thấy học sinh phù hợp</p>
            )}
          </div>
        </div>
      </div>
    )}

    {/* ══ OVERRIDE CONFLICT MODAL ══════════════════════════════════════ */}
    {conflictData && (
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-hicado-navy/40 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-[2.5rem] border border-hicado-slate shadow-2xl p-8 max-w-sm w-full animate-in zoom-in-95 duration-200">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-3xl mb-6 mx-auto">⚠️</div>
          <h3 className="text-xl font-serif font-black text-hicado-navy text-center mb-2">ID đã được sử dụng</h3>
          <p className="text-sm text-hicado-navy/60 text-center leading-relaxed mb-8">
            Zalo ID này đang được ghép với: <br /><strong className="text-hicado-navy">{conflictData.conflictNames}</strong>.
            <br />Bạn có muốn <strong>ghép thêm</strong> cho người này (dùng chung ID) không?
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleLinkManual(conflictData.zaloUserId, conflictData.targetId, conflictData.targetType, true)}
              disabled={isLinking}
              className="w-full bg-hicado-navy text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg"
            >
              {isLinking ? 'Đang xử lý...' : 'Xác nhận dùng chung'}
            </button>
            <button
              onClick={() => setConflictData(null)}
              className="w-full py-3 text-hicado-navy/40 font-black text-xs uppercase tracking-widest hover:bg-hicado-slate/30 rounded-2xl transition-all"
            >Bỏ qua</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};
