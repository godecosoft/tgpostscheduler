function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Yetkisiz' });
  }
  return res.redirect('/login.html');
}

module.exports = { requireAuth };
