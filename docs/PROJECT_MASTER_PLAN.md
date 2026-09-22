# 🚗 AutoBody Intake — Master Project Plan

> **The living document for the entire business venture.**
> As we build, we check off each feature/service. This file is the single source of truth — from first line of code to launch and beyond.

- **Project codename:** AutoBody Intake (working title — rename later)
- **Started:** September 22, 2026
- **Owner:** John
- **Last updated:** September 22, 2026 (OCR auto-fill for license/insurance/VIN photos shipped — see docs/ARCHITECTURE.md)

---

## 📌 Table of Contents
1. [Vision & Elevator Pitch](#1-vision--elevator-pitch)
2. [The Big Picture Strategy](#2-the-big-picture-strategy)
3. [Phase 0 — MVP Scope (What We're Building FIRST)](#3-phase-0--mvp-scope-what-were-building-first)
4. [Product Architecture](#4-product-architecture)
5. [Data We Collect (Intake Forms)](#5-data-we-collect-intake-forms)
6. [Tech Stack](#6-tech-stack)
7. [Project Structure](#7-project-structure)
8. [Feature Checklist (Living Progress Tracker)](#8-feature-checklist-living-progress-tracker)
9. [Roadmap & Phases](#9-roadmap--phases)
10. [Business Model & Pricing](#10-business-model--pricing)
11. [Cost Estimates (Build + Run)](#11-cost-estimates-build--run)
12. [Legal, Compliance & Security](#12-legal-compliance--security)
13. [Risks & Open Questions](#13-risks--open-questions)
14. [Glossary](#14-glossary)

---

## 1. Vision & Elevator Pitch

**One-liner:** We eliminate the administrative chaos of managing a collision repair by capturing everything a body shop needs from the customer — insurance, license, vehicle photos, rental coverage, claim info — through one simple mobile/web intake, and delivering it cleanly to the shop.

**Why now (Sept 2026):** SMB AI adoption is exploding but real integration into daily operations is still poor. Body shops are drowning in phone calls, texts, and paperwork. The workflow is communication-heavy and involves transferring structured information between customer ↔ shop ↔ insurer ↔ adjuster ↔ rental ↔ tow. That's exactly where software (and later AI) creates enormous value.

**Positioning:** This is NOT "AI software." The product is: *"We eliminate 50–80% of the administrative work involved in managing a collision repair."* Technology is just the enabler.

---

## 2. The Big Picture Strategy

Start narrow, win a niche, then expand:

```
Collision shops (intake)
        ↓
Own the collision customer-intake workflow
        ↓
Add AI coordination (status texts, adjuster follow-ups, OCR)
        ↓
Expand: mechanics → dealerships → towing → glass → detailing → fleets
        ↓
Become the vertical AI operating system for automotive service
```

**Guiding principle:** Sell before we over-build. Get 3–5 real shops committed before adding complexity.

---

## 3. Phase 0 — MVP Scope (What We're Building FIRST)

Keep it dead simple and shippable. The MVP is a **customer intake capture tool**.

### What the MVP does
1. A body shop signs up for the service (name, address, **secretary's destination email**).
2. The shop gets a **unique intake link / QR code** to share with customers.
3. A customer (after an accident) opens the link on **iOS, Android, or web** and fills out the intake:
   - Insurance info
   - Driver's license (photo + fields)
   - Vehicle info + photos of damage
   - Rental coverage details
   - Claim information
   - Contact info
4. On submit, the app **packages all the information and photos and emails it to the shop's secretary** at their specified address.
5. Customer sees a confirmation screen.

### What the MVP explicitly does NOT do yet
- ❌ No AI processing (Phase 2)
- ❌ No two-way SMS / status updates (Phase 2)
- ❌ No adjuster follow-ups (Phase 2)
- ❌ No payment processing
- ❌ No complex shop dashboard (email is the "dashboard" for now)

> **The MVP's whole job:** turn a messy phone-call intake into one clean, complete email with all documents and photos attached.

---

## 4. Product Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CUSTOMER FACING                       │
│   iOS App    │    Android App    │    Web Page           │
│         (shared cross-platform intake UI)                 │
└───────────────────────────┬─────────────────────────────┘
                            │  HTTPS (REST/JSON + file upload)
                            ▼
┌─────────────────────────────────────────────────────────┐
│                      BACKEND API                          │
│  • Shop registration & config (destination email)        │
│  • Intake submission endpoint                             │
│  • File/image upload & storage                            │
│  • Email packaging & delivery                             │
│  • (Later) Auth, dashboard, AI services                   │
└───────────────────────────┬─────────────────────────────┘
                            ▼
     ┌──────────────┬───────────────┬──────────────────┐
     │  Database    │  File Storage  │  Email Provider   │
     │ (shops,      │ (photos, docs) │ (sends to shop    │
     │  submissions)│                │  secretary)       │
     └──────────────┴───────────────┴──────────────────┘
```

**MVP flow:** Customer submits intake → backend stores files + record → backend composes a formatted email with all fields + attachments → sends to the shop's configured secretary email → returns confirmation to customer.

---

## 5. Data We Collect (Intake Forms)

### Customer / Contact
- [ ] Full name
- [ ] Phone number
- [ ] Email
- [ ] Preferred contact method

### Insurance
- [ ] Insurance company name
- [ ] Policy number
- [ ] Claim number (if known)
- [ ] Insurance card photo (front/back)
- [ ] Adjuster name & contact (if known)

### Driver's License
- [ ] License photo (front/back)
- [ ] Name, DL number, expiration (auto-fill later via OCR)

### Vehicle
- [ ] Year / Make / Model
- [ ] VIN (photo or typed)
- [ ] License plate
- [ ] Mileage (optional)
- [ ] Damage photos (multiple, guided angles)
- [ ] Description of what happened

### Rental Coverage
- [ ] Does policy include rental coverage? (yes/no/unknown)
- [ ] Rental limit / days (if known)
- [ ] Rental preference

### Claim Information
- [ ] Date of accident
- [ ] Location of accident
- [ ] Police report number (if any)
- [ ] Other party info (if applicable)
- [ ] At-fault determination (if known)

> Fields marked for OCR auto-fill will be typed manually in the MVP and automated in Phase 2.

---

## 6. Tech Stack

> ✅ **LOCKED IN (Sept 22, 2026)** — optimized for low latency, industry standards, and professional quality. One TypeScript language across the whole stack for velocity and consistency.

| Layer | **Chosen** | Rationale |
|---|---|---|
| **Backend API** | **Node.js + Fastify + TypeScript** | Fastify is one of the fastest Node frameworks (~2–3x Express throughput), low overhead, built-in JSON-schema validation. Node already installed → zero setup friction. |
| **Mobile (iOS + Android) + Web** | **React Native + Expo (Expo Router)** | One codebase → iOS, Android, **and** web. Same language as backend. |
| **Database** | **PostgreSQL + Prisma ORM** | Reliable, relational, type-safe, professional. |
| **File/Image storage** | **S3-compatible (Cloudflare R2 / AWS S3)** | Cheap, fast, scalable object storage. |
| **Email delivery** | **Resend** | Modern transactional email, great DX, supports attachments. |
| **Auth (later)** | JWT + shop tenancy | Multi-shop isolation. |
| **Infra / Hosting** | **Docker** + Fly.io / Render | Portable, low-latency deploys. Docker already installed. |

**Environment notes:** Node v18.17.1, npm 10.5.0, Docker 23.0.5, git 2.40.1 confirmed installed on dev machine.

---

## 7. Project Structure

Proposed monorepo layout (to be scaffolded next):

```
AutoBodyIntake/
├── docs/
│   └── PROJECT_MASTER_PLAN.md      ← this file
├── app/                             ← Expo app (iOS + Android + Web) — one codebase
├── backend/                         ← Fastify + TypeScript API
│   ├── src/
│   │   ├── server.ts                ← app entry / Fastify bootstrap
│   │   ├── config/                  ← env & config loading
│   │   ├── plugins/                 ← Fastify plugins (cors, multipart, etc.)
│   │   ├── modules/
│   │   │   ├── health/              ← health check
│   │   │   ├── shops/               ← registration & config (dest email)
│   │   │   ├── intake/              ← submission endpoints
│   │   │   ├── storage/             ← file/image handling (S3/R2)
│   │   │   └── email/               ← packaging & delivery (Resend)
│   │   └── lib/                     ← shared utilities
│   ├── prisma/                      ← Prisma schema & migrations
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
└── README.md
```

---

## 8. Feature Checklist (Living Progress Tracker)

> ✅ = done · 🚧 = in progress · ⬜ = not started. Update as we go.

### 🏗️ Foundation
- ✅ Create independent project folder
- ✅ Write master project plan (this document)
- ✅ Lock in tech stack (Fastify + TS backend · Expo React Native app · PostgreSQL/Prisma)
- ✅ Scaffold monorepo structure
- ✅ Set up version control (git repo)

### 🖥️ Backend (MVP)
- ✅ Project scaffold + health check endpoint
- ✅ Shop registration model & endpoint (stores destination email)
- ✅ Database setup (PostgreSQL) + migrations
- ✅ Intake submission endpoint (accepts all form fields)
- ✅ File/image upload handling
- ✅ File storage integration (S3/R2)
- ✅ Email packaging service (formats submission into readable email)
- ✅ Email delivery integration (send to shop secretary w/ attachments)
- ✅ Submission confirmation response
- ✅ Basic input validation & error handling

### 📱 Mobile & Web Intake App (MVP)
- ✅ App scaffold (shared iOS/Android/web)
- ✅ Intake form: Contact section
- ✅ Intake form: Insurance section (+ card photo upload)
- ✅ Intake form: Driver's license upload
- ✅ Intake form: Vehicle section (+ guided damage photos)
- ✅ Intake form: Rental coverage section
- ✅ Intake form: Claim information section
- ✅ Photo capture / upload with compression
- ✅ Form validation & progress indicator
- ✅ Submit to backend
- ✅ Confirmation screen
- ✅ Unique shop intake link / QR support

### 🚀 Launch Prep (MVP)
- ✅ End-to-end test (customer submits → shop receives email)
- ⬜ Deploy backend to hosting
- ⬜ Deploy web intake page
- ⬜ TestFlight (iOS) build
- ⬜ Google Play internal test build
- ⬜ Onboard first pilot shop
- ⬜ Collect feedback & iterate

### 🔐 Shop Portal & Multi-Tenant Auth
- ✅ Self-serve shop signup (owner email + password, JWT)
- ✅ Shop login + `/auth/me`
- ✅ Tenant auth guard (every protected route scoped to `request.shopId`, never a client param)
- ✅ Shop dashboard API (stats, submission inbox, submission detail, settings update) — replaces email-only view
- ✅ Cross-tenant isolation verified (a shop cannot see another shop's data)

### 🤖 AI Employee Layer
- ✅ AI triage engine (priority, reason, missing-info checklist, suggested next action)
- ✅ Swappable driver: rule-based (zero-config) ⇄ OpenAI (when `OPENAI_API_KEY` set), with automatic fallback to rules on any AI failure
- ✅ Auto-runs on every finalized submission; regenerable on demand via dashboard
- 🔜 **TODO: wire up a real `OPENAI_API_KEY` and compare LLM-generated triage vs. the rule-based baseline** (currently running rules-only — no key configured yet; verify quality/cost before relying on it for pilot shops)
- ✅ OCR auto-fill (license, insurance card, VIN) — swappable driver (rule-based zero-config fallback ⇄ OpenAI Vision), triggered per-attachment via `POST /v1/intake/:token/submissions/:id/attachments/:attachmentId/ocr`, result persisted on the attachment (`ocrData`, `ocrGeneratedAt`)
- ⬜ AI-drafted customer replies / status updates
- ⬜ Two-way SMS status updates
- ⬜ Automated insurance adjuster follow-ups
- ⬜ Multi-user roles per shop (owner vs. staff)

---

## 9. Roadmap & Phases

| Phase | Goal | Rough Duration |
|---|---|---|
| **Phase 0 — Validation** | 3–5 shops committed to pilot | 2–4 weeks (parallel) |
| **Phase 1 — MVP** | Intake app → email to secretary, live with pilots | 4–8 weeks |
| **Phase 2 — AI Layer** | OCR, summaries, SMS updates, adjuster follow-ups, dashboard | +2–3 months |
| **Phase 3 — Platform** | Multi-tenant SaaS, billing, analytics | +2–3 months |
| **Phase 4 — Expansion** | Adjacent automotive verticals | Ongoing |

---

## 10. Business Model & Pricing

Subscription SaaS positioned as an admin-labor replacement, not a cheap tool.

| Plan | Price (target) | For |
|---|---|---|
| Small shop | $499/mo | Single location, core intake |
| Growing shop | $999/mo | Full workflow + AI (Phase 2) |
| Multi-location | $2,000–$5,000+/mo | Chains |
| Setup / onboarding | $1,000–$5,000 one-time | Configuration & training |

**ARR illustration:** 100 shops × $1,000 = $1.2M · 500 × $1,000 = $6M · 2,000 × $1,000 = $24M.
You need *hundreds of businesses*, not millions of consumers.

**MVP pricing note:** During pilots, consider a low/free intro price to gather feedback and case studies, then move to paid tiers.

---

## 11. Cost Estimates (Build + Run)

### Build-time (with AI coding agents)
- AI coding agent + API usage: **~$300–$1,200/month** over the build.
- MVP build window ~1–2 months → **~$600–$2,400 total**. Comfortably inside a bootstrap budget.

### Run-time, per shop per month (MVP — no AI yet)
| Item | Estimate |
|---|---|
| Email delivery (transactional, w/ attachments) | ~$1–$5 |
| File storage (photos/docs) | ~$1–$5 |
| Backend hosting (shared across shops) | pennies per shop at scale |
| **MVP variable cost/shop** | **~$3–$15/mo** |

### Run-time additions in Phase 2 (with AI)
| Item | Estimate |
|---|---|
| LLM (summaries, SMS drafting) | ~$8–$25/shop/mo |
| OCR / document extraction | ~$5–$20/shop/mo |
| SMS (Twilio, per segment) | ~$12–$20/shop/mo |
| **Blended Phase 2 cost/shop** | **~$25–$85/mo** |

At $499–$999/mo pricing, gross margins stay ~90%+.

---

## 12. Legal, Compliance & Security

- [ ] **PII handling:** license, insurance, VIN = sensitive data. Encrypt in transit (HTTPS) and at rest.
- [ ] **Data retention policy:** define how long we keep submissions and images.
- [ ] **Consent:** clear notice to customer that data is shared with their chosen body shop.
- [ ] **Email security:** submissions contain PII — ensure delivery provider supports secure transport; consider link-to-portal instead of raw attachments later.
- [ ] **TCPA compliance:** required *before* any SMS features (Phase 2) — explicit opt-in.
- [ ] **Access control:** each shop only ever sees its own submissions (enforced when dashboard is built).
- [ ] **Terms of Service & Privacy Policy:** needed before public launch.

---

## 13. Risks & Open Questions

**Open questions to resolve next:**
1. **Mobile framework:** React Native vs Flutter? (Recommend React Native for shared web + JS ecosystem.)
2. **Backend language:** Node/NestJS vs Java/Spring Boot? (Pick based on your comfort — this affects speed.)
3. **Email vs portal:** Sending PII as email attachments is simple but less secure. MVP = email (per your request); consider a secure link-to-portal soon after.
4. **App store timeline:** iOS/Android review can take days. Web page can launch instantly — good for first pilots.

**Risks:**
- Emailing sensitive PII → mitigate with secure providers and move to portal delivery in Phase 2.
- Shops may resist changing their intake habits → mitigate by making it *easier* than a phone call.
- Over-building before validating → mitigate by shipping the thin MVP fast.

---

## 14. Glossary

- **Intake:** the process of collecting all customer/vehicle/insurance info at the start of a repair.
- **Adjuster:** insurance company rep who approves repair costs.
- **Supplement:** additional repair cost discovered mid-repair that needs insurer approval.
- **OCR:** Optical Character Recognition — auto-extracting text from photos (license, insurance card).
- **Secretary email:** the destination inbox at the body shop where intake submissions are sent (MVP delivery target).

---

*This is a living document. Update the checklist in Section 8 and the "Last updated" date at the top whenever we complete a feature.*





