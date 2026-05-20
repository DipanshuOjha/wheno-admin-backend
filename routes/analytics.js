const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/analytics
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [agg] = await User.aggregate([
      {
        $facet: {
          counts: [
            {
              $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                proUsers: {
                  $sum: {
                    $cond: [{
                      $and: [
                        { $ne: [{ $ifNull: ['$subscription.plan', 'free'] }, 'free'] },
                        { $eq: ['$subscription.status', 'active'] },
                      ]
                    }, 1, 0]
                  }
                },
                freeUsers: {
                  $sum: {
                    $cond: [{ $eq: [{ $ifNull: ['$subscription.plan', 'free'] }, 'free'] }, 1, 0]
                  }
                },
                trialUsers: {
                  // Users currently in post-cancel/post-expiry 7-day grace trial
                  $sum: { $cond: [{ $gt: ['$subscription.trialEnd', now] }, 1, 0] }
                },
                expiredUsers: {
                  $sum: {
                    $cond: [{ $in: ['$subscription.status', ['expired', 'cancelled']] }, 1, 0]
                  }
                },
                newUsersThisWeek: {
                  $sum: { $cond: [{ $gte: ['$createdAt', startOfWeek] }, 1, 0] }
                },
                newUsersThisMonth: {
                  $sum: { $cond: [{ $gte: ['$createdAt', startOfMonth] }, 1, 0] }
                },
                totalRevenuePaise: { $sum: { $sum: '$payments.amountPaise' } },
              }
            }
          ],
          planBreakdown: [
            {
              $group: {
                _id: { $ifNull: ['$subscription.plan', 'free'] },
                count: { $sum: 1 },
              }
            }
          ],
          recentPayments: [
            { $unwind: { path: '$payments', preserveNullAndEmptyArrays: false } },
            { $sort: { 'payments.paidAt': -1 } },
            { $limit: 10 },
            {
              $project: {
                _id: 0,
                name: 1,
                email: 1,
                amount: '$payments.amountPaise',
                plan: '$payments.plan',
                paidAt: '$payments.paidAt',
              }
            }
          ],
          uniquePayingUsers: [
            { $match: { payments: { $elemMatch: { amountPaise: { $gt: 0 } } } } },
            { $count: 'count' }
          ],
        }
      }
    ]);

    const counts = agg.counts[0] || {};
    const totalUsers        = counts.totalUsers        || 0;
    const proUsers          = counts.proUsers          || 0;
    const freeUsers         = counts.freeUsers         || 0;
    const trialUsers        = counts.trialUsers        || 0;
    const expiredUsers      = counts.expiredUsers      || 0;
    const newUsersThisWeek  = counts.newUsersThisWeek  || 0;
    const newUsersThisMonth = counts.newUsersThisMonth || 0;
    const totalRevenuePaise = counts.totalRevenuePaise || 0;

    const planBreakdown = {};
    for (const { _id, count } of agg.planBreakdown) {
      planBreakdown[_id] = count;
    }

    const recentPayments    = agg.recentPayments;
    const uniquePayingUsers = agg.uniquePayingUsers[0]?.count || 0;

    // % of active (non-expired) users who are on a paid plan
    const activeUsers = proUsers + freeUsers;
    const trialConversionRate = activeUsers > 0
      ? parseFloat(((proUsers / activeUsers) * 100).toFixed(2))
      : 0;

    res.json({
      totalUsers,
      proUsers,
      freeUsers,
      trialUsers,
      expiredUsers,
      uniquePayingUsers,
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

// GET /api/admin/analytics/data-range — min/max years of panchanga data in DB
router.get('/data-range', async (req, res) => {
  try {
    const PanchangaDay = require('../models/PanchangaDay');
    const [first, last] = await Promise.all([
      PanchangaDay.findOne({}).sort({ date: 1 }).select('date').lean(),
      PanchangaDay.findOne({}).sort({ date: -1 }).select('date').lean(),
    ]);
    const now = new Date().getFullYear();
    const minYear = first ? parseInt(first.date.slice(0, 4)) : now;
    const maxYear = last  ? parseInt(last.date.slice(0, 4))  : now;
    res.json({ minYear, maxYear });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
