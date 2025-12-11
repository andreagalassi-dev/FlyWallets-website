const jwt = require("jsonwebtoken");

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token)
    return res
      .status(401)
      .json({ status: "error", message: "Access Token Required" });

  jwt.verify(
    token,
    process.env.JWT_SECRET || "fallback_secret_do_not_use_prod",
    (err, user) => {
      if (err)
        return res
          .status(403)
          .json({ status: "error", message: "Invalid or Expired Token" });
      req.user = user;
      next();
    }
  );
};
