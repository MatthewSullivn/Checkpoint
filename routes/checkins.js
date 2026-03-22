var express = require('express');
var { getDb, persist } = require('../db');
var router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'not logged in' });
  next();
}

function toObjects(result) {
  if (!result.length || !result[0].values.length) return [];
  var cols = result[0].columns;
  return result[0].values.map(function(row) {
    var obj = {};
    cols.forEach(function(c, i) { obj[c] = row[i]; });
    return obj;
  });
}

// get all check-ins
router.get('/', requireAuth, async function(req, res) {
  var db = await getDb();
  var result = db.exec('SELECT * FROM checkins WHERE user_id = ? ORDER BY date DESC', [req.session.userId]);
  res.json(toObjects(result));
});

// log a check-in
router.post('/', requireAuth, async function(req, res) {
  var { date, sleep, stress, exercise } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });

  var db = await getDb();
  var existing = db.exec('SELECT id FROM checkins WHERE user_id = ? AND date = ?',
    [req.session.userId, date]);
  var rows = toObjects(existing);

  if (rows.length) {
    db.run('UPDATE checkins SET sleep = ?, stress = ?, exercise = ? WHERE id = ?',
      [sleep || 3, stress || 3, exercise ? 1 : 0, rows[0].id]);
  } else {
    db.run('INSERT INTO checkins (user_id, date, sleep, stress, exercise) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, date, sleep || 3, stress || 3, exercise ? 1 : 0]);
  }

  persist();
  res.json({ ok: true });
});

module.exports = router;
