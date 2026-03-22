var express = require('express');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var path = require('path');
var { getDb } = require('./db');

var app = express();
var PORT = process.env.PORT || 3000;

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({
  secret: 'autopilot-semester-rpg-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// static files
app.use(express.static(path.join(__dirname, 'public')));

// routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/checkins', require('./routes/checkins'));
app.use('/api/quests', require('./routes/quests'));

// page routes
app.get('/login', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/dashboard', function(req, res) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', function(req, res) {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// init db then start server
getDb().then(function() {
  app.listen(PORT, function() {
    console.log('autopilot running on http://localhost:' + PORT);
  });
}).catch(function(err) {
  console.error('failed to init database:', err);
  process.exit(1);
});
