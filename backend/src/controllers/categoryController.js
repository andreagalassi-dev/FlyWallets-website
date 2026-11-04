const { HttpError } = require("../utils/httpError");

/** GET /api/categories — system categories + the user's custom ones. */
exports.listCategories = async (req, res) => {
  const categories = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `SELECT id, category_name, category_type, description, color_tag, icon_emoji, is_system
         FROM transaction_categories
        WHERE is_active = true AND (is_system = true OR user_id = $1)
        ORDER BY is_system DESC, category_type, category_name`,
      [req.user.id]
    );
    return rows;
  });
  res.json({ status: "success", data: { categories } });
};

/** POST /api/categories */
exports.createCategory = async (req, res) => {
  const { category_name, category_type, color_tag = null, icon_emoji = null } = req.body;
  try {
    const category = await req.withUser(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO transaction_categories (user_id, category_name, category_type, color_tag, icon_emoji, is_system)
         VALUES ($1, $2, $3, $4, $5, false)
         RETURNING id, category_name, category_type, color_tag, icon_emoji, is_system`,
        [req.user.id, category_name, category_type, color_tag, icon_emoji]
      );
      return rows[0];
    });
    res.status(201).json({ status: "success", data: { category } });
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "You already have a category with this name");
    throw err;
  }
};

/** DELETE /api/categories/:id — custom categories only; linked transactions become uncategorized. */
exports.deleteCategory = async (req, res) => {
  const deleted = await req.withUser(async (db) => {
    const { rows } = await db.query(
      "DELETE FROM transaction_categories WHERE id = $1 AND user_id = $2 AND is_system = false RETURNING id",
      [req.params.id, req.user.id]
    );
    return rows[0];
  });
  if (!deleted) {
    // Distinguish "system category" from "not found" for a clearer message
    const sys = await req.withUser((db) =>
      db.query("SELECT 1 FROM transaction_categories WHERE id = $1 AND is_system = true", [req.params.id])
    );
    throw sys.rows[0]
      ? new HttpError(403, "System categories cannot be deleted")
      : new HttpError(404, "Category not found");
  }
  res.json({ status: "success", message: "Category deleted" });
};
