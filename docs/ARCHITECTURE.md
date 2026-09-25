# FACTS System Architecture Map

Live visual flow of application data — from ingestion through allocation to outcome buckets and rewards.

> **Preview:** Open this file in Cursor and press `Ctrl + Shift + V` (or `Cmd + Shift + V` on Mac) for the rendered diagram.

---

## Data Flow Overview

```mermaid
graph TD
    %% ── Ingestion Layer ──────────────────────────────────────────────────────
    subgraph INGEST["Ingestion Layer"]
        A1[Plaid API<br/>OAuth · Balance Sync · Transactions]
        A2[Manual Entry<br/>Income & Spending]
        A3[Receipt Scans<br/>mod_shopping]
        A4[CSV Import<br/>mod_sanitized_importer]
    end

    A1 -->|Raw Payloads| B
    A2 -->|User Input| B
    A3 -->|Parsed Items| B
    A4 -->|Normalized Rows| B

    %% ── Monolith Entry ───────────────────────────────────────────────────────
    B[server.js<br/>Monolith Entry Point]

    %% ── Module Registration ──────────────────────────────────────────────────
    B -->|Boot & Mount| C[module-loader.js<br/>Auto-discovers modules/mod_*]
    C -->|Registers & Mounts| D[Active Module Layer]

    %% ── Distinct Active Modules ─────────────────────────────────────────────
    subgraph MODULES["Pluggable Modules /api/mod_*"]
        D1[mod_plaid<br/>Bank Link · Sync · Balances]
        D2[mod_ssc<br/>t_dagsis_ledger<br/>Spending Entries per Bucket]
        D3[mod_sweep<br/>Surplus Calc · EOM Cascade]
    end

    D --> D1
    D --> D2
    D --> D3

    %% ── Distributed Ledger Layout ────────────────────────────────────────────
    subgraph LEDGER["Distributed Allocation Ledger"]
        E1[(categories)]
        E2[(user_allocations)]
        E3[(allocation_config)]
    end

    B -->|Legacy Routes| E1
    D2 -->|Bucket-tagged Entries| E2
    D3 -->|Reads Ratios & Spend| E1
    D3 --> E2
    E1 --- E2
    E2 --- E3

    %% ── Six Outcome Buckets ──────────────────────────────────────────────────
    E2 -->|Data Segregation| H[Six Outcome Buckets]
    D2 -->|Ledger Writes| H
    D3 -->|Surplus Routing| H

    H --> H1["necessities<br/>50%"]
    H --> H2["reserve<br/>10%"]
    H --> H3["velocity<br/>10%"]
    H --> H4["growth<br/>10%"]
    H --> H5["lifestyle<br/>10%"]
    H --> H6["legacy<br/>10%"]

    %% ── Rewards Chain ────────────────────────────────────────────────────────
    H -->|Optimization / Allocation Events| F[mod_gamification<br/>12-Level Sovereign Protocol<br/>XP · Level Gates · Decay]
    F -->|fire-and-forget POST /mint| G[mod_rewards<br/>Wallet Registry<br/>Cent-Standard · 100 pts = $1.00]

    %% ── Styling ──────────────────────────────────────────────────────────────
    style A1 fill:#4CAF50,stroke:#333,stroke-width:2px,color:#fff
    style A2 fill:#4CAF50,stroke:#333,stroke-width:2px,color:#fff
    style A3 fill:#4CAF50,stroke:#333,stroke-width:2px,color:#fff
    style A4 fill:#4CAF50,stroke:#333,stroke-width:2px,color:#fff
    style B fill:#37474F,stroke:#333,stroke-width:2px,color:#fff
    style C fill:#546E7A,stroke:#333,stroke-width:2px,color:#fff
    style D1 fill:#607D8B,stroke:#333,stroke-width:2px,color:#fff
    style D2 fill:#607D8B,stroke:#333,stroke-width:2px,color:#fff
    style D3 fill:#607D8B,stroke:#333,stroke-width:2px,color:#fff
    style E1 fill:#2196F3,stroke:#333,stroke-width:2px,color:#fff
    style E2 fill:#2196F3,stroke:#333,stroke-width:2px,color:#fff
    style E3 fill:#2196F3,stroke:#333,stroke-width:2px,color:#fff
    style H fill:#1565C0,stroke:#333,stroke-width:2px,color:#fff
    style F fill:#9C27B0,stroke:#333,stroke-width:2px,color:#fff
    style G fill:#7B1FA2,stroke:#333,stroke-width:2px,color:#fff
    style H1 fill:#60a5fa,stroke:#333,stroke-width:2px,color:#fff
    style H3 fill:#FF9800,stroke:#333,stroke-width:2px,color:#fff
    style H6 fill:#795548,stroke:#333,stroke-width:2px,color:#fff
```

---

## Layer Reference

| Layer | Components | Role |
|-------|------------|------|
| **Ingestion** | Plaid, Manual Entry, `mod_shopping` receipts, `mod_sanitized_importer` CSV | All financial data enters through `server.js` — no single ingestion pipe |
| **Routing** | `server.js` → `module-loader.js` | Monolith boots Express, discovers `modules/mod_*`, mounts at `/api/{moduleId}` |
| **Active Modules** | `mod_plaid`, `mod_ssc`, `mod_sweep` | Bank sync, bucket-tagged ledger entries, surplus calculation and EOM cascade |
| **Distributed Ledger** | `categories`, `user_allocations`, `allocation_config` | Allocation ratios live across DB tables and legacy routes — not a single engine class |
| **Outcome Buckets** | 6 slugs with default 50/10/10/10/10/10 split | User overrides via `user_allocations`; must always total 100% |
| **Progression** | `mod_gamification` | 12-level Sovereign Protocol; XP multipliers pause during decay state |
| **Rewards** | `mod_rewards` | Wallet Registry; integer-only Cent-Standard (100 pts = $1.00); minted via fire-and-forget POST from gamification |

---

## Bucket Slugs (Canonical)

| Slug | Default % | Purpose |
|------|-----------|---------|
| `necessities` | 50% | Housing, utilities, food, transportation |
| `reserve` | 10% | Emergency fund, strategic savings |
| `velocity` | 10% | Debt payoff, HELOC velocity engine |
| `growth` | 10% | Investments, wealth building |
| `lifestyle` | 10% | Discretionary spending, experiences |
| `legacy` | 10% | Generational wealth, future generations |

> Slug aliases in legacy code: `nec` maps to `necessities`. See `modules/mod_sweep/index.js` and `modules/mod_shopping/index.js` for runtime resolution.

---

## Rewards Chain Detail

```
Optimization / allocation event
        │
        ▼
mod_gamification  ── awardXPInternal()
  · Inserts xp_events (immutable)
  · Updates lifetime_xp + level gates
  · Decay state pauses multipliers (XP still recorded)
        │
        ▼  fire-and-forget (non-blocking)
POST /api/mod_rewards/mint
        │
        ▼
mod_rewards.user_wallet + rewards_ledger
  · Cent-Standard: 100 integer points = $1.00
  · No floats in ledger arithmetic
```

---

## Related Docs

- [`CLAUDE.md`](../CLAUDE.md) — agent context, schema tables, stack overview
- [`MODULES.md`](../MODULES.md) — full module registry
- [`HOUSEHOLD_SYSTEM_COMPLETE.md`](./HOUSEHOLD_SYSTEM_COMPLETE.md) — multi-user household feature
- [`SANDBOX_ACCOUNT.md`](./SANDBOX_ACCOUNT.md) — sandbox testing accounts
