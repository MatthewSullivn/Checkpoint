var initSqlJs = require('sql.js');
var fs = require('fs');
var path = require('path');

var DB_PATH = path.join(__dirname, 'autopilot.db');
var db = null;

async function getDb() {
  if (db) return db;

  var SQL = await initSqlJs();

  // load existing db file if it exists
  if (fs.existsSync(DB_PATH)) {
    var buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      sem_start TEXT DEFAULT '',
      sem_end TEXT DEFAULT '',
      energy_type TEXT DEFAULT 'morning',
      hp INTEGER DEFAULT 100,
      xp INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      difficulty INTEGER DEFAULT 3
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS deadlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT DEFAULT 'assignment'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      sleep INTEGER DEFAULT 3,
      stress INTEGER DEFAULT 3,
      exercise INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS completed_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quest_id TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      achievement_id TEXT NOT NULL,
      UNIQUE(user_id, achievement_id)
    )
  `);

  persist();
  return db;
}

function persist() {
  if (!db) return;
  var data = db.export();
  var buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

module.exports = { getDb, persist };
