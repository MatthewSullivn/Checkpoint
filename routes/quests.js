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

// get completed quests
router.get('/completed', requireAuth, async function(req, res) {
  var db = await getDb();
  var result = db.exec('SELECT * FROM completed_quests WHERE user_id = ?', [req.session.userId]);
  res.json(toObjects(result));
});

// mark quest done
router.post('/complete', requireAuth, async function(req, res) {
  var { quest_id } = req.body;
  if (!quest_id) return res.status(400).json({ error: 'quest_id required' });

  var db = await getDb();
  var existing = db.exec('SELECT id FROM completed_quests WHERE user_id = ? AND quest_id = ?',
    [req.session.userId, quest_id]);

  if (!toObjects(existing).length) {
    db.run('INSERT INTO completed_quests (user_id, quest_id) VALUES (?, ?)',
      [req.session.userId, quest_id]);
    persist();
  }

  res.json({ ok: true });
});

// uncomplete quest
router.post('/uncomplete', requireAuth, async function(req, res) {
  var { quest_id } = req.body;
  var db = await getDb();
  db.run('DELETE FROM completed_quests WHERE user_id = ? AND quest_id = ?',
    [req.session.userId, quest_id]);
  persist();
  res.json({ ok: true });
});

// get achievements
router.get('/achievements', requireAuth, async function(req, res) {
  var db = await getDb();
  var result = db.exec('SELECT achievement_id FROM achievements WHERE user_id = ?', [req.session.userId]);
  var rows = toObjects(result);
  res.json(rows.map(function(a) { return a.achievement_id; }));
});

// unlock achievement
router.post('/achievements', requireAuth, async function(req, res) {
  var { achievement_id } = req.body;
  if (!achievement_id) return res.status(400).json({ error: 'achievement_id required' });

  var db = await getDb();
  try {
    db.run('INSERT OR IGNORE INTO achievements (user_id, achievement_id) VALUES (?, ?)',
      [req.session.userId, achievement_id]);
    persist();
  } catch(e) {
    // already exists
  }

  res.json({ ok: true });
});

module.exports = router;
