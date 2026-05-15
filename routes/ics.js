const express = require('express');
const router = express.Router();
const PanchangaDay = require('../models/PanchangaDay');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/ics/stats — count per city with date range
router.get('/stats', async (req, res) => {
  try {
    const stats = await PanchangaDay.aggregate([
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 },
          minDate: { $min: '$date' },
          maxDate: { $max: '$date' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/ics/import — upsert array of panchanga day objects
router.post('/import', async (req, res) => {
  try {
    const { days } = req.body;
    if (!Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'days must be a non-empty array' });
    }

    let inserted = 0;
    let updated = 0;
    const errors = [];

    for (const day of days) {
      if (!day.date || !day.city) {
        errors.push({ day, reason: 'Missing date or city' });
        continue;
      }
      try {
        const result = await PanchangaDay.findOneAndUpdate(
          { date: day.date, city: day.city },
          { $set: day },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        // Mongoose doesn't cleanly differentiate upsert insert vs update in findOneAndUpdate
        // We use the _id presence from the result's __v / isNew simulation
        // Instead track via replaceOne with upserted count
        inserted++; // We'll recalculate below
      } catch (e) {
        errors.push({ day, reason: e.message });
      }
    }

    // More accurate: use bulkWrite
    // Redo with bulkWrite for accuracy
    const ops = [];
    const validDays = days.filter((d) => d.date && d.city);
    for (const day of validDays) {
      ops.push({
        updateOne: {
          filter: { date: day.date, city: day.city },
          update: { $set: day },
          upsert: true,
        },
      });
    }

    let bulkResult = { upsertedCount: 0, modifiedCount: 0 };
    if (ops.length > 0) {
      bulkResult = await PanchangaDay.bulkWrite(ops, { ordered: false });
    }

    res.json({
      inserted: bulkResult.upsertedCount,
      updated: bulkResult.modifiedCount,
      errors,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/ics/city/:city — delete all docs for a city
router.delete('/city/:city', async (req, res) => {
  try {
    const city = req.params.city;
    const result = await PanchangaDay.deleteMany({ city });
    res.json({ message: `Deleted ${result.deletedCount} records for city: ${city}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
