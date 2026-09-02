# IT Help Desk Ticketing integration

When a **ticketable** maintenance threshold is breached, this project makes a
real HTTP call that opens a `SYSTEM_GENERATED` ticket in the separate
[IT Help Desk Ticketing system](https://github.com/mahir-alam/it-helpdesk-ticketing-system).

## The contract (verified against source)

Verified against `it-helpdesk-ticketing-system` `main`, 2026-08-30 —
`server/src/modules/tickets/tickets.routes.js`, `tickets.validation.js`,
`tickets.service.js`.

```
POST  {TICKET_TRACKER_BASE_URL}/api/tickets/auto-create
Header: X-Api-Key: <INTEGRATION_API_KEY>
Content-Type: application/json
```

Request body — `autoCreateTicketSchema` (Zod). Unknown keys are stripped; there
is **no `priority` field** (the tracker derives priority from impact × urgency):

| field            | rules                                                                       | this project sends |
| ---------------- | -------------------------------------------------------------------------- | ------------------ |
| `title`          | string, 3–200, **required**                                                | `"<assetTag> — <condition>"` |
| `description`    | string, 1–5000, **required**                                               | asset context, observed vs threshold, dashboard link, flag id |
| `category`       | string, 1–80, optional (server default `"System / Monitoring"`)            | `"Fleet / Equipment"` |
| `impact`         | `SINGLE_USER \| DEPARTMENT \| ENTIRE_COMPANY`, optional (default `DEPARTMENT`) | mapped from flag kind |
| `urgency`        | `WORKAROUND_AVAILABLE \| WORK_DEGRADED \| SYSTEM_DOWN`, optional (default `WORK_DEGRADED`) | mapped from flag kind |
| `externalSource` | string, 1–120, **required**                                                | `"fleet-asset-tracker"` (`INTEGRATION_EXTERNAL_SOURCE`) |
| `externalRef`    | string, ≤200, optional                                                     | `"flag:<id>"` (real evaluation), or `"test-alert:<tag>:<ts>"` from the simulated test button |
| `assetTag`       | string, ≤120, optional (tracker links it to its own Asset if the tag exists) | the fleet asset tag |

Response: **201** with the full ticket JSON — includes `number` (e.g.
`INC-000123`) and `source: "SYSTEM_GENERATED"`. **401** on a bad/missing key
(only enforced when the tracker itself has `INTEGRATION_API_KEY` set).

Kind → impact / urgency mapping (`server/src/modules/integration/ticketClient.js`):

| flag kind           | impact        | urgency                | ticketed? |
| ------------------- | ------------- | ---------------------- | --------- |
| `SERVICE_OVERDUE`   | `DEPARTMENT`  | `WORK_DEGRADED`        | yes       |
| `EXCESSIVE_DOWNTIME` | `DEPARTMENT` | `WORK_DEGRADED`        | yes       |
| `HIGH_FUEL_BURN`    | `SINGLE_USER` | `WORKAROUND_AVAILABLE` | yes       |
| `SERVICE_DUE`       | `SINGLE_USER` | `WORKAROUND_AVAILABLE` | no        |
| `LOW_UTILIZATION`   | `SINGLE_USER` | `WORKAROUND_AVAILABLE` | no        |

## Modes (`INTEGRATION_MODE`)

| mode       | behaviour                                                                  |
| ---------- | ------------------------------------------------------------------------- |
| `mock`     | no network; returns a synthetic `INC-` number. Still writes an `IntegrationEvent`. Default when `TICKET_TRACKER_BASE_URL` is unset. |
| `live`     | real `POST` to the tracker with `X-Api-Key`. Per-attempt timeout `INTEGRATION_TIMEOUT_MS` (default 15 s), up to `INTEGRATION_ATTEMPTS` tries (default 3) with `INTEGRATION_RETRY_DELAY_MS` between them, retrying on network error / timeout / 5xx. |
| `disabled` | flags are still raised; no ticket call is attempted.                       |

## Point it at a real tracker

```
INTEGRATION_MODE=live
TICKET_TRACKER_BASE_URL=https://it-helpdesk-api.onrender.com
INTEGRATION_API_KEY=<same value as the tracker's INTEGRATION_API_KEY>
```

## Verify in both systems

1. In FleetView, click **Refresh evaluation** so a ticketable flag is raised and
   escalated. (**Send test alert** is a local simulation — it always runs in mock
   mode and never posts to the real tracker.)
2. FleetView **Alerts & Tickets** page → *Integration event log*: the row shows
   the request payload, `201`, and the returned ticket number.
3. In the IT ticketing system, open that ticket number. Confirm:
   - `source = SYSTEM_GENERATED`
   - `externalSource = fleet-asset-tracker`
   - `externalRef` matches the flag id / demo ref
   - priority was derived by the tracker (never sent by us).

## Audit trail

Every attempt — success or failure — is persisted as an `IntegrationEvent`
(`endpoint`, `requestPayload`, `responseStatus`, `responseBody`, `ticketNumber`,
`ok`, `errorMessage`). Ticketed flags also store `externalTicketNumber` /
`externalTicketId` and flip to `status = TICKETED`.
