const express = require('express');
const router = express.Router();
const CityRequest = require('../models/CityRequest');
const { requireAdmin } = require('../middleware/auth');
const requireActionPassword = require('../middleware/actionPassword');

router.use(requireAdmin);

// GET /api/admin/requests
router.get('/', async (req, res) => {
  try {
    const { status, type } = req.query;
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const requests = await CityRequest.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/admin/requests/:id — update status
router.patch('/:id', requireActionPassword, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'added', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const request = await CityRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!request) return res.status(404).json({ error: 'Request not found' });

    res.json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/requests/:id
router.delete('/:id', requireActionPassword, async (req, res) => {
  try {
    const request = await CityRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json({ message: 'Request deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
