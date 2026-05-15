const mongoose = require('mongoose');

const cityRequestSchema = new mongoose.Schema({
  type:          { type: String, enum: ['city', 'country'], required: true },
  requestedName: { type: String, required: true, trim: true },
  userName:      { type: String, trim: true },
  userEmail:     { type: String, trim: true },
  status:        { type: String, enum: ['pending', 'added', 'rejected'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('CityRequest', cityRequestSchema);
