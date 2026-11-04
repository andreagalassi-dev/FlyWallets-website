const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/env");

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const tokenFromHeader = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN
  const token = tokenFromHeader || req.cookies?.access_token;

  if (!token) {
    return res
      .status(401)
      .json({ status: "error", message: "Access Token Required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // 401 (not 403) so the frontend interceptor attempts a silent refresh on expiry
      return res
        .status(401)
        .json({ status: "error", message: "Invalid or Expired Token" });
    }
    req.user = user;
    next();
  });
};
