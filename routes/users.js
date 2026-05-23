const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');
const requireActionPassword = require('../middleware/actionPassword');

// All routes require admin auth
router.use(requireAdmin);

// GET /api/admin/users — list with pagination, search, plan filter
router.get('/', async (req, res) => {
  try {
    const { search = '', plan = '', status = '', joinedFrom = '', joinedTo = '', page = 1, limit = 20 } = req.query;
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
    if (status === 'cancelled') {
      query['subscription.status'] = { $in: ['cancelled', 'expired'] };
    } else if (status === 'active') {
      query['subscription.status'] = 'active';
    }
    if (joinedFrom || joinedTo) {
      query.createdAt = {};
      if (joinedFrom) query.createdAt.$gte = new Date(joinedFrom);
      if (joinedTo) {
        const end = new Date(joinedTo);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
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
router.post('/:id/subscription', requireActionPassword, async (req, res) => {
  try {
    const { plan, years, note, amountPaise } = req.body;

    if (!plan || !years) {
      return res.status(400).json({ error: 'plan and years are required' });
    }
    if (plan !== 'yearly') {
      return res.status(400).json({ error: 'plan must be yearly' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();

    // Always grant from today — admin explicitly sets the duration they want
    const yearsNum = parseInt(years);
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + yearsNum);

    const recordedAmount = typeof amountPaise === 'number' && amountPaise > 0 ? amountPaise : 0;
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
      amountPaise: recordedAmount,
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
router.delete('/:id/subscription', requireActionPassword, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.subscription.status = 'cancelled';
    // Expire the period immediately so a subsequent grant always starts fresh from today,
    // preventing accidental stacking if cancel + re-grant are done in quick succession.
    user.subscription.currentPeriodEnd = new Date();
    user.subscription.trialEnd = null;
    await user.save();

    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users/:id/subscription/repair — fix corrupted period end dates
router.post('/:id/subscription/repair', requireActionPassword, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const PanchangaDay = require('../models/PanchangaDay');
    const now = new Date();

    const lastDay = await PanchangaDay.findOne({}).sort({ date: -1 }).select('date').lean();
    const maxDataYear = lastDay ? parseInt(lastDay.date.slice(0, 4)) : now.getFullYear() + 5;
    const maxPeriodEnd = new Date(maxDataYear, 11, 31);

    const storedEnd = user.subscription?.currentPeriodEnd
      ? new Date(user.subscription.currentPeriodEnd)
      : null;

    let repaired = false;
    if (storedEnd && storedEnd > maxPeriodEnd) {
      user.subscription.currentPeriodEnd = maxPeriodEnd;
      repaired = true;
    }

    if (repaired) await user.save();

    res.json({
      repaired,
      maxDataYear,
      subscription: user.subscription,
      message: repaired
        ? `Period end capped to ${maxPeriodEnd.toISOString().slice(0, 10)}`
        : 'No repair needed — period end is already within range',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
