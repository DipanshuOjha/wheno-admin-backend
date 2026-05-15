const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/analytics
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const allUsers = await User.find({})
      .select('name email createdAt subscription payments')
      .lean();

    const totalUsers = allUsers.length;

    let proUsers = 0;
    let freeUsers = 0;
    let expiredUsers = 0;
    let trialUsers = 0;
    let totalRevenuePaise = 0;
    let newUsersThisWeek = 0;
    let newUsersThisMonth = 0;

    const planBreakdown = { free: 0, yearly: 0, monthly: 0 };
    const allPayments = [];

    for (const user of allUsers) {
      const plan = user.subscription?.plan || 'free';
      const status = user.subscription?.status || 'active';
      const createdAt = new Date(user.createdAt);

      if (createdAt >= startOfWeek) newUsersThisWeek++;
      if (createdAt >= startOfMonth) newUsersThisMonth++;

      planBreakdown[plan] = (planBreakdown[plan] || 0) + 1;

      if (plan !== 'free' && status === 'active') {
        proUsers++;
      } else if (plan === 'free') {
        freeUsers++;
        if (createdAt >= sevenDaysAgo) trialUsers++;
      } else if (status === 'expired' || status === 'cancelled') {
        expiredUsers++;
      }

      for (const p of user.payments || []) {
        totalRevenuePaise += p.amountPaise || 0;
        allPayments.push({
          name: user.name,
          email: user.email,
          amount: p.amountPaise || 0,
          plan: p.plan,
          paidAt: p.paidAt,
        });
      }
    }

    // Recent 10 payments sorted by paidAt desc
    allPayments.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
    const recentPayments = allPayments.slice(0, 10);

    // Trial conversion rate: proUsers / (proUsers + freeUsers past 7 days) * 100
    const freeNonTrial = freeUsers - trialUsers;
    const denominator = proUsers + freeNonTrial;
    const trialConversionRate = denominator > 0
      ? parseFloat(((proUsers / denominator) * 100).toFixed(2))
      : 0;

    res.json({
      totalUsers,
      proUsers,
      freeUsers,
      trialUsers,
      expiredUsers,
      totalRevenuePaise,
      newUsersThisWeek,
      newUsersThisMonth,
      planBreakdown,
      recentPayments,
      trialConversionRate,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
