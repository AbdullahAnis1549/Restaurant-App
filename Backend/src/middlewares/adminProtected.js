export const adminProtected = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized: User not authenticated.',
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied: Admin authorization required to perform this action.',
    });
  }

  if (process.env.REQUIRE_ADMIN_MFA === 'true' && !req.user.mfaEnabled) return res.status(403).json({ code: 'MFA_SETUP_REQUIRED', message: 'Set up authenticator two-step login in Account security before using admin features.' });
  next();
};
