# Module Architecture & Bundling Rules

This document defines how to build, register, and bundle new modules in Financial Revolution.

---

## Module Structure

### Directory Layout
```
modules/
  mod_brokerage/
    index.js           # Module entry point (exports routes, healthCheck, metadata)
    routes/            # API route handlers
    migrations/        # Database migrations (own schema)
    health.js          # Health check implementation

  mod_compliance/      # Placeholder
  mod_gamification/    # Placeholder
  mod_affiliate/       # Placeholder
  mod_benefits/        # Placeholder

tfr_vault_services/    # Root-level module (lending desk)
  index.js
  routes/
  migrations/
```

### Module Schema Naming
Each module gets its own PostgreSQL schema:
- `core.*` — existing FACTS tables (users, transactions, allocations, accounts)
- `mod_brokerage.*` — brokerage tables (assets, transactions, discipline)
- `mod_compliance.*` — compliance tables
- `mod_gamification.*` — gamification tables
- `mod_affiliate.*` — affiliate tables
- `mod_benefits.*` — benefits tables
- `tfr_vault.*` — lending desk tables

**Why schemas?** They enforce data isolation, prevent naming conflicts, and make it trivial to remove a module (drop schema).

---

## Creating a New Module

### Step 1: Generate Module Structure
```bash
mkdir -p modules/mod_yourmodule/{routes,migrations}
touch modules/mod_yourmodule/index.js
```

### Step 2: Implement index.js

```javascript
/**
 * Your Module Name
 * Short description
 */

const express = require('express');
const { asyncRoute } = require('../../module-error-boundary');

module.exports = {
  /**
   * Module metadata
   * Used by system to understand requirements and defaults
   */
  metadata: {
    name: 'Readable Name',
    version: '1.0.0',
    requiredCoreVersion: '1.0.0',
    defaultEnabled: false  // Don't auto-enable on launch
  },

  /**
   * Express router
   * Mounted at /api/mod_yourmodule
   * All routes wrapped in asyncRoute() to catch errors
   */
  routes: express.Router()
    .get('/health', asyncRoute(async (req, res) => {
      res.json({
        status: 'ok',
        version: '1.0.0',
        lastMigration: '2026-04-25'
      });
    }))
    .get('/data', asyncRoute(async (req, res) => {
      // Your route implementation
    })),

  /**
   * Health check function
   * Called by /api/system/health/modules
   */
  healthCheck: async (pool) => {
    try {
      // Check module health
      return {
        module: 'mod_yourmodule',
        status: 'ok',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        module: 'mod_yourmodule',
        status: 'error',
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }
};
```

### Step 3: Add Routes
Create route files in `modules/mod_yourmodule/routes/`:

```javascript
// routes/assets.js
const express = require('express');
const { asyncRoute } = require('../../../module-error-boundary');

const router = express.Router();

router.get('/', asyncRoute(async (req, res) => {
  // Implementation
}));

module.exports = router;
```

Then import in `index.js`:
```javascript
const assetsRouter = require('./routes/assets');
// ...
module.exports = {
  routes: express.Router()
    .use('/assets', assetsRouter)
    // ...
};
```

### Step 4: Add Database Migrations
Create migration files in `modules/mod_yourmodule/migrations/`:

```sql
-- migrations/001-create-schema.sql
CREATE SCHEMA IF NOT EXISTS mod_yourmodule;

CREATE TABLE IF NOT EXISTS mod_yourmodule.yourdata (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Core API Contract (Cross-Module Communication)

**Modules MUST NOT do direct cross-schema table joins.**

All cross-module data access goes through core API endpoints:

```javascript
// Examples:
const userProfile = await coreAPI.getUserProfile(userId);
const allocations = await coreAPI.getUserAllocations(userId);
const sweeps = await coreAPI.getUserSweeps(userId);
const incomeSummary = await coreAPI.getUserIncomeSummary(userId);
const expenseSummary = await coreAPI.getUserExpenseSummary(userId);
const plaidAccounts = await coreAPI.getUserPlaidAccounts(userId);
const subscription = await coreAPI.getUserSubscription(userId);
```

See `core-api-contract.js` for complete API.

---

## Feature Flags & Module Status

### Flag States
- **enabled** — visible to all users at `/app`
- **preview_only** — visible only at `/preview` and to admin accounts
- **disabled** — off for everyone

### Database
```sql
-- Module flag status
SELECT * FROM core.module_flags WHERE module_id = 'mod_yourmodule';

-- Result: { id, module_id, user_id (NULL = global), status, created_at, updated_at }
```

### Testing a Module
1. Set status to `preview_only` (default)
2. Access `/preview` as an admin account
3. Test the module in preview environment
4. Use `/preview/admin/modules` to toggle status or set to `enabled`
5. Once enabled, module appears for all users at `/app`

### Rolling Back
If a module has issues:
```
POST /preview/admin/modules/mod_yourmodule/status
{ "status": "preview_only" }
```

Module immediately disappears from `/app` for all users. No deploy needed.

---

## Error Handling

### Backend Error Boundaries
All module routes are wrapped in `asyncRoute()` which catches errors:

```javascript
const { asyncRoute } = require('../../module-error-boundary');

router.get('/data', asyncRoute(async (req, res) => {
  if (somethingFails) throw new Error('Details');
  // If error thrown, it's caught, logged, and returns:
  // { error: 'Module error', module: 'mod_yourmodule', message: '...' }
}));
```

If a module crashes:
- ✅ Error is logged with module ID
- ✅ Structured error response sent to client
- ✅ Other modules' routes continue working
- ✅ Server doesn't crash

### Frontend Error Boundaries
Each module's UI section is wrapped:

```html
<script>
  const boundary = new ModuleErrorBoundary('mod_yourmodule', '#module-yourmodule-container');
</script>
```

If module UI crashes:
- ✅ Error is caught and logged
- ✅ Error card shown: "This section encountered an issue"
- ✅ Rest of dashboard stays functional
- ✅ User can reload page

---

## Health Checks

### System Health Endpoint
```
GET /api/system/health/modules
```

Returns:
```json
{
  "timestamp": "2026-04-25T17:50:00Z",
  "modules": {
    "mod_brokerage": { "status": "ok", "version": "1.0.0" },
    "mod_compliance": { "status": "ok", "version": "1.0.0" },
    "mod_gamification": { "status": "error", "error": "Schema missing" }
  }
}
```

### Module-Specific Health
```
GET /api/mod_yourmodule/health
```

### Admin Health Dashboard
```
GET /preview/admin/modules/:moduleId/health
```

---

## Bundling Rules (CRITICAL)

### When to Create a NEW Module
A new module is needed when:
1. **Own data domain** — feature owns its tables/schema, not just columns on existing tables
2. **Own failure boundary** — if the feature breaks, it shouldn't crash other features
3. **Standalone/white-label potential** — could theoretically be sold or licensed separately

### When to Bundle with EXISTING Module
- **Soft-Pull Credit Engine** → bundles with `tfr_vault_services` (lending infrastructure)
- **Onboarding** → bundles with `core` (every user touches it)
- **Vault Lock / Discipline** → stays in `mod_brokerage` (asset-specific)
- **Level gates** → `mod_gamification` owns gate logic; other modules check it via core API
- **New allocation categories** → core owns allocation schema; modules reference it

### Example Bundling Decisions

| Feature | Module | Reasoning |
|---------|--------|-----------|
| Soft-pull credit data | `tfr_vault_services` | Part of lending desk, depends on lending schema |
| Level progression UI | `mod_gamification` | Owns all level logic; other modules just check levels |
| New account type | `core` | Used by multiple modules; foundational |
| Brokerage discipline rules | `mod_brokerage` | Asset-specific, only brokerage cares |
| Referral payouts | `mod_affiliate` | Affiliate-specific, owns commission logic |
| Compliance audit log | `mod_compliance` | Compliance-specific, audit-focused |

### New Module Defaults
All new modules default to:
- Status: `preview_only`
- `defaultEnabled: false`
- **Nothing ships live without explicit admin approval.**

---

## Migration Lifecycle

### Phase 1: Build the Module (You Are Here)
1. Create module structure
2. Implement `index.js` with metadata, routes, healthCheck
3. Add routes and migrations
4. Use Core API contract for cross-module data
5. Set status to `preview_only`

### Phase 2: Admin Testing
1. Access `/preview` (admin only)
2. Test module in preview environment
3. Use `/preview/admin/modules` to toggle status
4. Set to `enabled` when confident

### Phase 3: Monitoring
1. Monitor error logs for issues
2. If problems: revert to `preview_only` immediately
3. Fix and re-test
4. Set back to `enabled`

---

## Deployment Checklist

Before setting a module to `enabled`:

- [ ] Module loads without errors (`status: ok` in health check)
- [ ] All routes respond correctly
- [ ] Database migrations run cleanly
- [ ] Core API calls work (if module uses them)
- [ ] Error handling tested (module errors don't crash server)
- [ ] Frontend error boundaries render correctly
- [ ] Tested on mobile and desktop
- [ ] No regressions in other modules
- [ ] Logged via `/preview/admin/modules` toggle

---

## API Reference

### Module Loader
```javascript
const ModuleLoader = require('./module-loader');
const loader = new ModuleLoader(pool, coreAPI);

await loader.discoverModules();     // Find all modules/
await loader.mountModules(app);     // Mount on Express app

const modules = await loader.getEnabledModules(userId);  // User sees these
const allModules = await loader.getAllModules();         // Preview shows these
const module = loader.getModule('mod_brokerage');        // Get specific module
```

### Core API
```javascript
const createCoreAPI = require('./core-api-contract');
const coreAPI = createCoreAPI(pool);

// All available in modules via coreAPI
await coreAPI.getUserProfile(userId);
await coreAPI.getUserAllocations(userId);
await coreAPI.getUserSweeps(userId);
await coreAPI.getUserIncomeSummary(userId);
await coreAPI.getUserExpenseSummary(userId);
await coreAPI.getUserPlaidAccounts(userId);
await coreAPI.getUserSubscription(userId);
await coreAPI.recordModuleEvent(userId, moduleId, eventType, metadata);
```

### Preview Environment
```
GET /preview                              # Preview dashboard (admin only)
GET /preview/admin/modules                # List all modules with status
POST /preview/admin/modules/:id/status    # Update module status
POST /preview/admin/modules/:id/toggle    # Toggle between enabled/preview_only
GET /preview/admin/modules/:id/health     # Get module health
```

### Public Endpoints
```
GET /api/system/modules                   # List all registered modules
GET /api/system/health/modules            # Health check for all modules
GET /api/:module/health                   # Health check for specific module
```

---

## Examples

### Example: New Brokerage Transaction Route

1. Create `modules/mod_brokerage/routes/transactions.js`:
```javascript
const express = require('express');
const { asyncRoute } = require('../../../module-error-boundary');

const router = express.Router();

router.get('/', asyncRoute(async (req, res) => {
  const userId = req.userId;
  const result = await req.pool.query(
    'SELECT * FROM mod_brokerage.transactions WHERE user_id = $1',
    [userId]
  );
  res.json(result.rows);
}));

module.exports = router;
```

2. Update `modules/mod_brokerage/index.js`:
```javascript
const transactionsRouter = require('./routes/transactions');

routes: express.Router()
  .use('/transactions', transactionsRouter)
  // ... other routes
```

3. Access at: `GET /api/mod_brokerage/transactions`

---

## Troubleshooting

### Module Not Showing in Preview
1. Check module status: `SELECT status FROM core.module_flags WHERE module_id = 'mod_xxx'`
2. Verify module directory exists: `ls -la modules/mod_xxx/index.js`
3. Check server logs for load errors

### Module Routes Not Responding
1. Verify module exports `routes` property
2. Check that routes are registered correctly in `index.js`
3. Test with: `curl http://localhost:3000/api/mod_xxx/health`

### Health Check Failing
1. Implement `healthCheck` function in module's `index.js`
2. Test directly: `curl http://localhost:3000/api/mod_xxx/health`
3. Check module dependencies (database schema, etc.)

### Database Migration Errors
1. Check migration file syntax in `modules/mod_xxx/migrations/`
2. Verify schema name matches module (e.g., `mod_xxx.tablename`)
3. Check for FK conflicts with core schema

---

## Questions?

Refer to reference implementations:
- `modules/mod_brokerage/` — full implementation example
- `core-api-contract.js` — core API definitions
- `module-loader.js` — how modules are discovered/mounted
- `preview-environment.js` — admin panel logic
