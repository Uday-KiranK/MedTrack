const { hasPermission } = require("../utils/permissions");

const authorizeRole = (...roles) => {
  const allowed = roles.flat();
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ message: "Access forbidden for your role" });
    }
    next();
  };
};

const authorizePermission = (...requiredPermissions) => {
  const perms = requiredPermissions.flat();
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const ok = perms.some((p) => hasPermission(req.user, p));
    if (!ok) {
      return res.status(403).json({
        message: "Access forbidden: missing required feature permission",
        requiredPermissions: perms
      });
    }
    next();
  };
};

authorizeRole.authorizeRole = authorizeRole;
authorizeRole.authorizePermission = authorizePermission;

module.exports = authorizeRole;
