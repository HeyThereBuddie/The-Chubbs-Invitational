# ⛳ The Chubbs Memorial

A full-stack golf tournament management app for a group of friends, themed after Chubbs Peterson from Happy Gilmore.

**Stack:** React + Vite + TypeScript · Supabase (Auth + Postgres + Realtime) · Tailwind CSS · Deployed on Vercel

---

## Features

| Page | Players | Admins |
|------|---------|--------|
| Dashboard | ✅ | ✅ |
| Scores (real-time) | ✅ enter scores | ✅ |
| Leaderboard (live) | ✅ | ✅ |
| Tee Times | ✅ view | ✅ edit + auto-assign |
| Groups & Pairings | ✅ view | ✅ generate + release |
| Contests (CTP / LD) | ✅ submit | ✅ |
| Updates / Announcements | ✅ view | ✅ post/pin/delete |
| Mr. Leahey Award voting | ✅ | ✅ |
| RSVP Manager | ❌ hidden | ✅ |
| Admin Panel | ❌ hidden | ✅ |

---

## Setup

### 1. Clone & install

```bash
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In **SQL Editor**, run the migrations in order:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rls.sql`
   - `supabase/migrations/003_seed.sql` *(demo data only — replace before going live)*
3. In **Storage**, create a public bucket named `contest-photos`
4. Enable Google OAuth under **Authentication → Providers** (optional)

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_PLAYER_CODE=CHUBS2025
VITE_ADMIN_CODE=CHUBS_ADMIN
```

> **Security:** Invite codes are stored in env vars and validated client-side at registration. The role written to `profiles` is the source of truth for all access control.

### 4. Run locally

```bash
npm run dev
```

### 5. Deploy to Vercel

1. Import the repo on [vercel.com](https://vercel.com)
2. Add the four environment variables in the Vercel dashboard
3. Deploy — Vercel will auto-detect Vite

---

## Authentication

- **Player invite code:** `CHUBS2025` → `player` role
- **Admin invite code:** `CHUBS_ADMIN` → `admin` role
- Supports email/password and Google OAuth via Supabase Auth
- App is fully gated — login screen is the landing page

---

## Database Schema

See `supabase/migrations/001_schema.sql` for the full schema.

Key tables: `profiles`, `players`, `teams`, `scores`, `tee_times`, `updates`, `pairings`, `contest_entries`, `leahey_votes`

Realtime enabled on: `scores`, `updates`, `contest_entries`, `leahey_votes`

---

## Color Palette

| Token | Value | Use |
|-------|-------|-----|
| Black | `#080808` | Background |
| Gold | `#FCB514` | Primary accent (Bruins/Happy Gilmore gold) |
| Card | `rgba(18,14,6,0.8)` | Glass card background |
| Muted | `#806040` | Secondary text |

---

*"It's all in the hips." — Chubbs Peterson*
