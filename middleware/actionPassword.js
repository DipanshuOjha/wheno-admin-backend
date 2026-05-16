module.exports = function requireActionPassword(req, res, next) {
  const provided = req.headers['x-action-password'];
  const expected = process.env.ADMIN_ACTION_PASSWORD;
  if (!expected) return res.status(500).json({ error: 'ADMIN_ACTION_PASSWORD not configured on server.' });
  if (!provided || provided !== expected) {
    return res.status(403).json({ error: 'Invalid action password.', code: 'BAD_ACTION_PASSWORD' });
  }
  next();
};
