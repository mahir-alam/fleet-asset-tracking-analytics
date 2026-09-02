# Verification

How to prove this build is real — the same bar the IT Ticket Tracker was held to
(actual code + a working run, not a description).

## Fresh end-to-end run

```bash
# 0. prerequisites: Docker, Node 20+, Python 3.10+
cp .env.example .env
npm install
pip install -e ./analytics

# 1. database + views
docker compose up -d db
npm --workspace server run prisma:migrate
npm --workspace server run db:views

# 2. sample data (deterministic) + seed
python data/generate_sample_data.py         # -> data/raw/fleet_raw_sample.xlsx + server/prisma/seed-data.json
npm --workspace server run seed

# 3. run it
npm run dev                                   # API :4000 + client :5173  (or run each workspace)

# 4. Excel pipeline (import + export, both real)
python -m fleet_analytics ingest --file data/raw/fleet_raw_sample.xlsx
python -m fleet_analytics analyze
python -m fleet_analytics report              # -> data/exports/fleet-summary-<date>.xlsx

# 5. PowerShell pipeline (ingest -> report -> evaluate -> tickets)
pwsh automation/Invoke-FleetPipeline.ps1 -ApiBase http://localhost:4000

# 6. tests
npm --workspace server test                   # node:test — 22 tests, no DB/network
cd analytics && python -m pytest -q            # 11 tests
```

## Expected results (deterministic seed)

- **20 assets** (8 haul trucks, 4 excavators, 3 dozers, 2 loaders, 2 graders,
  1 water truck), ~**1,800** utilization logs, ~**1,190** fuel logs, ~**90**
  downtime events over 90 days.
- `POST /api/alerts/evaluate` on a fresh seed raises **5 flags** and creates
  **3 tickets**:

  | asset | flag                | ticketed |
  | ----- | ------------------- | -------- |
  | HT-13 | `SERVICE_OVERDUE`   | ✅        |
  | EX-03 | `EXCESSIVE_DOWNTIME` | ✅       |
  | WT-01 | `HIGH_FUEL_BURN`    | ✅        |
  | DZ-02 | `LOW_UTILIZATION`   | —        |
  | GR-01 | `SERVICE_DUE`       | —        |

- Re-running the evaluation raises **0** new flags (dedupe).
- The Python `analyze` KPIs match `SELECT * FROM v_fleet_kpis` (independent
  implementations agreeing).

## Integration proof

- `INTEGRATION_MODE=mock` (default): tickets get synthetic `INC-######` numbers;
  every call is logged as an `IntegrationEvent` (Alerts & Tickets page).
- `INTEGRATION_MODE=live` + `TICKET_TRACKER_BASE_URL` + `INTEGRATION_API_KEY`:
  the ticket appears in the IT Help Desk Ticketing system with
  `source = SYSTEM_GENERATED`. See `docs/INTEGRATION.md` → "Verify in both systems".
- `server/tests/ticketClient.test.js` re-declares the tracker's
  `autoCreateTicketSchema` as a contract guard — if the payload ever drifts, that
  test fails.

## Code-review checklist

- [ ] `npm --workspace server test` green (22)
- [ ] `pytest` green (11)
- [ ] `npm --workspace client run build` clean
- [ ] fresh evaluate → 5 flags / 3 tickets; second evaluate → 0
- [ ] `data/exports/fleet-summary-<date>.xlsx` generated with 6 sheets
- [ ] PowerShell pipeline exits 0, writes `automation/logs/pipeline-*.log`
- [ ] `powerbi/fleet-analytics.pbip` opens; measures resolve (or manual path per BUILD_GUIDE)
