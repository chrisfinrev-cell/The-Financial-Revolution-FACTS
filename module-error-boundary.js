/**
 * Module Error Boundary
 *
 * Wraps module routes to catch errors without crashing the server.
 * If a module throws, returns structured error response and logs it.
 * Other modules' routes continue working.
 */

function createModuleErrorBoundary(moduleId) {
  return (fn) => {
    return async (req, res, next) => {
      try {
        await fn(req, res, next);
      } catch (err) {
        console.error(`[Module Error] ${moduleId}:`, err);

        // If response already started, pass to default error handler
        if (res.headersSent) {
          return next(err);
        }

        // Return structured error
        res.status(err.status || 500).json({
          error: 'Module error',
          module: moduleId,
          message: err.message,
          requestId: req.id || 'unknown'
        });
      }
    };
  };
}

/**
 * Global module error handler
 * Should be registered last in the middleware chain
 */
function moduleErrorHandler(err, req, res, next) {
  console.error('[Global Module Error]', err);

  res.status(err.status || 500).json({
    error: 'Server error',
    message: process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : err.message,
    requestId: req.id || 'unknown'
  });
}

/**
 * Create async route wrapper for Express routes
 * Usage: router.get('/path', asyncRoute(async (req, res) => { ... }))
 */
const asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  createModuleErrorBoundary,
  moduleErrorHandler,
  asyncRoute
};
