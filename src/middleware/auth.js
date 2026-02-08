const jwt = require("jsonwebtoken");

function auth(requiredRoles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) return res.status(401).json({ error: "missing_token" });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload; // { sub, username, role }
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }

    if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }

    next();
  };
}

module.exports = { auth };