var express = require('express');
var session = require('express-session');
var bcrypt = require('bcryptjs');
var Database = require('better-sqlite3');
var path = require('path');
var multer = require('multer');
var { PDFParse } = require('pdf-parse');

var upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

var app = express();
var PORT = process.env.PORT || 3000;

// database
var db = new Database(path.join(__dirname, 'db', 'checkpoint.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    energy_type TEXT DEFAULT 'morning',
    sem_start TEXT DEFAULT '',
    sem_end TEXT DEFAULT '',
    hp INTEGER DEFAULT 100,
    xp INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    difficulty INTEGER DEFAULT 3,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS deadlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT DEFAULT 'assignment',
    FOREIGN KEY (course_id) REFERENCES courses(id)
  );

  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    sleep INTEGER NOT NULL,
    stress INTEGER NOT NULL,
    exercise INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS completed_quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    quest_id TEXT NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, quest_id)
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_id TEXT NOT NULL,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, achievement_id)
  );
`);

// middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'checkpoint-semester-rpg-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// auth guard
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'not logged in' });
  next();
}

// ============ AUTH ROUTES ============

app.post('/api/signup', function(req, res) {
  var username = (req.body.username || '').trim();
  var email = (req.body.email || '').trim().toLowerCase();
  var password = req.body.password || '';

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'all fields required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be 6+ characters' });
  }

  var existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) {
    return res.status(400).json({ error: 'username or email already taken' });
  }

  var hash = bcrypt.hashSync(password, 10);
  var result = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(username, email, hash);
  req.session.userId = result.lastInsertRowid;
  res.json({ ok: true, user: { id: result.lastInsertRowid, username: username, email: email } });
});

app.post('/api/login', function(req, res) {
  var email = (req.body.email || '').trim().toLowerCase();
  var password = req.body.password || '';

  var user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'invalid email or password' });
  }

  req.session.userId = user.id;
  res.json({ ok: true, user: { id: user.id, username: user.username, email: user.email } });
});

app.post('/api/logout', function(req, res) {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', requireLogin, function(req, res) {
  var user = db.prepare('SELECT id, username, email, energy_type, sem_start, sem_end, hp, xp FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'user not found' });
  res.json({ user: user });
});

// ============ SETTINGS ============

app.put('/api/settings', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var semStart = req.body.semStart || '';
  var semEnd = req.body.semEnd || '';
  var energyType = req.body.energyType || 'morning';

  db.prepare('UPDATE users SET sem_start = ?, sem_end = ?, energy_type = ? WHERE id = ?')
    .run(semStart, semEnd, energyType, uid);
  res.json({ ok: true });
});

// ============ COURSES ============

app.get('/api/courses', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var courses = db.prepare('SELECT * FROM courses WHERE user_id = ?').all(uid);
  courses.forEach(function(c) {
    c.deadlines = db.prepare('SELECT * FROM deadlines WHERE course_id = ?').all(c.id);
  });
  res.json({ courses: courses });
});

app.post('/api/courses', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var name = (req.body.name || '').trim();
  var difficulty = req.body.difficulty || 3;
  var deadlines = req.body.deadlines || [];

  if (!name) return res.status(400).json({ error: 'course name required' });

  var result = db.prepare('INSERT INTO courses (user_id, name, difficulty) VALUES (?, ?, ?)').run(uid, name, difficulty);
  var courseId = result.lastInsertRowid;

  var insertDl = db.prepare('INSERT INTO deadlines (course_id, label, date, type) VALUES (?, ?, ?, ?)');
  deadlines.forEach(function(dl) {
    if (dl.label && dl.date) insertDl.run(courseId, dl.label, dl.date, dl.type || 'assignment');
  });

  var course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  course.deadlines = db.prepare('SELECT * FROM deadlines WHERE course_id = ?').all(courseId);
  res.json({ course: course });
});

app.delete('/api/courses/:id', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(req.params.id, uid);
  if (!course) return res.status(404).json({ error: 'course not found' });

  db.prepare('DELETE FROM deadlines WHERE course_id = ?').run(course.id);
  db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
  res.json({ ok: true });
});

// ============ CHECKINS ============

app.get('/api/checkins', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var rows = db.prepare('SELECT * FROM checkins WHERE user_id = ? ORDER BY date DESC LIMIT 30').all(uid);
  res.json({ checkins: rows });
});

app.post('/api/checkins', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var date = req.body.date;
  var sleep = req.body.sleep;
  var stress = req.body.stress;
  var exercise = req.body.exercise ? 1 : 0;

  // upsert
  var existing = db.prepare('SELECT id FROM checkins WHERE user_id = ? AND date = ?').get(uid, date);
  if (existing) {
    db.prepare('UPDATE checkins SET sleep = ?, stress = ?, exercise = ? WHERE id = ?')
      .run(sleep, stress, exercise, existing.id);
  } else {
    db.prepare('INSERT INTO checkins (user_id, date, sleep, stress, exercise) VALUES (?, ?, ?, ?, ?)')
      .run(uid, date, sleep, stress, exercise);
  }

  // recalc hp
  var hp = calcHP(sleep, stress, exercise);
  db.prepare('UPDATE users SET hp = ? WHERE id = ?').run(hp, uid);
  res.json({ ok: true, hp: hp });
});

function calcHP(sleep, stress, exercise) {
  var sleepBoost = (sleep - 1) * 10;
  var stressHit = (stress - 1) * 8;
  var exerciseBoost = exercise ? 15 : 0;
  return Math.min(100, Math.max(10, 50 + sleepBoost - stressHit + exerciseBoost));
}

// ============ QUESTS ============

app.get('/api/quests/completed', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var rows = db.prepare('SELECT quest_id FROM completed_quests WHERE user_id = ?').all(uid);
  res.json({ quests: rows.map(function(r) { return r.quest_id; }) });
});

app.post('/api/quests/toggle', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var questId = req.body.questId;
  var user = db.prepare('SELECT xp FROM users WHERE id = ?').get(uid);

  var existing = db.prepare('SELECT id FROM completed_quests WHERE user_id = ? AND quest_id = ?').get(uid, questId);
  if (existing) {
    db.prepare('DELETE FROM completed_quests WHERE id = ?').run(existing.id);
    var newXp = Math.max(0, user.xp - 10);
    db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(newXp, uid);
    res.json({ completed: false, xp: newXp });
  } else {
    db.prepare('INSERT INTO completed_quests (user_id, quest_id) VALUES (?, ?)').run(uid, questId);
    var newXp = user.xp + 10;
    db.prepare('UPDATE users SET xp = ? WHERE id = ?').run(newXp, uid);
    res.json({ completed: true, xp: newXp });
  }
});

// ============ ACHIEVEMENTS ============

app.get('/api/achievements', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var rows = db.prepare('SELECT achievement_id FROM achievements WHERE user_id = ?').all(uid);
  res.json({ achievements: rows.map(function(r) { return r.achievement_id; }) });
});

app.post('/api/achievements/unlock', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var achId = req.body.achievementId;
  try {
    db.prepare('INSERT OR IGNORE INTO achievements (user_id, achievement_id) VALUES (?, ?)').run(uid, achId);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true });
  }
});

// ============ IMPORT ============

app.post('/api/import', requireLogin, function(req, res) {
  var uid = req.session.userId;
  var events = req.body.events || [];
  var courseName = req.body.courseName || 'Imported';

  // find or create the course
  var course = db.prepare('SELECT * FROM courses WHERE user_id = ? AND name = ?').get(uid, courseName);
  if (!course) {
    var result = db.prepare('INSERT INTO courses (user_id, name, difficulty) VALUES (?, ?, 3)').run(uid, courseName);
    course = { id: result.lastInsertRowid };
  }

  var insertDl = db.prepare('INSERT INTO deadlines (course_id, label, date, type) VALUES (?, ?, ?, ?)');
  events.forEach(function(ev) {
    if (ev.label && ev.date) insertDl.run(course.id, ev.label, ev.date, ev.type || 'assignment');
  });

  res.json({ ok: true, courseId: course.id });
});

// ============ BANNER PDF IMPORT ============

app.post('/api/import/banner', requireLogin, upload.single('pdf'), function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });

  var uid = req.session.userId;
  var arr = new Uint8Array(req.file.buffer);
  var parser = new PDFParse(arr);

  parser.load().then(function() {
    return parser.getText();
  }).then(function(result) {
    var text = '';
    result.pages.forEach(function(p) { text += p.text + '\n'; });
    var parsed = parseBannerText(text);

    // auto-set semester dates
    if (parsed.semStart && parsed.semEnd) {
      db.prepare('UPDATE users SET sem_start = ?, sem_end = ? WHERE id = ?')
        .run(parsed.semStart, parsed.semEnd, uid);
    }

    // insert courses
    var insertCourse = db.prepare('INSERT INTO courses (user_id, name, difficulty) VALUES (?, ?, ?)');
    var insertDl = db.prepare('INSERT INTO deadlines (course_id, label, date, type) VALUES (?, ?, ?, ?)');

    parsed.courses.forEach(function(c) {
      // skip if course already exists for this user
      var existing = db.prepare('SELECT id FROM courses WHERE user_id = ? AND name = ?').get(uid, c.name);
      if (existing) return;

      var result = insertCourse.run(uid, c.name, c.difficulty);
      var courseId = result.lastInsertRowid;

      // add class schedule as recurring context (first and last class as deadlines)
      if (c.startDate && c.endDate) {
        insertDl.run(courseId, 'First class', c.startDate, 'assignment');
        insertDl.run(courseId, 'Last class', c.endDate, 'assignment');
      }
    });

    res.json({
      ok: true,
      courses: parsed.courses,
      semStart: parsed.semStart,
      semEnd: parsed.semEnd
    });
  }).catch(function(err) {
    res.status(400).json({ error: 'could not parse PDF: ' + err.message });
  });
});

function parseBannerText(text) {
  var courses = [];
  var semStart = null;
  var semEnd = null;
  var lines = text.split('\n');

  // pattern: "Course Title \tCSCI 2100 01 3.0 \t20743 01/07/2026 - 04/07/2026"
  // we look for lines containing a course code pattern and date range
  var coursePattern = /^(.+?)\t([A-Z]{4}\s+\d{4})\s+(\S+)\s+([\d.]+)\s+\t\d+\s+(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/;

  var seen = {};
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].match(coursePattern);
    if (!match) continue;

    var title = match[1].trim();
    var code = match[2].trim();
    var credits = parseFloat(match[4]);
    var start = bannerDate(match[5]);
    var end = bannerDate(match[6]);

    // skip 0-credit sections (tutorials/labs that duplicate the main course)
    if (credits === 0) continue;

    // deduplicate by course code
    if (seen[code]) continue;
    seen[code] = true;

    // track overall semester bounds
    if (!semStart || start < semStart) semStart = start;
    if (!semEnd || end > semEnd) semEnd = end;

    // guess difficulty from credit hours and course level
    var level = parseInt(code.split(' ')[1]) || 2000;
    var diff = 3;
    if (level >= 4000) diff = 5;
    else if (level >= 3000) diff = 4;
    else if (level >= 2000) diff = 3;
    else diff = 2;

    courses.push({
      name: code + ' - ' + title,
      code: code,
      title: title,
      credits: credits,
      difficulty: diff,
      startDate: start,
      endDate: end
    });
  }

  return { courses: courses, semStart: semStart, semEnd: semEnd };
}

function bannerDate(str) {
  // converts "01/07/2026" to "2026-01-07"
  var parts = str.split('/');
  return parts[2] + '-' + parts[0] + '-' + parts[1];
}

// serve the app for all other routes
app.get('/{*splat}', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, function() {
  console.log('Checkpoint running on http://localhost:' + PORT);
});
