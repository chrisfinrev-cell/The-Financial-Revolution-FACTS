/**
 * Core API Contract
 *
 * These endpoints define the core FACTS data that modules MUST use.
 * Modules should NOT perform direct cross-schema table joins.
 * All cross-module data access goes through these endpoints.
 *
 * Every module receives the pool and can register routes via this contract.
 */

module.exports = function createCoreAPI(pool) {
  return {
    /**
     * GET /api/core/user/:id/profile
     * Returns user profile, subscription tier, level
     */
    async getUserProfile(userId) {
      const result = await pool.query(
        `SELECT
          id, email, first_name, last_name, subscription_tier,
          current_level, is_creator, created_at, updated_at
        FROM users WHERE id = $1`,
        [userId]
      );
      return result.rows[0] || null;
    },

    /**
     * GET /api/core/user/:id/allocations
     * Returns current allocation percentages and actual values
     */
    async getUserAllocations(userId) {
      const result = await pool.query(
        `SELECT
          ua.id, ua.user_id, ua.category_id, ua.percentage,
          c.name as category_name, c.color, c.icon
        FROM user_allocations ua
        JOIN categories c ON ua.category_id = c.id
        WHERE ua.user_id = $1
        ORDER BY c.sort_order`,
        [userId]
      );
      return result.rows;
    },

    /**
     * GET /api/core/user/:id/sweeps
     * Returns Friday Sweep history and streak data
     */
    async getUserSweeps(userId) {
      const result = await pool.query(
        `SELECT
          id, user_id, sweep_date, total_amount,
          categories_covered, streak_count, created_at
        FROM friday_sweeps
        WHERE user_id = $1
        ORDER BY sweep_date DESC`,
        [userId]
      );
      return result.rows;
    },

    /**
     * GET /api/core/user/:id/income-summary
     * Returns income totals by category
     */
    async getUserIncomeSummary(userId) {
      const result = await pool.query(
        `SELECT
          category_id,
          SUM(amount) as total,
          COUNT(*) as transaction_count,
          c.name as category_name
        FROM income_transactions it
        JOIN categories c ON it.category_id = c.id
        WHERE it.user_id = $1
        GROUP BY category_id, c.name
        ORDER BY total DESC`,
        [userId]
      );
      return result.rows;
    },

    /**
     * GET /api/core/user/:id/expense-summary
     * Returns expense totals by category
     */
    async getUserExpenseSummary(userId) {
      const result = await pool.query(
        `SELECT
          category_id,
          SUM(amount) as total,
          COUNT(*) as transaction_count,
          c.name as category_name
        FROM expense_transactions et
        JOIN categories c ON et.category_id = c.id
        WHERE et.user_id = $1
        GROUP BY category_id, c.name
        ORDER BY total DESC`,
        [userId]
      );
      return result.rows;
    },

    /**
     * GET /api/core/user/:id/plaid-accounts
     * Returns connected Plaid accounts
     */
    async getUserPlaidAccounts(userId) {
      const result = await pool.query(
        `SELECT
          id, user_id, account_id, account_name,
          account_type, mask, institution_id, is_active
        FROM plaid_accounts
        WHERE user_id = $1 AND is_active = true`,
        [userId]
      );
      return result.rows;
    },

    /**
     * GET /api/core/user/:id/subscription
     * Returns Stripe subscription status and tier
     */
    async getUserSubscription(userId) {
      const result = await pool.query(
        `SELECT
          id, user_id, stripe_customer_id, stripe_subscription_id,
          plan, status, current_period_start, current_period_end,
          paid_until, trial_expires_at, created_at
        FROM stripe_subscriptions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
        [userId]
      );
      return result.rows[0] || null;
    },

    /**
     * Module Helper: Record an event for a user
     * Used for analytics and audit trails
     */
    async recordModuleEvent(userId, moduleId, eventType, metadata = {}) {
      const result = await pool.query(
        `INSERT INTO module_events (user_id, module_id, event_type, metadata, occurred_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *`,
        [userId, moduleId, eventType, JSON.stringify(metadata)]
      );
      return result.rows[0];
    }
  };
};
