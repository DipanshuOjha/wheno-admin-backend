const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');

// All routes require admin auth
router.use(requireAdmin);

// GET /api/admin/users — list with pagination, search, plan filter
router.get('/', async (req, res) => {
  try {
    const { search = '', plan = '', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (plan) {
      query['subscription.plan'] = plan;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email avatar subscription createdAt lastLogin payments')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query),
    ]);

    const formatted = users.map((u) => {
      const totalPaid = (u.payments || []).reduce((sum, p) => sum + (p.amountPaise || 0), 0);
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        plan: u.subscription?.plan || 'free',
        status: u.subscription?.status || 'active',
        currentPeriodEnd: u.subscription?.currentPeriodEnd,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
        paymentsCount: (u.payments || []).length,
        totalPaid,
      };
    });

    res.json({
      users: formatted,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users/:id — full user detail
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -otp -otpExpiry -calendarRefreshToken')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users/:id/subscription — grant/extend subscription
router.post('/:id/subscription', async (req, res) => {
  try {
    const { plan, years, note } = req.body;

    if (!plan || !years) {
      return res.status(400).json({ error: 'plan and years are required' });
    }
    if (!['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'plan must be monthly or yearly' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Calculate period end: extend from existing active end or from now
    const now = new Date();
    let baseDate = now;
    if (
      user.subscription?.status === 'active' &&
      user.subscription?.currentPeriodEnd &&
      user.subscription.currentPeriodEnd > now
    ) {
      baseDate = new Date(user.subscription.currentPeriodEnd);
    }

    const yearsNum = parseInt(years);
    const periodEnd = new Date(baseDate);
    if (plan === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + yearsNum);
    } else {
      // monthly: years param treated as months
      periodEnd.setMonth(periodEnd.getMonth() + yearsNum);
    }

    const amountPaise = 0; // admin granted — no charge
    const paymentId = `admin-manual-${Date.now()}`;

    user.subscription.plan = plan;
    user.subscription.status = 'active';
    user.subscription.currentPeriodEnd = periodEnd;
    if (!user.subscription.startedAt) {
      user.subscription.startedAt = now;
    }
    if (plan === 'yearly') {
      user.subscription.vsYear = (user.subscription.vsYear || 0) + yearsNum;
    }

    user.payments.push({
      paymentId,
      orderId: null,
      plan,
      years: yearsNum,
      amountPaise,
      currency: 'INR',
      periodEnd,
      paidAt: now,
    });

    await user.save();

    res.json({
      message: 'Subscription granted successfully',
      subscription: user.subscription,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id/subscription — cancel subscription
router.delete('/:id/subscription', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.subscription.status = 'cancelled';
    await user.save();

    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
