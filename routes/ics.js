const express = require('express');
const multer = require('multer');
const router = express.Router();
const PanchangaDay = require('../models/PanchangaDay');
const { requireAdmin } = require('../middleware/auth');
const requireActionPassword = require('../middleware/actionPassword');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAdmin);

// ── ICS Parser ────────────────────────────────────────────────────────────────

const TITHIS = [
  'Pratipada','Dwitiya','Tritiya','Chaturthi','Panchami','Shashthi','Saptami',
  'Ashtami','Navami','Dashami','Ekadashi','Dwadashi','Trayodashi','Chaturdashi',
  'Purnima','Amavasya',
];
const NAKSHATRAS = [
  'Ashvini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya',
  'Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati',
  'Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana',
  'Dhanishtha','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati',
];
const YOGAS = [
  'Vishkambha','Priti','Ayushman','Saubhagya','Shobhana','Atiganda','Sukarma',
  'Dhriti','Shula','Ganda','Vriddhi','Dhruva','Vyaghata','Harshana','Vajra',
  'Siddhi','Vyatipata','Variyan','Parigha','Shiva','Siddha','Sadhya','Shubha',
  'Shukla','Brahma','Mahendra','Vaidhriti',
];
const KARANAS = [
  'Bava','Balava','Kaulava','Taitila','Garija','Vanija','Vishti','Shakuni',
  'Chatushpada','Nagava','Kimstughna',
];

function parseICSDate(dtstart) {
  // Handles: 20260101 or 20260101T053000Z or VALUE=DATE:20260101
  const clean = dtstart.replace(/.*:/, '').trim().replace(/T.*/, '');
  if (clean.length >= 8) {
    return `${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`;
  }
  return null;
}

function getField(block, name) {
  const m = block.match(new RegExp(`(?:^|\\r?\\n)${name}(?:;[^:]*)?:([^\\r\\n]+)`, 'i'));
  return m ? m[1].trim() : '';
}

function unfoldLines(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function decodeValue(val) {
  return val.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function matchesAny(text, list) {
  const lower = text.toLowerCase();
  return list.find(item => lower.includes(item.toLowerCase())) || null;
}

function extractTimeRange(text) {
  const m = text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*(?:to|-)\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  return m ? `${m[1]} - ${m[2]}` : text.replace(/^[^:]+:\s*/,'');
}

function categoriseEvent(day, summary, description) {
  const combined = `${summary} ${description}`;

  // Tithi
  const tithi = matchesAny(combined, TITHIS);
  if (tithi && !day.tithi) {
    day.tithi = tithi;
    if (/krishna|dark|K\d/i.test(combined)) day.paksha = 'Krishna';
    else if (/shukla|bright|S\d/i.test(combined)) day.paksha = 'Shukla';
  }

  // Nakshatra
  const nak = matchesAny(combined, NAKSHATRAS);
  if (nak && !day.nakshatra) day.nakshatra = nak;

  // Yoga
  const yoga = matchesAny(combined, YOGAS);
  if (yoga && !day.yoga) day.yoga = yoga;

  // Karana
  const karana = matchesAny(combined, KARANAS);
  if (karana && !day.karanas.includes(karana)) day.karanas.push(karana);

  // Times
  if (/sunrise/i.test(combined) && !day.sunrise) day.sunrise = extractTimeRange(summary);
  if (/sunset/i.test(combined) && !day.sunset) day.sunset = extractTimeRange(summary);
  if (/moonrise/i.test(combined) && !day.moonrise) day.moonrise = extractTimeRange(summary);
  if (/moonset/i.test(combined) && !day.moonset) day.moonset = extractTimeRange(summary);
  if (/rahu kalam|rahukalam/i.test(combined) && !day.rahuKalam) day.rahuKalam = extractTimeRange(summary);
  if (/gulikai|gulik/i.test(combined) && !day.gulikaiKalam) day.gulikaiKalam = extractTimeRange(summary);
  if (/yamaganda/i.test(combined) && !day.yamaganda) day.yamaganda = extractTimeRange(summary);
  if (/abhijit/i.test(combined) && !day.abhijit) day.abhijit = extractTimeRange(summary);
  if (/dur muhurta|durmuhurta/i.test(combined)) day.durMuhurtam.push(extractTimeRange(summary));
  if (/amrit kalam|amritkalam/i.test(combined)) day.amritKalam = extractTimeRange(summary);
  if (/varjyam/i.test(combined)) day.varjyam.push(extractTimeRange(summary));

  // Hindu month
  const months = ['Chaitra','Vaishakha','Jyeshtha','Ashadha','Shravana','Bhadrapada',
                   'Ashwina','Kartika','Margashirsha','Pausha','Magha','Phalguna'];
  const month = matchesAny(combined, months);
  if (month && !day.hinduMonth) day.hinduMonth = month;

  // VS / Saka year
  const vsMatch = combined.match(/vikram\s*samvat\s*(\d{4})/i) || combined.match(/VS\s*(\d{4})/);
  if (vsMatch && !day.vikramSamvat) day.vikramSamvat = vsMatch[1];
  const sakaMatch = combined.match(/saka\s*samvat\s*(\d{4})/i);
  if (sakaMatch && !day.shakaSamvat) day.shakaSamvat = sakaMatch[1];

  // Festival — anything that's not a time-slot event and didn't match above panchanga fields
  const isPanchangaField = tithi || nak || yoga || karana ||
    /sunrise|sunset|moonrise|moonset|rahu|gulikai|yamaganda|abhijit|dur muhurta|amrit|varjyam/i.test(combined);
  if (!isPanchangaField && summary && !day.festivals.includes(summary)) {
    day.festivals.push(decodeValue(summary));
  }
}

function parseICS(text, city) {
  const unfolded = unfoldLines(text);
  const veventRe = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/gi;
  const dayMap = {};
  let match;

  while ((match = veventRe.exec(unfolded)) !== null) {
    const block = match[1];
    const dtstart = getField(block, 'DTSTART');
    const dateStr = parseICSDate(dtstart);
    if (!dateStr) continue;

    const summary = decodeValue(getField(block, 'SUMMARY'));
    const description = decodeValue(getField(block, 'DESCRIPTION'));

    if (!dayMap[dateStr]) {
      dayMap[dateStr] = {
        date: dateStr, city,
        hinduMonth: '', paksha: '', vikramSamvat: '', shakaSamvat: '',
        amantaMonth: '', purnimantaMonth: '', weekday: '',
        tithi: '', nakshatra: '', yoga: '',
        karanas: [], durMuhurtam: [], varjyam: [], festivals: [],
        sunrise: '', sunset: '', moonrise: '', moonset: '',
        rahuKalam: '', gulikaiKalam: '', yamaganda: '', abhijit: '',
        amritKalam: '', sunsign: '', moonsign: '',
      };
    }

    categoriseEvent(dayMap[dateStr], summary, description);
  }

  return Object.values(dayMap);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/admin/ics/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await PanchangaDay.aggregate([
      { $group: { _id: '$city', count: { $sum: 1 }, minDate: { $min: '$date' }, maxDate: { $max: '$date' } } },
      { $sort: { _id: 1 } },
    ]);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/ics/upload — upload one or more .ics files, parse & upsert
// Requires action password + city query param
router.post('/upload', requireActionPassword, upload.array('files', 20), async (req, res) => {
  const city = (req.query.city || req.body.city || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!city) return res.status(400).json({ error: 'city query param is required' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  let allDays = [];
  const parseErrors = [];

  for (const file of req.files) {
    try {
      const text = file.buffer.toString('utf8');
      const days = parseICS(text, city);
      allDays = allDays.concat(days);
    } catch (e) {
      parseErrors.push({ file: file.originalname, reason: e.message });
    }
  }

  if (allDays.length === 0) {
    return res.status(400).json({ error: 'No valid panchanga days found in uploaded files.', parseErrors });
  }

  // Upsert
  const ops = allDays.map(day => ({
    updateOne: {
      filter: { date: day.date, city: day.city },
      update: { $set: day },
      upsert: true,
    },
  }));

  try {
    const result = await PanchangaDay.bulkWrite(ops, { ordered: false });
    res.json({
      inserted: result.upsertedCount,
      updated: result.modifiedCount,
      total: allDays.length,
      parseErrors,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/ics/import — upsert raw JSON array (legacy)
router.post('/import', requireActionPassword, async (req, res) => {
  try {
    const { days } = req.body;
    if (!Array.isArray(days) || days.length === 0)
      return res.status(400).json({ error: 'days must be a non-empty array' });

    const ops = days
      .filter(d => d.date && d.city)
      .map(day => ({ updateOne: { filter: { date: day.date, city: day.city }, update: { $set: day }, upsert: true } }));

    const result = await PanchangaDay.bulkWrite(ops, { ordered: false });
    res.json({ inserted: result.upsertedCount, updated: result.modifiedCount, errors: [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/ics/city/:city
router.delete('/city/:city', requireActionPassword, async (req, res) => {
  try {
    const result = await PanchangaDay.deleteMany({ city: req.params.city });
    res.json({ message: `Deleted ${result.deletedCount} records for city: ${req.params.city}` });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
