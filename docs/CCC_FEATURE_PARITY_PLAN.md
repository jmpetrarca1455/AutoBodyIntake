# CCC ONE Feature Parity Plan

_Last updated: 2026-09-23_

## 1. Why this document exists

CCC Intelligent Solutions ("CCC ONE") is the dominant estimating + shop
management platform used by collision repair shops in North America. The
user asked us to look at what CCC ONE offers, decide which parts are vital
for a body shop, and build a homepage dashboard that ties everything
together as a suite of services — the same way CCC ONE presents Estimating,
Workflow, Parts, Payments, etc. as modules inside one shop platform.

This doc:
1. Summarizes CCC ONE's real module lineup (from public product
   documentation/industry knowledge — CCC doesn't publish an API price
   sheet, so this is based on how the product is actually used in shops).
2. Marks each module **Vital / Valuable / Skip** for a small-to-mid size
   independent body shop (our target customer).
3. Maps every "Vital"/"Valuable" module to concrete additions in *this*
   codebase (Prisma models, backend modules, shared contracts, app screens).
4. Gives a build order so we ship the highest-value pieces first, the same
   incremental way the intake product itself was built.

## 2. CCC ONE's module lineup (industry knowledge)

| CCC ONE module | What it does |
|---|---|
| **Estimating** | Photo/VIN-based estimate builder: OEM repair procedures, parts pricing (CCC APU parts database — OEM/aftermarket/recycled/LKQ), labor time guides, paint/materials calculators, supplement tracking. This is CCC's flagship product. |
| **Workflow / Production Management** | A visual board of every vehicle in the shop by repair stage (estimate → parts → disassembly → repair → paint → reassembly → QC → ready for pickup), technician assignment, cycle-time tracking. |
| **Parts Procurement** | Order parts from OEM dealers/aftermarket/recycled suppliers directly from the estimate, compare prices, track order status (ordered/backordered/received), return/core tracking. |
| **Insurance/DRP Communication** | Submit estimates and supplements to insurance companies electronically, adjuster messaging, DRP program compliance tracking. |
| **Customer Experience** | Text/email status updates, photo sharing, digital check-in/repair authorization e-signature, online scheduling. |
| **Payments** | Collect insurance and customer payments (deductibles, betterment, out-of-pocket) electronically, reconcile against the RO total. |
| **Total Loss / Valuation** | Vehicle valuation for total-loss claims — mostly used by insurers, not body shops directly. |
| **Analytics / Insights (BI)** | Shop KPI dashboards: cycle time, average RO (repair order) value, touch time, CSI (customer satisfaction), DRP scorecards. |
| **Mobile / Photo capture** | Technician & estimator mobile app for photos, VIN scan, damage photos tied to the RO. |
| **Calibration / ADAS tracking** | Track required ADAS calibrations per repair (increasingly required on modern vehicles), sublet to calibration centers. |
| **Sublet management** | Track outsourced work (glass, alignment, calibration, upholstery) as line items with vendor + cost. |
| **Scheduling** | Appointment booking for drop-off/pickup, shop capacity/day planning. |
| **Rental integration** | Track a customer's rental car (Enterprise etc.) start/end dates against the RO. |

## 3. Prioritization for our shop (independent/small-to-mid collision center)

| Module | Priority | Reasoning |
|---|---|---|
| Intake & document collection | ✅ **Already built** | Our differentiator — CCC ONE has no true customer-facing digital intake wizard like ours. |
| AI triage / damage assessment | ✅ **Already built** | Our differentiator — CCC ONE has no AI severity/cost pre-triage. |
| Customer/adjuster/parts-supplier communications + manual notes | ✅ **Already built** | Matches CCC ONE's Customer Experience + adjuster messaging. |
| **Repair Workflow Board** (production management) | 🔴 **Vital — build now** | This is the single most-used screen in CCC ONE day-to-day. Shops live in this view. |
| **Estimating (line-item builder)** | 🔴 **Vital — build now** | Core CCC ONE function. Every RO needs a real cost estimate, not just an AI range. |
| **Parts ordering/tracking** | 🔴 **Vital — build now** | Directly requested by the user previously ("update images...registration"); parts delays are the #1 cycle-time killer, tracking them is high value. |
| **Scheduling (drop-off/pickup appointments)** | 🟡 **Valuable — build now** | Needed to plan bay/tech capacity; simple to add given our existing data model. |
| **Analytics / shop KPI dashboard** | 🟡 **Valuable — build now (basic)** | Cycle time, avg RO value, status breakdown — cheap to compute from data we already store. |
| Payments processing | ⚪ **Skip (for now)** | Requires a payment processor integration (Stripe/etc.) and PCI scope — out of scope until the shop needs real money movement. Documented as a future phase. |
| Total loss valuation | ⚪ **Skip** | This is an insurer-side tool, not something an independent body shop needs. |
| ADAS calibration tracking | 🟡 **Valuable — fold into Parts/Sublet** | Modeled as a special "sublet" line item rather than a whole new module, to avoid overbuilding. |
| Rental integration | ⚪ **Skip (already have rental fields)** | We already capture rental coverage/preference in intake; a full rental-company API integration is out of scope. |
| Mobile native photo capture | ✅ **Already built** | Our PhotoPicker/staff attachment upload already covers this. |

## 4. What we're building, mapped to this codebase

### 4.1 Homepage Dashboard (navigation hub)
Rework `app/app/portal/index.tsx` into a true **Home** screen: shop stats
up top, then a grid of navigation cards — one per module — instead of the
current "stats + flat submission list" layout. The flat list moves to a
new **Customers/Submissions** list screen reachable from its own card.

Cards: Smart Queue · Repair Workflow Board · Customers · Scheduling ·
Parts Orders · Reports · Staff (owner-only) · Shop Settings.

### 4.2 Repair Workflow Board — `portal/workflow.tsx`
A Kanban-style board with one column per `SubmissionStatus` (already exists
in Prisma: RECEIVED → IN_REVIEW → ESTIMATE_READY → IN_REPAIR →
READY_FOR_PICKUP → COMPLETED, plus FAILED/ARCHIVED filtered out by default).
No schema change needed — reuses the existing `PATCH /dashboard/submissions/:id`
status endpoint. Clicking a card's status chip moves it to another column
(same dropdown pattern already built in the detail screen).

### 4.3 Estimating — new `estimate` module
**New Prisma model** `EstimateLineItem`:
- `id, submissionId, category (PARTS|LABOR|PAINT_MATERIALS|SUBLET|MISC), description, partNumber?, quantity, unitPrice, laborHours?, laborRate?, total, createdAt, updatedAt`

**New shared contracts** (`packages/shared/src/estimate-line-items.contracts.ts`):
category enum + labels, `createEstimateLineItemSchema`, `updateEstimateLineItemSchema`.

**New backend module** `backend/src/modules/estimates/`:
- `POST /dashboard/submissions/:id/estimate-lines` (create)
- `PATCH /dashboard/submissions/:id/estimate-lines/:lineId` (edit)
- `DELETE /dashboard/submissions/:id/estimate-lines/:lineId`
- `GET /dashboard/submissions/:id/estimate-lines` (list + computed totals by category + grand total)

**App UI**: new "Estimate" section in the submission detail screen —
boxed line-item table (reusing the GroupCard/grid pattern), an "Add line"
form, and a totals summary card (Parts / Labor / Paint materials / Sublet /
Misc / **Grand total**).

### 4.4 Parts ordering/tracking — new `parts-orders` module
**New Prisma model** `PartsOrder`:
- `id, submissionId, description, partNumber?, supplier?, status (NEEDED|ORDERED|BACKORDERED|RECEIVED|INSTALLED|RETURNED), cost?, orderedAt?, expectedAt?, receivedAt?, notes?, createdAt, updatedAt`

**New shared contracts** (`packages/shared/src/parts-orders.contracts.ts`):
status enum + labels, create/update schemas.

**New backend module** `backend/src/modules/parts-orders/`:
- `POST/GET /dashboard/submissions/:id/parts-orders`
- `PATCH/DELETE /dashboard/submissions/:id/parts-orders/:orderId`
- `GET /dashboard/parts-orders` — shop-wide view across all open ROs (for
  a front-desk person tracking every outstanding part at once).

**App UI**: "Parts" section in the submission detail screen (add/status
dropdown per row, boxed grid) **plus** a shop-wide `portal/parts.tsx`
screen for the cross-RO view, linked from the Home dashboard.

### 4.5 Scheduling — extend `Submission` + new screen
**Prisma**: add `dropoffScheduledAt DateTime?`, `pickupScheduledAt DateTime?`
to `Submission` (small additive migration).

**Shared contract**: extend `staffUpdateSubmissionSchema` with an optional
`schedule` group (`dropoffScheduledAt`, `pickupScheduledAt`).

**App UI**: a "Schedule" box in the Customer file grid (date/time text
fields, matches the existing pattern) + a new `portal/schedule.tsx` list
screen sorted by the soonest upcoming appointment, shop-wide.

### 4.6 Reports / Analytics — extend `dashboard` module
**Backend**: `GET /dashboard/reports` computing, from data already stored:
average cycle time (createdAt → emailedAt/completedAt), count-by-status
breakdown, average estimate grand total (once 4.3 ships), parts orders
still outstanding, and last-30-days volume trend.

**App UI**: new `portal/reports.tsx` — stat cards + simple bar-style
breakdown by status (no charting library needed — colored bars sized by
percentage, consistent with our existing badge/box visual language).

## 5. Build order (this session)

1. Homepage Dashboard navigation hub — quick, unblocks discoverability of
   everything else. **(done first)**
2. Repair Workflow Board — no schema changes, fastest high-value win.
3. Estimating module (schema + backend + UI) — biggest lift, highest
   CCC-ONE-parity value.
4. Parts ordering/tracking module (schema + backend + UI).
5. Scheduling (schema + UI additions).
6. Reports/Analytics (backend + UI).

Same engineering bar as the intake work: shop-scoped everywhere, Zod
contracts shared between backend/app, Prisma migrations committed, and a
smoke-test pass before calling anything done.

