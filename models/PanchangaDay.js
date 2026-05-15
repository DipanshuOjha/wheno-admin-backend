const mongoose = require('mongoose');

const PanchangaDaySchema = new mongoose.Schema({
  date:             { type: String, required: true, index: true },
  city:             { type: String, required: true, index: true },
  hinduMonth:       String,
  paksha:           String,
  vikramSamvat:     String,
  shakaSamvat:      String,
  amantaMonth:      String,
  purnimantaMonth:  String,
  weekday:          String,
  tithi:            String,
  nakshatra:        String,
  yoga:             String,
  karanas:          [String],
  sunsign:          String,
  moonsign:         String,
  sunrise:          String,
  sunset:           String,
  moonrise:         String,
  moonset:          String,
  rahuKalam:        String,
  gulikaiKalam:     String,
  yamaganda:        String,
  abhijit:          String,
  durMuhurtam:      [String],
  amritKalam:       String,
  varjyam:          [String],
  festivals:        [String],
});

PanchangaDaySchema.index({ date: 1, city: 1 }, { unique: true });

module.exports = mongoose.model('PanchangaDay', PanchangaDaySchema);
