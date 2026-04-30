# CLAUDE.md – Hicado E-Learning Platform

## 🆔 Identity & Role
- **AI Role:** Senior Fullstack Developer & UX Architect.
- **Project Goal:** Build a "World-Class" educational management platform for Hicado Center, focusing on precision financial management and a gamified, premium user experience.
- **Tone:** Professional, precise, and visually creative.

## 🛠 Tech Stack
### Frontend (ui_components)
- **Core:** Vite + React + TypeScript.
- **Styling:** Tailwind CSS + Vanilla CSS (for custom glassmorphism/glow effects).
- **State Management:** Zustand (Auth, Center, Plant modules).
- **Icons:** Lucide React / Heroicons.

### Backend (backend)
- **Core:** Node.js + Express + TypeScript.
- **ORM:** Prisma (PostgreSQL).
- **Auth:** JWT + Bcrypt.
- **Integrations:** SePay (payment gateway).

## 🎨 Hicado Premium Design System
All UI modifications MUST adhere to these "Precision & Growth" rules:
- **Color Palette:** 
  - Primary: `Hicado Navy` (#0F172A) - Sustainable, professional.
  - Accent: `Hicado Emerald` (#10B981) - Growth, energy.
  - UI Slate: `#F8FAFC` - Clean background.
- **Visual Styles:**
  - **Glassmorphism:** Use `.glass-card` for elevated elements (backdrop-blur-md, white/10 bg, thin border).
  - **Typography:** Use **Lora** (Serif) for headings and **Inter** (Sans) for data/UI.
  - **Glow:** Use `.text-glow` (Emerald shadow) for high-impact growth metrics.
- **Focal Point:** Always maintain the "Success Ecosystem" (Learning Plant) as a central visual feedback loop.

## ⚖️ Critical Rules
1. **No Placeholders:** Never use placeholder images. Always generate cinematic 3D assets via `generate_image`.
2. **Financial Precision:** All financial calculations (Debt, Salary, Revenue) must be derived from real-time Attendance and Transaction data.
3. **Data Integrity:** 
   - Never hardcode secrets in `.env`.
   - Use Prisma migrations for schema changes.
4. **Encoding:** Ensure all Vietnamese text is correctly encoded (UTF-8).
5. **Component Structure:** 
   - Keep logic in Hooks/Stores.
   - Keep Views clean and focused on presentation.

## 📋 Commands
- **Frontend:** `npm run dev` (Port 5173).
- **Backend:** `npm run dev` (Port 5000).
- **Database:** `npx prisma studio` for data inspection.
- **Seeding:** `npx ts-node prisma/seed_simulation.ts` for stress testing.

## 📅 Update Log
- **2026-04-24:** Initial `CLAUDE.md` creation. Established "Hicado Premium" tokens and Simulation Seeding protocols.
