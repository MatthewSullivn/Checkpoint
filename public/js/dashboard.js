/*
  dashboard.js — autopilot game logic
  handles semester map, quests, character sheet, check-ins
  talks to the express backend via fetch
*/

var user = null;
var courses = [];
var checkins = [];
var completedQuests = [];
var achievements = [];

// ============ BOOT ============

loadUser();

async function loadUser() {
  try {
    var res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }
    user = await res.json();
    await loadAll();
    renderAll();

    // first time? pop settings
    if (!user.sem_start) {
      setTimeout(function() { openModal('settingsModal'); }, 300);
    }
  } catch(e) {
    window.location.href = '/login';
  }
}

async function loadAll() {
  var results = await Promise.all([
    fetch('/api/courses').then(function(r) { return r.json(); }),
    fetch('/api/checkins').then(function(r) { return r.json(); }),
    fetch('/api/quests/completed').then(function(r) { return r.json(); }),
    fetch('/api/quests/achievements').then(function(r) { return r.json(); })
  ]);
  courses = results[0];
  checkins = results[1];
  completedQuests = results[2].map(function(q) { return q.quest_id; });
  achievements = results[3];
}

// ============ TABS ============

var tabs = document.querySelectorAll('.tab');
var panels = document.querySelectorAll('.tab-panel');

tabs.forEach(function(tab) {
  tab.onclick = function() {
    tabs.forEach(function(t) { t.classList.remove('active'); });
    panels.forEach(function(p) { p.classList.remove('active'); });
    tab.classList.add('active');
    var target = tab.getAttribute('data-tab');
    document.getElementById('panel-' + target).classList.add('active');
  };
});

// ============ SEMESTER WEEKS ============

function getWeeks() {
  if (!user.sem_start || !user.sem_end) return [];
  var start = new Date(user.sem_start + 'T00:00:00');
  var end = new Date(user.sem_end + 'T00:00:00');
  var weeks = [];
  var cur = new Date(start);
  var n = 1;

  while (cur <= end) {
    var weekEnd = new Date(cur);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > end) weekEnd = new Date(end);

    weeks.push({
      num: n,
      start: new Date(cur),
      end: new Date(weekEnd)
    });

    cur.setDate(cur.getDate() + 7);
    n++;
  }
  return weeks;
}

function weekLoad(week) {
  var load = 0;
  courses.forEach(function(c) {
    c.deadlines.forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= week.start && d <= week.end) {
        var w = dl.type === 'exam' ? 3 : dl.type === 'project' ? 2 : 1;
        load += c.difficulty * w;
      }
    });
  });
  return load;
}

function weekClass(load) {
  if (load >= 12) return 'boss';
  if (load >= 7) return 'intense';
  if (load >= 3) return 'moderate';
  return 'chill';
}

function isCurrent(week) {
  var now = new Date();
  return now >= week.start && now <= week.end;
}

function isPast(week) {
  return new Date() > week.end;
}

function weekDeadlines(week) {
  var out = [];
  courses.forEach(function(c) {
    c.deadlines.forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= week.start && d <= week.end) {
        out.push({ course: c.name, label: dl.label, date: dl.date, type: dl.type });
      }
    });
  });
  return out;
}

// ============ RENDER: SEMESTER MAP ============

function renderMap() {
  var grid = document.getElementById('weekGrid');
  grid.innerHTML = '';
  var weeks = getWeeks();

  if (weeks.length === 0) {
    grid.innerHTML = '<p class="empty-state">SET UP YOUR SEMESTER TO SEE THE MAP &#9881;</p>';
    document.getElementById('currentWeek').textContent = '-';
    return;
  }

  var foundCurrent = false;

  weeks.forEach(function(week) {
    var load = weekLoad(week);
    var cls = weekClass(load);
    var dls = weekDeadlines(week);

    var tile = document.createElement('div');
    tile.className = 'week-tile ' + cls;
    if (isPast(week)) tile.classList.add('past');
    if (isCurrent(week)) {
      tile.classList.add('current');
      foundCurrent = true;
      document.getElementById('currentWeek').textContent = week.num;
    }

    var tipText = 'Week ' + week.num;
    if (dls.length) {
      tipText += ': ' + dls.map(function(d) { return d.course + ' — ' + d.label; }).join(', ');
    }

    var bossIcon = cls === 'boss' ? '<span class="boss-icon">&#9760;</span>' : '';

    tile.innerHTML =
      bossIcon +
      '<span class="w-num">W' + week.num + '</span>' +
      '<span class="w-label">' + cls + '</span>' +
      '<div class="week-tip">' + tipText + '</div>';

    grid.appendChild(tile);
  });

  if (!foundCurrent) {
    document.getElementById('currentWeek').textContent = '-';
  }
}

// ============ RENDER: BOSS FIGHTS ============

function renderBosses() {
  var container = document.getElementById('bossList');
  container.innerHTML = '';

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var bosses = [];

  courses.forEach(function(c) {
    c.deadlines.forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= today && (dl.type === 'exam' || dl.type === 'project')) {
        bosses.push({ course: c.name, label: dl.label, date: dl.date, type: dl.type });
      }
    });
  });

  bosses.sort(function(a, b) { return a.date < b.date ? -1 : 1; });

  if (bosses.length === 0) {
    container.innerHTML = '<p class="empty-state">NO BOSS FIGHTS ON THE HORIZON</p>';
    return;
  }

  bosses.slice(0, 6).forEach(function(b) {
    var icon = b.type === 'exam' ? '&#9760;' : '&#9876;';
    var div = document.createElement('div');
    div.className = 'boss-item';
    div.innerHTML =
      '<span class="boss-item-name">' + icon + ' ' + b.course + ' — ' + b.label + '</span>' +
      '<span class="boss-item-date">' + prettyDate(b.date) + '</span>';
    container.appendChild(div);
  });
}

// ============ RENDER: QUESTS ============

function renderQuests() {
  var container = document.getElementById('questList');
  container.innerHTML = '';

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  var quests = [];

  // deadline quests coming up this week
  courses.forEach(function(c) {
    c.deadlines.forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= today && d <= endOfWeek) {
        quests.push({
          id: c.name + '|' + dl.date + '|' + dl.label,
          text: c.name + ': ' + dl.label,
          type: dl.type,
          date: dl.date
        });
      }
    });
  });

  // wellness quests
  var wellness = buildWellnessQuests();
  quests = wellness.concat(quests);

  if (quests.length === 0) {
    container.innerHTML = '<p class="empty-state">ADD COURSES TO BEGIN YOUR ADVENTURE</p>';
    return;
  }

  quests.forEach(function(q) {
    var done = completedQuests.indexOf(q.id) !== -1;
    var div = document.createElement('div');
    div.className = 'quest-item';
    if (q.type === 'wellness') div.classList.add('wellness');
    if (done) div.classList.add('done');

    var checkBtn = document.createElement('button');
    checkBtn.className = 'quest-check';
    checkBtn.textContent = done ? '✓' : '';
    checkBtn.onclick = function() { toggleQuest(q.id); };

    var text = document.createElement('span');
    text.className = 'quest-text';
    text.textContent = q.text;

    var xp = document.createElement('span');
    xp.className = 'quest-xp';
    xp.textContent = '+10 XP';

    div.appendChild(checkBtn);
    div.appendChild(text);
    div.appendChild(xp);
    container.appendChild(div);
  });
}

function buildWellnessQuests() {
  var today = todayStr();
  var prefix = 'wellness|' + today + '|';
  var q = [];
  var type = user.energy_type || 'morning';

  q.push({ id: prefix + 'water', text: 'Drink water (8 glasses)', type: 'wellness', date: today });
  q.push({ id: prefix + 'meal', text: 'Eat a real meal', type: 'wellness', date: today });

  if (type === 'morning') {
    q.push({ id: prefix + 'study', text: 'Deep study block (morning)', type: 'wellness', date: today });
    q.push({ id: prefix + 'wind', text: 'Wind down by 10pm', type: 'wellness', date: today });
  } else if (type === 'night') {
    q.push({ id: prefix + 'study', text: 'Deep study block (evening)', type: 'wellness', date: today });
    q.push({ id: prefix + 'sleep', text: 'No alarm — full sleep cycle', type: 'wellness', date: today });
  } else {
    q.push({ id: prefix + 'study', text: 'Deep study block (afternoon)', type: 'wellness', date: today });
    q.push({ id: prefix + 'break', text: 'Take a 15min break outside', type: 'wellness', date: today });
  }

  q.push({ id: prefix + 'move', text: 'Move your body (any exercise)', type: 'wellness', date: today });
  return q;
}

// ============ QUEST TOGGLE ============

async function toggleQuest(id) {
  var idx = completedQuests.indexOf(id);
  if (idx === -1) {
    completedQuests.push(id);
    user.xp = (user.xp || 0) + 10;
    await fetch('/api/quests/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quest_id: id })
    });
  } else {
    completedQuests.splice(idx, 1);
    user.xp = Math.max(0, (user.xp || 0) - 10);
    await fetch('/api/quests/uncomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quest_id: id })
    });
  }

  await fetch('/api/auth/stats', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ xp: user.xp })
  });

  checkAchievements();
  renderAll();
}

// ============ HP / XP ============

function recalcHP() {
  var todayCheckin = getTodayCheckin();

  if (!todayCheckin) {
    var gap = daysSinceCheckin();
    user.hp = Math.max(20, 100 - (gap * 5));
  } else {
    var sleepBoost = (todayCheckin.sleep - 1) * 10;
    var stressPenalty = (todayCheckin.stress - 1) * 8;
    var exerciseBoost = todayCheckin.exercise ? 15 : 0;
    user.hp = Math.min(100, Math.max(10, 50 + sleepBoost - stressPenalty + exerciseBoost));
  }

  // update server (fire and forget)
  fetch('/api/auth/stats', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hp: user.hp })
  });
}

function updateBars() {
  var hp = user.hp || 100;
  var xp = user.xp || 0;

  document.getElementById('hpBar').style.width = hp + '%';
  document.getElementById('hpVal').textContent = Math.round(hp);
  document.getElementById('xpBar').style.width = (xp % 100) + '%';
  document.getElementById('xpVal').textContent = xp;

  // character sheet stats
  document.getElementById('charHP').textContent = Math.round(hp);
  document.getElementById('charXP').textContent = xp;
  document.getElementById('charStreak').textContent = getStreak();
  document.getElementById('charQuests').textContent = completedQuests.length;

  // stress bar
  var todayCheckin = getTodayCheckin();
  var stressPercent = todayCheckin ? (todayCheckin.stress / 5) * 100 : 30;
  document.getElementById('stressBar').style.width = stressPercent + '%';

  // burnout badge
  updateBurnout(hp);
}

function updateBurnout(hp) {
  var badge = document.getElementById('burnoutBadge');
  var level = document.getElementById('burnoutLevel');

  badge.classList.remove('safe', 'warning', 'danger');

  if (hp > 60) {
    badge.classList.add('safe');
    level.textContent = 'LOW';
  } else if (hp > 30) {
    badge.classList.add('warning');
    level.textContent = 'MODERATE';
  } else {
    badge.classList.add('danger');
    level.textContent = 'HIGH — TAKE A BREAK';
  }
}

function getTodayCheckin() {
  var today = todayStr();
  for (var i = 0; i < checkins.length; i++) {
    if (checkins[i].date === today) return checkins[i];
  }
  return null;
}

function daysSinceCheckin() {
  if (checkins.length === 0) return 0;
  var dates = checkins.map(function(c) { return c.date; }).sort().reverse();
  var last = new Date(dates[0] + 'T00:00:00');
  var now = new Date();
  return Math.floor((now - last) / (86400000));
}

function getStreak() {
  if (checkins.length === 0) return 0;
  var dates = checkins.map(function(c) { return c.date; }).sort().reverse();

  // dedupe
  var unique = [];
  dates.forEach(function(d) {
    if (unique.indexOf(d) === -1) unique.push(d);
  });

  var streak = 1;
  for (var i = 1; i < unique.length; i++) {
    var prev = new Date(unique[i - 1] + 'T00:00:00');
    var curr = new Date(unique[i] + 'T00:00:00');
    var diff = (prev - curr) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// ============ ACHIEVEMENTS ============

var achievementDefs = [
  { id: 'first-checkin', icon: '&#127749;', name: 'FIRST DAWN' },
  { id: 'streak-3', icon: '&#128293;', name: 'ON FIRE' },
  { id: 'streak-7', icon: '&#9889;', name: 'UNSTOPPABLE' },
  { id: '5-quests', icon: '&#9876;', name: 'ADVENTURER' },
  { id: '20-quests', icon: '&#128737;', name: 'VETERAN' },
  { id: '50-quests', icon: '&#128081;', name: 'LEGEND' },
  { id: 'hp-guardian', icon: '&#128154;', name: 'IRON WILL' },
  { id: 'early-bird', icon: '&#128038;', name: 'EARLY BIRD' }
];

function checkAchievements() {
  var count = completedQuests.length;
  var streak = getStreak();

  if (checkins.length >= 1) unlockAch('first-checkin');
  if (streak >= 3) unlockAch('streak-3');
  if (streak >= 7) unlockAch('streak-7');
  if (count >= 5) unlockAch('5-quests');
  if (count >= 20) unlockAch('20-quests');
  if (count >= 50) unlockAch('50-quests');
  if (user.hp >= 80 && streak >= 7) unlockAch('hp-guardian');
}

async function unlockAch(id) {
  if (achievements.indexOf(id) !== -1) return;
  achievements.push(id);
  await fetch('/api/quests/achievements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ achievement_id: id })
  });
}

function renderAchievements() {
  var grid = document.getElementById('achievementGrid');
  grid.innerHTML = '';

  achievementDefs.forEach(function(ach) {
    var unlocked = achievements.indexOf(ach.id) !== -1;
    var div = document.createElement('div');
    div.className = 'ach-card ' + (unlocked ? 'unlocked' : 'locked');
    div.innerHTML =
      '<span class="ach-icon">' + ach.icon + '</span>' +
      '<span class="ach-name">' + ach.name + '</span>';
    grid.appendChild(div);
  });
}

// ============ MODALS ============

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// close on backdrop click
document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
  overlay.onclick = function(e) {
    if (e.target === overlay) overlay.classList.remove('open');
  };
});

// --- settings modal ---
document.getElementById('settingsBtn').onclick = function() {
  document.getElementById('semStart').value = user.sem_start || '';
  document.getElementById('semEnd').value = user.sem_end || '';
  document.getElementById('energyType').value = user.energy_type || 'morning';
  renderCourseList();
  openModal('settingsModal');
};

document.getElementById('closeSettings').onclick = function() { closeModal('settingsModal'); };

document.getElementById('settingsForm').onsubmit = async function(e) {
  e.preventDefault();
  user.sem_start = document.getElementById('semStart').value;
  user.sem_end = document.getElementById('semEnd').value;
  user.energy_type = document.getElementById('energyType').value;

  await fetch('/api/auth/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sem_start: user.sem_start,
      sem_end: user.sem_end,
      energy_type: user.energy_type
    })
  });

  renderAll();
};

// --- check-in modal ---
document.getElementById('checkinBtn').onclick = function() { openModal('checkinModal'); };
document.getElementById('closeCheckin').onclick = function() { closeModal('checkinModal'); };

document.getElementById('sleepScore').oninput = function() {
  document.getElementById('sleepLabel').textContent = this.value;
};
document.getElementById('stressScore').oninput = function() {
  document.getElementById('stressLabel').textContent = this.value;
};

document.getElementById('checkinForm').onsubmit = async function(e) {
  e.preventDefault();

  var entry = {
    date: todayStr(),
    sleep: parseInt(document.getElementById('sleepScore').value),
    stress: parseInt(document.getElementById('stressScore').value),
    exercise: document.getElementById('exerciseCheck').value === 'yes'
  };

  await fetch('/api/checkins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  });

  // update local state
  var existing = -1;
  for (var i = 0; i < checkins.length; i++) {
    if (checkins[i].date === entry.date) { existing = i; break; }
  }
  if (existing >= 0) {
    checkins[existing] = entry;
  } else {
    checkins.unshift(entry);
  }

  closeModal('checkinModal');
  checkAchievements();
  recalcHP();
  renderAll();
};

// --- course modal ---
document.getElementById('addCourseBtn').onclick = function() {
  closeModal('settingsModal');
  document.getElementById('courseForm').reset();
  document.getElementById('deadlineRows').innerHTML = '';
  document.getElementById('diffLabel').textContent = '3';
  openModal('courseModal');
};

document.getElementById('closeCourse').onclick = function() {
  closeModal('courseModal');
  openModal('settingsModal');
};

document.getElementById('courseDiff').oninput = function() {
  document.getElementById('diffLabel').textContent = this.value;
};

document.getElementById('addDeadlineBtn').onclick = function() {
  var row = document.createElement('div');
  row.className = 'dl-row';
  row.innerHTML =
    '<input type="text" placeholder="e.g. Midterm" required>' +
    '<input type="date" required>' +
    '<select>' +
      '<option value="assignment">Assignment</option>' +
      '<option value="exam">Exam</option>' +
      '<option value="project">Project</option>' +
    '</select>' +
    '<button type="button" class="remove-dl">&times;</button>';

  row.querySelector('.remove-dl').onclick = function() { row.remove(); };
  document.getElementById('deadlineRows').appendChild(row);
};

document.getElementById('courseForm').onsubmit = async function(e) {
  e.preventDefault();
  var name = document.getElementById('courseName').value.trim();
  var diff = parseInt(document.getElementById('courseDiff').value);
  var deadlines = [];

  var rows = document.getElementById('deadlineRows').querySelectorAll('.dl-row');
  rows.forEach(function(row) {
    var inputs = row.querySelectorAll('input');
    var sel = row.querySelector('select');
    if (inputs[0].value && inputs[1].value) {
      deadlines.push({
        label: inputs[0].value.trim(),
        date: inputs[1].value,
        type: sel.value
      });
    }
  });

  var res = await fetch('/api/courses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, difficulty: diff, deadlines: deadlines })
  });

  var course = await res.json();
  courses.push(course);

  closeModal('courseModal');
  openModal('settingsModal');
  renderCourseList();
  renderAll();
};

function renderCourseList() {
  var container = document.getElementById('courseListDisplay');
  container.innerHTML = '';

  courses.forEach(function(c) {
    var div = document.createElement('div');
    div.className = 'course-chip';
    div.innerHTML =
      '<span>' + c.name + ' (diff: ' + c.difficulty + ', ' + c.deadlines.length + ' deadlines)</span>' +
      '<button class="remove-course">&times;</button>';

    div.querySelector('.remove-course').onclick = async function() {
      await fetch('/api/courses/' + c.id, { method: 'DELETE' });
      courses = courses.filter(function(x) { return x.id !== c.id; });
      renderCourseList();
      renderAll();
    };

    container.appendChild(div);
  });
}

// --- logout ---
document.getElementById('logoutBtn').onclick = async function() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
};

// --- reset ---
document.getElementById('resetBtn').onclick = async function() {
  if (!confirm('Wipe all data and start fresh?')) return;

  // delete all courses (cascades deadlines on server)
  for (var i = 0; i < courses.length; i++) {
    await fetch('/api/courses/' + courses[i].id, { method: 'DELETE' });
  }

  courses = [];
  completedQuests = [];
  user.hp = 100;
  user.xp = 0;
  user.sem_start = '';
  user.sem_end = '';

  await fetch('/api/auth/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sem_start: '', sem_end: '', energy_type: 'morning' })
  });

  await fetch('/api/auth/stats', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hp: 100, xp: 0 })
  });

  closeModal('settingsModal');
  renderAll();
};

// ============ HELPERS ============

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function prettyDate(str) {
  var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var parts = str.split('-');
  return months[parseInt(parts[1]) - 1] + ' ' + parseInt(parts[2]);
}

// ============ RENDER ALL ============

function renderAll() {
  recalcHP();
  renderMap();
  renderBosses();
  renderQuests();
  renderAchievements();
  updateBars();
}
