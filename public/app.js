/*
  checkpoint — client
  talks to the express backend
*/

var currentUser = null;
var courses = [];
var checkins = [];
var completedQuests = [];
var achievements = [];

// =========== API HELPERS ===========

function api(method, url, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(function(r) {
    return r.json().then(function(data) {
      if (!r.ok) throw new Error(data.error || 'request failed');
      return data;
    });
  });
}

function get(url) { return api('GET', url); }
function post(url, body) { return api('POST', url, body); }
function put(url, body) { return api('PUT', url, body); }
function del(url) { return api('DELETE', url); }

// =========== AUTH ===========

var authScreen = document.getElementById('authScreen');
var appScreen = document.getElementById('appScreen');
var loginCard = document.getElementById('loginCard');
var signupCard = document.getElementById('signupCard');

document.getElementById('showSignup').onclick = function(e) {
  e.preventDefault();
  loginCard.classList.add('hidden');
  signupCard.classList.remove('hidden');
};

document.getElementById('showLogin').onclick = function(e) {
  e.preventDefault();
  signupCard.classList.add('hidden');
  loginCard.classList.remove('hidden');
};

document.getElementById('loginForm').onsubmit = function(e) {
  e.preventDefault();
  var errEl = document.getElementById('loginError');
  errEl.textContent = '';
  post('/api/login', {
    email: document.getElementById('loginEmail').value,
    password: document.getElementById('loginPassword').value
  }).then(function(data) {
    currentUser = data.user;
    enterApp();
  }).catch(function(err) {
    errEl.textContent = err.message;
  });
};

document.getElementById('signupForm').onsubmit = function(e) {
  e.preventDefault();
  var errEl = document.getElementById('signupError');
  errEl.textContent = '';
  post('/api/signup', {
    username: document.getElementById('signupUsername').value,
    email: document.getElementById('signupEmail').value,
    password: document.getElementById('signupPassword').value
  }).then(function(data) {
    currentUser = data.user;
    enterApp();
  }).catch(function(err) {
    errEl.textContent = err.message;
  });
};

document.getElementById('logoutBtn').onclick = function() {
  post('/api/logout').then(function() {
    currentUser = null;
    appScreen.classList.add('hidden');
    authScreen.classList.remove('hidden');
  });
};

// check if already logged in
get('/api/me').then(function(data) {
  currentUser = data.user;
  enterApp();
}).catch(function() {});

function enterApp() {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  document.getElementById('navUsername').textContent = currentUser.username;
  loadAll();
}

// =========== LOAD ALL DATA ===========

function loadAll() {
  Promise.all([
    get('/api/me'),
    get('/api/courses'),
    get('/api/checkins'),
    get('/api/quests/completed'),
    get('/api/achievements')
  ]).then(function(results) {
    currentUser = results[0].user;
    courses = results[1].courses;
    checkins = results[2].checkins;
    completedQuests = results[3].quests;
    achievements = results[4].achievements;
    renderAll();
  });
}

// =========== DATE HELPERS ===========

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatDate(s) {
  var p = s.split('-');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(p[1])-1] + ' ' + parseInt(p[2]);
}

function daysBetween(a, b) {
  return Math.floor((new Date(b+'T00:00:00') - new Date(a+'T00:00:00')) / 86400000);
}

// =========== SEMESTER LOGIC ===========

function getSemesterWeeks() {
  if (!currentUser.sem_start || !currentUser.sem_end) return [];
  var start = new Date(currentUser.sem_start + 'T00:00:00');
  var end = new Date(currentUser.sem_end + 'T00:00:00');
  var weeks = [], cur = new Date(start), num = 1;
  while (cur <= end) {
    var wEnd = new Date(cur);
    wEnd.setDate(wEnd.getDate() + 6);
    if (wEnd > end) wEnd = new Date(end);
    weeks.push({ num: num, start: new Date(cur), end: new Date(wEnd) });
    cur.setDate(cur.getDate() + 7);
    num++;
  }
  return weeks;
}

function getWeekLoad(week) {
  var load = 0;
  courses.forEach(function(c) {
    (c.deadlines || []).forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= week.start && d <= week.end) {
        var w = dl.type === 'exam' ? 3 : dl.type === 'project' ? 2 : 1;
        load += c.difficulty * w;
      }
    });
  });
  return load;
}

function classifyWeek(load) {
  if (load >= 12) return 'boss';
  if (load >= 7) return 'intense';
  if (load >= 3) return 'moderate';
  return 'chill';
}

function isCurrentWeek(w) {
  var now = new Date();
  return now >= w.start && now <= w.end;
}

function getWeekDeadlines(week) {
  var out = [];
  courses.forEach(function(c) {
    (c.deadlines || []).forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= week.start && d <= week.end)
        out.push({ course: c.name, label: dl.label, date: dl.date, type: dl.type });
    });
  });
  return out;
}

// =========== RENDERING ===========

function renderWeekGrid() {
  var grid = document.getElementById('weekGrid');
  grid.innerHTML = '';
  var weeks = getSemesterWeeks();
  document.getElementById('totalWeeks').textContent = weeks.length || '—';

  if (!weeks.length) {
    grid.innerHTML = '<p class="empty-state">Set up your semester dates first.</p>';
    return;
  }

  var foundCurrent = false;
  weeks.forEach(function(w) {
    var load = getWeekLoad(w);
    var cls = classifyWeek(load);
    var tile = document.createElement('div');
    tile.className = 'week-tile ' + cls;
    if (new Date() > w.end) tile.classList.add('past');
    if (isCurrentWeek(w)) {
      tile.classList.add('current');
      foundCurrent = true;
      document.getElementById('currentWeek').textContent = w.num;
    }
    if (cls === 'boss') tile.classList.add('boss-week');

    var dls = getWeekDeadlines(w);
    var tip = 'Week ' + w.num;
    if (dls.length) tip += ': ' + dls.map(function(d) { return d.course + ' - ' + d.label; }).join(', ');

    tile.innerHTML =
      '<span class="wnum">W' + w.num + '</span>' +
      '<span class="wlabel">' + cls + '</span>' +
      '<div class="week-tooltip">' + tip + '</div>';
    grid.appendChild(tile);
  });

  if (!foundCurrent) document.getElementById('currentWeek').textContent = '—';
}

function renderQuests() {
  var list = document.getElementById('questList');
  var noMsg = document.getElementById('noQuests');
  var counter = document.getElementById('questCounter');
  list.innerHTML = '';

  var today = new Date(); today.setHours(0,0,0,0);
  var weekOut = new Date(today); weekOut.setDate(weekOut.getDate() + 7);
  var quests = [];

  courses.forEach(function(c) {
    (c.deadlines || []).forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= today && d <= weekOut) {
        quests.push({
          id: c.name + '|' + dl.date + '|' + dl.label,
          text: c.name + ': ' + dl.label,
          date: dl.date,
          tag: dl.type === 'exam' ? 'exam' : 'deadline'
        });
      }
    });
  });

  var wellness = buildWellnessQuests();
  quests = quests.concat(wellness);

  if (!quests.length) { noMsg.style.display = ''; counter.textContent = '0/0'; return; }
  noMsg.style.display = 'none';

  quests.sort(function(a, b) {
    if (a.tag === 'wellness' && b.tag !== 'wellness') return -1;
    if (b.tag === 'wellness' && a.tag !== 'wellness') return 1;
    return a.date < b.date ? -1 : 1;
  });

  var doneCount = 0;
  quests.forEach(function(q) {
    var done = completedQuests.indexOf(q.id) !== -1;
    if (done) doneCount++;
    var li = document.createElement('li');
    if (done) li.classList.add('done');

    var btn = document.createElement('button');
    btn.className = 'quest-check';
    btn.textContent = done ? '✓' : '';
    btn.onclick = function() { toggleQuest(q.id); };

    var txt = document.createElement('span');
    txt.className = 'quest-text';
    txt.textContent = q.text;

    var tag = document.createElement('span');
    tag.className = 'quest-tag ' + q.tag;
    tag.textContent = q.tag;

    li.appendChild(btn);
    li.appendChild(txt);
    li.appendChild(tag);
    list.appendChild(li);
  });

  counter.textContent = doneCount + '/' + quests.length;
}

function buildWellnessQuests() {
  var d = todayStr();
  var pre = 'wellness|' + d + '|';
  var et = currentUser.energy_type || 'morning';
  var q = [
    { id: pre+'water', text: 'Drink water (8 glasses)', date: d, tag: 'wellness' },
    { id: pre+'meal', text: 'Eat a real meal', date: d, tag: 'wellness' }
  ];
  if (et === 'morning') {
    q.push({ id: pre+'study', text: 'Deep study block (morning)', date: d, tag: 'wellness' });
    q.push({ id: pre+'wind', text: 'Wind down by 10pm', date: d, tag: 'wellness' });
  } else if (et === 'night') {
    q.push({ id: pre+'study', text: 'Deep study block (evening)', date: d, tag: 'wellness' });
    q.push({ id: pre+'sleep', text: 'Sleep full cycle', date: d, tag: 'wellness' });
  } else {
    q.push({ id: pre+'study', text: 'Deep study block (afternoon)', date: d, tag: 'wellness' });
    q.push({ id: pre+'break', text: '15min break outside', date: d, tag: 'wellness' });
  }
  q.push({ id: pre+'move', text: 'Move your body', date: d, tag: 'wellness' });
  return q;
}

function renderBossFights() {
  var list = document.getElementById('bossList');
  var noMsg = document.getElementById('noBosses');
  list.innerHTML = '';
  var today = new Date(); today.setHours(0,0,0,0);
  var bosses = [];

  courses.forEach(function(c) {
    (c.deadlines || []).forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= today && (dl.type === 'exam' || dl.type === 'project'))
        bosses.push({ course: c.name, label: dl.label, date: dl.date, type: dl.type });
    });
  });

  bosses.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  if (!bosses.length) { noMsg.style.display = ''; return; }
  noMsg.style.display = 'none';

  bosses.slice(0, 6).forEach(function(b) {
    var li = document.createElement('li');
    var icon = b.type === 'exam' ? '☠' : '⚔';
    var daysLeft = daysBetween(todayStr(), b.date);
    li.innerHTML =
      '<span>' + icon + ' ' + b.course + ' — ' + b.label + '</span>' +
      '<span class="boss-date' + (daysLeft <= 3 ? ' boss-urgent' : '') + '">' + formatDate(b.date) + ' (' + daysLeft + 'd)</span>';
    list.appendChild(li);
  });
}

// =========== ACHIEVEMENTS ===========

var achDefs = [
  { id: 'first-checkin', icon: '🌅', name: 'First Dawn', desc: 'First check-in' },
  { id: 'streak-3', icon: '🔥', name: 'On Fire', desc: '3-day streak' },
  { id: 'streak-7', icon: '⚡', name: 'Unstoppable', desc: '7-day streak' },
  { id: 'q5', icon: '⚔', name: 'Adventurer', desc: '5 quests done' },
  { id: 'q20', icon: '🛡', name: 'Veteran', desc: '20 quests done' },
  { id: 'q50', icon: '👑', name: 'Legend', desc: '50 quests done' },
  { id: 'first-course', icon: '📘', name: 'Enrolled', desc: 'Add first course' },
  { id: 'five-courses', icon: '🎓', name: 'Full Load', desc: 'Add 5 courses' }
];

function checkAchievements() {
  var toUnlock = [];
  if (checkins.length >= 1 && achievements.indexOf('first-checkin') === -1) toUnlock.push('first-checkin');
  if (getStreak() >= 3 && achievements.indexOf('streak-3') === -1) toUnlock.push('streak-3');
  if (getStreak() >= 7 && achievements.indexOf('streak-7') === -1) toUnlock.push('streak-7');
  if (completedQuests.length >= 5 && achievements.indexOf('q5') === -1) toUnlock.push('q5');
  if (completedQuests.length >= 20 && achievements.indexOf('q20') === -1) toUnlock.push('q20');
  if (completedQuests.length >= 50 && achievements.indexOf('q50') === -1) toUnlock.push('q50');
  if (courses.length >= 1 && achievements.indexOf('first-course') === -1) toUnlock.push('first-course');
  if (courses.length >= 5 && achievements.indexOf('five-courses') === -1) toUnlock.push('five-courses');

  toUnlock.forEach(function(id) {
    achievements.push(id);
    post('/api/achievements/unlock', { achievementId: id });
  });
}

function getStreak() {
  if (!checkins.length) return 0;
  var dates = checkins.map(function(c) { return c.date; }).sort().reverse();
  var streak = 1;
  for (var i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i], dates[i-1]) === 1) streak++;
    else break;
  }
  return streak;
}

function renderAchievements() {
  var grid = document.getElementById('achievementGrid');
  grid.innerHTML = '';
  achDefs.forEach(function(a) {
    var div = document.createElement('div');
    div.className = 'achievement ' + (achievements.indexOf(a.id) !== -1 ? 'unlocked' : 'locked');
    div.innerHTML = '<span class="ach-icon">' + a.icon + '</span><span class="ach-name">' + a.name + '</span>';
    div.title = a.desc;
    grid.appendChild(div);
  });
}

// =========== HP / XP ===========

function updateBars() {
  var hp = currentUser.hp || 100;
  var xp = currentUser.xp || 0;
  document.getElementById('hpFill').style.width = hp + '%';
  document.getElementById('hpText').textContent = Math.round(hp);
  document.getElementById('xpFill').style.width = (xp % 100) + '%';
  document.getElementById('xpText').textContent = xp;
}

// =========== QUEST TOGGLE ===========

function toggleQuest(id) {
  post('/api/quests/toggle', { questId: id }).then(function(data) {
    if (data.completed) completedQuests.push(id);
    else {
      var idx = completedQuests.indexOf(id);
      if (idx !== -1) completedQuests.splice(idx, 1);
    }
    currentUser.xp = data.xp;
    checkAchievements();
    renderQuests();
    renderAchievements();
    updateBars();
  });
}

// =========== MODALS ===========

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.overlay').forEach(function(el) {
  el.onclick = function(e) { if (e.target === el) el.classList.remove('open'); };
});

// settings
document.getElementById('settingsBtn').onclick = function() {
  document.getElementById('semStart').value = currentUser.sem_start || '';
  document.getElementById('semEnd').value = currentUser.sem_end || '';
  document.getElementById('energyType').value = currentUser.energy_type || 'morning';
  renderCourseList();
  openModal('settingsModal');
};
document.getElementById('closeSettingsModal').onclick = function() { closeModal('settingsModal'); };

document.getElementById('settingsForm').onsubmit = function(e) {
  e.preventDefault();
  var data = {
    semStart: document.getElementById('semStart').value,
    semEnd: document.getElementById('semEnd').value,
    energyType: document.getElementById('energyType').value
  };
  put('/api/settings', data).then(function() {
    currentUser.sem_start = data.semStart;
    currentUser.sem_end = data.semEnd;
    currentUser.energy_type = data.energyType;
    renderAll();
  });
};

// check-in
document.getElementById('checkInBtn').onclick = function() { openModal('checkinModal'); };
document.getElementById('closeCheckinModal').onclick = function() { closeModal('checkinModal'); };

document.getElementById('checkinForm').onsubmit = function(e) {
  e.preventDefault();
  var entry = {
    date: todayStr(),
    sleep: parseInt(document.getElementById('sleepScore').value),
    stress: parseInt(document.getElementById('stressScore').value),
    exercise: document.getElementById('exerciseCheck').value === 'yes'
  };
  post('/api/checkins', entry).then(function(data) {
    var found = false;
    for (var i = 0; i < checkins.length; i++) {
      if (checkins[i].date === entry.date) { checkins[i] = entry; found = true; break; }
    }
    if (!found) checkins.push(entry);
    currentUser.hp = data.hp;
    closeModal('checkinModal');
    checkAchievements();
    renderAll();
  });
};

document.getElementById('sleepScore').oninput = function() { document.getElementById('sleepLabel').textContent = this.value; };
document.getElementById('stressScore').oninput = function() { document.getElementById('stressLabel').textContent = this.value; };

// courses
document.getElementById('addCourseBtn').onclick = function() {
  closeModal('settingsModal');
  document.getElementById('courseForm').reset();
  document.getElementById('deadlineList').innerHTML = '<label>Deadlines</label>';
  updateDiffStars(3);
  openModal('courseModal');
};

document.getElementById('closeCourseModal').onclick = function() { closeModal('courseModal'); openModal('settingsModal'); };
document.getElementById('cancelCourseBtn').onclick = function() { closeModal('courseModal'); openModal('settingsModal'); };

document.getElementById('addDeadlineBtn').onclick = addDeadlineRow;

function addDeadlineRow() {
  var row = document.createElement('div');
  row.className = 'dl-row';
  row.innerHTML =
    '<input type="text" placeholder="e.g. Midterm">' +
    '<input type="date">' +
    '<select><option value="assignment">Assignment</option><option value="exam">Exam</option><option value="project">Project</option></select>' +
    '<button type="button" class="dl-remove">✕</button>';
  row.querySelector('.dl-remove').onclick = function() { row.remove(); };
  document.getElementById('deadlineList').appendChild(row);
}

document.getElementById('courseForm').onsubmit = function(e) {
  e.preventDefault();
  var deadlines = [];
  document.getElementById('deadlineList').querySelectorAll('.dl-row').forEach(function(row) {
    var ins = row.querySelectorAll('input');
    var sel = row.querySelector('select');
    if (ins[0].value && ins[1].value)
      deadlines.push({ label: ins[0].value.trim(), date: ins[1].value, type: sel.value });
  });

  post('/api/courses', {
    name: document.getElementById('courseName').value.trim(),
    difficulty: parseInt(document.getElementById('courseDiff').value),
    deadlines: deadlines
  }).then(function(data) {
    courses.push(data.course);
    closeModal('courseModal');
    openModal('settingsModal');
    checkAchievements();
    renderCourseList();
    renderAll();
  });
};

document.getElementById('courseDiff').oninput = function() { updateDiffStars(this.value); };

function updateDiffStars(val) {
  var s = '';
  for (var i = 0; i < 5; i++) s += i < val ? '★' : '☆';
  document.getElementById('diffStars').textContent = s;
}

function renderCourseList() {
  var container = document.getElementById('courseListDisplay');
  container.innerHTML = '';
  courses.forEach(function(c) {
    var div = document.createElement('div');
    div.className = 'course-chip';
    var stars = '';
    for (var j = 0; j < c.difficulty; j++) stars += '★';
    div.innerHTML =
      '<span>' + c.name + ' ' + stars + ' (' + (c.deadlines||[]).length + ' deadlines)</span>' +
      '<button class="course-remove">✕</button>';
    div.querySelector('.course-remove').onclick = function() {
      del('/api/courses/' + c.id).then(function() {
        courses = courses.filter(function(x) { return x.id !== c.id; });
        renderCourseList();
        renderAll();
      });
    };
    container.appendChild(div);
  });
}

// =========== IMPORT ===========

document.getElementById('importBtn').onclick = function() {
  document.getElementById('quickAddList').innerHTML = '';
  for (var i = 0; i < 3; i++) addQuickRow();
  openModal('importModal');
};
document.getElementById('closeImportModal').onclick = function() { closeModal('importModal'); };

// tabs
document.querySelectorAll('.tabs .tab').forEach(function(tab) {
  tab.onclick = function() {
    document.querySelectorAll('.tabs .tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  };
});

// ics
var dropZone = document.getElementById('dropZone');
var icsInput = document.getElementById('icsFileInput');
var parsedIcs = [];

dropZone.ondragover = function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); };
dropZone.ondragleave = function() { dropZone.classList.remove('drag-over'); };
dropZone.ondrop = function(e) {
  e.preventDefault(); dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) readIcsFile(e.dataTransfer.files[0]);
};
icsInput.onchange = function() { if (this.files[0]) readIcsFile(this.files[0]); };

function readIcsFile(file) {
  var reader = new FileReader();
  reader.onload = function(e) { parsedIcs = parseICS(e.target.result); showIcsPreview(); };
  reader.readAsText(file);
}

function parseICS(text) {
  var events = [], lines = text.replace(/\r\n /g, '').split(/\r?\n/);
  var inEv = false, ev = {};
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === 'BEGIN:VEVENT') { inEv = true; ev = {}; }
    else if (line === 'END:VEVENT') { inEv = false; if (ev.summary && ev.date) events.push(ev); }
    else if (inEv) {
      if (line.indexOf('SUMMARY') === 0) ev.summary = line.split(':').slice(1).join(':');
      else if (line.indexOf('DTSTART') === 0) {
        var val = line.split(':').pop();
        ev.date = val.substring(0,4)+'-'+val.substring(4,6)+'-'+val.substring(6,8);
      }
    }
  }
  return events;
}

function showIcsPreview() {
  var el = document.getElementById('icsPreview');
  var list = document.getElementById('icsEventList');
  if (!parsedIcs.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  list.innerHTML = '';
  parsedIcs.forEach(function(ev) {
    var li = document.createElement('li');
    li.innerHTML = '<span>' + ev.summary + '</span><span class="ev-date">' + formatDate(ev.date) + '</span>';
    list.appendChild(li);
  });
}

document.getElementById('icsImportConfirm').onclick = function() {
  var events = parsedIcs.map(function(ev) { return { label: ev.summary, date: ev.date, type: guessType(ev.summary) }; });
  post('/api/import', { events: events }).then(function() {
    parsedIcs = [];
    document.getElementById('icsPreview').classList.add('hidden');
    closeModal('importModal');
    loadAll();
  });
};

document.getElementById('icsClear').onclick = function() {
  parsedIcs = [];
  document.getElementById('icsPreview').classList.add('hidden');
};

// paste syllabus
var parsedPaste = [];

document.getElementById('parseSyllabus').onclick = function() {
  parsedPaste = parseSyllabusText(document.getElementById('syllabusText').value);
  showPastePreview();
};

function parseSyllabusText(text) {
  var events = [], lines = text.split('\n');
  var patterns = [
    { re: /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/, fmt: function(m) { return m[1]+'-'+pad(+m[2])+'-'+pad(+m[3]); }},
    { re: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})/i, fmt: function(m) { return m[3]+'-'+pad(monthNum(m[1]))+'-'+pad(+m[2]); }},
    { re: /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i, fmt: function(m) { return m[3]+'-'+pad(monthNum(m[2]))+'-'+pad(+m[1]); }},
    { re: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})/i, fmt: function(m) { return new Date().getFullYear()+'-'+pad(monthNum(m[1]))+'-'+pad(+m[2]); }},
    { re: /\b(\d{1,2})[-\/](\d{1,2})\b/, fmt: function(m) { return new Date().getFullYear()+'-'+pad(+m[1])+'-'+pad(+m[2]); }}
  ];

  lines.forEach(function(line) {
    line = line.trim();
    if (!line) return;
    for (var p = 0; p < patterns.length; p++) {
      var match = line.match(patterns[p].re);
      if (match) {
        var date = patterns[p].fmt(match);
        var label = line.replace(patterns[p].re, '').replace(/^[\s\-–—:,]+/, '').replace(/[\s\-–—:,]+$/, '').trim() || 'Event';
        events.push({ summary: label, date: date });
        break;
      }
    }
  });
  return events;
}

function monthNum(abbr) {
  var m = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  return m[abbr.toLowerCase().substring(0,3)] || 1;
}

function showPastePreview() {
  var el = document.getElementById('pastePreview');
  var list = document.getElementById('pasteEventList');
  if (!parsedPaste.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  list.innerHTML = '';
  parsedPaste.forEach(function(ev) {
    var li = document.createElement('li');
    li.innerHTML = '<span>' + ev.summary + '</span><span class="ev-date">' + formatDate(ev.date) + '</span>';
    list.appendChild(li);
  });
}

document.getElementById('pasteImportConfirm').onclick = function() {
  var events = parsedPaste.map(function(ev) { return { label: ev.summary, date: ev.date, type: guessType(ev.summary) }; });
  post('/api/import', { events: events }).then(function() {
    parsedPaste = [];
    document.getElementById('pastePreview').classList.add('hidden');
    document.getElementById('syllabusText').value = '';
    closeModal('importModal');
    loadAll();
  });
};

document.getElementById('pasteClear').onclick = function() {
  parsedPaste = [];
  document.getElementById('pastePreview').classList.add('hidden');
};

// quick add
document.getElementById('quickAddRow').onclick = addQuickRow;

function addQuickRow() {
  var row = document.createElement('div');
  row.className = 'quick-row';
  row.innerHTML =
    '<input type="text" placeholder="Course">' +
    '<input type="text" placeholder="Label">' +
    '<input type="date">' +
    '<select><option value="assignment">Assign</option><option value="exam">Exam</option><option value="project">Project</option></select>';
  document.getElementById('quickAddList').appendChild(row);
}

document.getElementById('quickAddConfirm').onclick = function() {
  var rows = document.getElementById('quickAddList').querySelectorAll('.quick-row');
  var byCourse = {};
  rows.forEach(function(row) {
    var ins = row.querySelectorAll('input');
    var sel = row.querySelector('select');
    var course = ins[0].value.trim(), label = ins[1].value.trim(), date = ins[2].value;
    if (!course || !label || !date) return;
    if (!byCourse[course]) byCourse[course] = [];
    byCourse[course].push({ label: label, date: date, type: sel.value });
  });

  var promises = Object.keys(byCourse).map(function(name) {
    return post('/api/courses', { name: name, difficulty: 3, deadlines: byCourse[name] });
  });

  Promise.all(promises).then(function() {
    closeModal('importModal');
    loadAll();
  });
};

function guessType(text) {
  var l = text.toLowerCase();
  if (/exam|midterm|final|test|quiz/.test(l)) return 'exam';
  if (/project|presentation/.test(l)) return 'project';
  return 'assignment';
}

// =========== RENDER ALL ===========

function renderAll() {
  renderWeekGrid();
  renderQuests();
  renderBossFights();
  renderAchievements();
  updateBars();
}
