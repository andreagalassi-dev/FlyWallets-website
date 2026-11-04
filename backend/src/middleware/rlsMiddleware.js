const { withUserContext } = require("../config/db");

/**
 * Must run after authenticateToken. Exposes `req.withUser(fn)`: runs `fn(client)` inside a DB
 * transaction scoped to the authenticated user (SET LOCAL app.current_user_id), so PostgreSQL
 * Row-Level Security applies on top of the `WHERE user_id = $1` filters used in the controllers.
 */
exports.rlsContext = (req, res, next) => {
  req.withUser = (fn) => withUserContext(req.user.id, fn);
  next();
};
