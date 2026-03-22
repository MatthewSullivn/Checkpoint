var express = require('express');
var { getDb, persist } = require('../db');
var router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'not logged in' });
  next();
}

// helper to turn sql.js result into array of objects
function toObjects(result) {
  if (!result.length || !result[0].values.length) return [];
  var cols = result[0].columns;
  return result[0].values.map(function(row) {
    var obj = {};
    cols.forEach(function(c, i) { obj[c] = row[i]; });
    return obj;
  });
}

// get all courses with deadlines
router.get('/', requireAuth, async function(req, res) {
  var db = await getDb();
  var coursesResult = db.exec('SELECT * FROM courses WHERE user_id = ?', [req.session.userId]);
  var courses = toObjects(coursesResult);

  courses.forEach(function(c) {
    var dlResult = db.exec('SELECT * FROM deadlines WHERE course_id = ? ORDER BY date', [c.id]);
    c.deadlines = toObjects(dlResult);
  });

  res.json(courses);
});

// add a course
router.post('/', requireAuth, async function(req, res) {
  var { name, difficulty, deadlines } = req.body;
  if (!name) return res.status(400).json({ error: 'course name required' });

  var db = await getDb();
  db.run('INSERT INTO courses (user_id, name, difficulty) VALUES (?, ?, ?)',
    [req.session.userId, name, difficulty || 3]);

  var idResult = db.exec('SELECT last_insert_rowid() as id');
  var courseId = idResult[0].values[0][0];

  if (deadlines && deadlines.length) {
    deadlines.forEach(function(dl) {
      db.run('INSERT INTO deadlines (course_id, label, date, type) VALUES (?, ?, ?, ?)',
        [courseId, dl.label, dl.date, dl.type || 'assignment']);
    });
  }

  persist();

  // return created course
  var courseResult = db.exec('SELECT * FROM courses WHERE id = ?', [courseId]);
  var course = toObjects(courseResult)[0];
  var dlResult = db.exec('SELECT * FROM deadlines WHERE course_id = ?', [courseId]);
  course.deadlines = toObjects(dlResult);

  res.json(course);
});

// delete a course
router.delete('/:id', requireAuth, async function(req, res) {
  var db = await getDb();
  var courseResult = db.exec('SELECT * FROM courses WHERE id = ? AND user_id = ?',
    [req.params.id, req.session.userId]);

  if (!toObjects(courseResult).length) {
    return res.status(404).json({ error: 'course not found' });
  }

  db.run('DELETE FROM deadlines WHERE course_id = ?', [req.params.id]);
  db.run('DELETE FROM courses WHERE id = ?', [req.params.id]);
  persist();

  res.json({ ok: true });
});

module.exports = router;
