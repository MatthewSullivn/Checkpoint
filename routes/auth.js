var express = require('express');
var bcrypt = require('bcryptjs');
var { getDb, persist } = require('../db');
var router = express.Router();

// sign up
router.post('/signup', async function(req, res) {
  var { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'all fields required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  var db = await getDb();

  // check if user exists
  var existing = db.exec('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return res.status(400).json({ error: 'email or username already taken' });
  }

  var hash = bcrypt.hashSync(password, 10);
  db.run('INSERT INTO users (email, username, password) VALUES (?, ?, ?)', [email, username, hash]);
  persist();

  // get the new user id
  var result = db.exec('SELECT last_insert_rowid() as id');
  var userId = result[0].values[0][0];

  req.session.userId = userId;
  req.session.username = username;

  res.json({ ok: true, username: username });
});

// login
router.post('/login', async function(req, res) {
  var { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }

  var db = await getDb();
  var result = db.exec('SELECT * FROM users WHERE email = ?', [email]);

  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  var cols = result[0].columns;
  var row = result[0].values[0];
  var user = {};
  cols.forEach(function(c, i) { user[c] = row[i]; });

  var match = bcrypt.compareSync(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  res.json({ ok: true, username: user.username });
});

// logout
router.post('/logout', function(req, res) {
  req.session.destroy();
  res.json({ ok: true });
});

// get current user
router.get('/me', async function(req, res) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'not logged in' });
  }

  var db = await getDb();
  var result = db.exec(
    'SELECT id, email, username, sem_start, sem_end, energy_type, hp, xp FROM users WHERE id = ?',
    [req.session.userId]
  );

  if (result.length === 0 || result[0].values.length === 0) {
    return res.status(401).json({ error: 'user not found' });
  }

  var cols = result[0].columns;
  var row = result[0].values[0];
  var user = {};
  cols.forEach(function(c, i) { user[c] = row[i]; });

  res.json(user);
});

// update semester settings
router.put('/settings', async function(req, res) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'not logged in' });
  }

  var { sem_start, sem_end, energy_type } = req.body;
  var db = await getDb();
  db.run('UPDATE users SET sem_start = ?, sem_end = ?, energy_type = ? WHERE id = ?',
    [sem_start || '', sem_end || '', energy_type || 'morning', req.session.userId]);
  persist();

  res.json({ ok: true });
});

// update hp/xp
router.put('/stats', async function(req, res) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'not logged in' });
  }

  var db = await getDb();
  var { hp, xp } = req.body;
  if (hp !== undefined) {
    db.run('UPDATE users SET hp = ? WHERE id = ?', [hp, req.session.userId]);
  }
  if (xp !== undefined) {
    db.run('UPDATE users SET xp = ? WHERE id = ?', [xp, req.session.userId]);
  }
  persist();
  res.json({ ok: true });
});

module.exports = router;
