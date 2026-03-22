import {
  Home,
  BookOpen,
  MessageCircle,
  User,
  Users,
  FolderOpen,
  HelpCircle,
  Inbox,
  Settings,
  LayoutDashboard,
  Receipt,
} from "lucide-react";
import { ROUTES } from "@/config/routes";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const memberNav: NavItem[] = [
  { label: "Dashboard", href: ROUTES.dashboard, icon: Home },
  { label: "Khóa học", href: ROUTES.courses, icon: BookOpen },
  { label: "Tin nhắn", href: ROUTES.messages, icon: MessageCircle },
  { label: "Gói đăng ký", href: ROUTES.subscriptions, icon: Receipt },
  { label: "Hồ sơ", href: ROUTES.profile, icon: User },
];

export const adminNav: NavItem[] = [
  { label: "Trang quản trị", href: ROUTES.admin, icon: LayoutDashboard },
  { label: "Học viên", href: ROUTES.adminMembers, icon: Users },
  { label: "Gói đăng ký", href: ROUTES.adminSubscriptions, icon: Receipt },
  { label: "Quản lý khóa học", href: ROUTES.adminCourses, icon: FolderOpen },
  { label: "Câu hỏi", href: ROUTES.adminQuestions, icon: HelpCircle },
  { label: "Tất cả tin nhắn", href: ROUTES.adminMessages, icon: Inbox },
  { label: "Cài đặt", href: ROUTES.adminSettings, icon: Settings },
];
