const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/** Roles available in the system. Default for new users is 'user'. */
const ROLES = Object.freeze({
  USER: 'user',
  ARTIST: 'artist',
  COMPOSER: 'composer',
  MANAGER: 'manager',
  ADMIN: 'admin',
});

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware factory that requires the authenticated user to have at least one
 * of the specified roles. Must be used after `requireAuth`.
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRole = req.user.role || ROLES.USER;
    if (!roles.includes(userRole) && userRole !== ROLES.ADMIN) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return next();
  };
}

module.exports = { signToken, verifyToken, requireAuth, requireRole, ROLES };
