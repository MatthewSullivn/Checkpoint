/*
  autopilot — semester RPG planner
  all state lives in localStorage, no backend needed
*/

var store = {
  load: function() {
    var raw = localStorage.getItem('autopilot');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch(e) { return null; }
  },
  save: function(data) {
    localStorage.setItem('autopilot', JSON.stringify(data));
  },
  nuke: function() {
    localStorage.removeItem('autopilot');
  }
};

// default state
function freshState() {
  return {
    semStart: '',
    semEnd: '',
    energyType: 'morning',
    courses: [],
    hp: 100,
    xp: 0,
    checkins: [],
    completedQuests: [],
    achievements: {}
  };
}

var state = store.load() || freshState();

// ============ SEMESTER WEEKS ============

function getSemesterWeeks() {
  if (!state.semStart || !state.semEnd) return [];
  var start = new Date(state.semStart + 'T00:00:00');
  var end = new Date(state.semEnd + 'T00:00:00');
  var weeks = [];
  var cur = new Date(start);
  var weekNum = 1;
  while (cur <= end) {
    var weekEnd = new Date(cur);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > end) weekEnd = new Date(end);
    weeks.push({
      num: weekNum,
      start: new Date(cur),
      end: new Date(weekEnd)
    });
    cur.setDate(cur.getDate() + 7);
    weekNum++;
  }
  return weeks;
}

function getWeekLoad(week) {
  // count deadlines in this week and weight by difficulty + type
  var load = 0;
  state.courses.forEach(function(course) {
    course.deadlines.forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= week.start && d <= week.end) {
        var mult = dl.type === 'exam' ? 3 : dl.type === 'project' ? 2 : 1;
        load += course.difficulty * mult;
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

function isCurrentWeek(week) {
  var now = new Date();
  return now >= week.start && now <= week.end;
}

function isPast(week) {
  return new Date() > week.end;
}

function getWeekDeadlines(week) {
  var items = [];
  state.courses.forEach(function(course) {
    course.deadlines.forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= week.start && d <= week.end) {
        items.push({ course: course.name, label: dl.label, date: dl.date, type: dl.type });
      }
    });
  });
  return items;
}

// ============ RENDERING ============

function renderWeekGrid() {
  var grid = document.getElementById('weekGrid');
  grid.innerHTML = '';
  var weeks = getSemesterWeeks();
  var totalW = document.getElementById('totalWeeks');
  totalW.textContent = weeks.length || '?';

  if (weeks.length === 0) {
    grid.innerHTML = '<p class="muted">Set up your semester dates first ⚙</p>';
    return;
  }

  var foundCurrent = false;
  weeks.forEach(function(week) {
    var load = getWeekLoad(week);
    var cls = classifyWeek(load);
    var tile = document.createElement('div');
    tile.className = 'week-tile ' + cls;

    if (isPast(week)) tile.classList.add('past');
    if (isCurrentWeek(week)) {
      tile.classList.add('current');
      foundCurrent = true;
      document.getElementById('currentWeek').textContent = week.num;
    }
    if (cls === 'boss') tile.classList.add('boss-week');

    var deadlines = getWeekDeadlines(week);
    var tooltipText = 'Week ' + week.num;
    if (deadlines.length > 0) {
      tooltipText += ': ' + deadlines.map(function(d) { return d.course + ' - ' + d.label; }).join(', ');
    }

    tile.innerHTML =
      '<span class="week-num">W' + week.num + '</span>' +
      '<span class="week-label">' + cls + '</span>' +
      '<div class="week-tooltip">' + tooltipText + '</div>';

    grid.appendChild(tile);
  });

  if (!foundCurrent && weeks.length > 0) {
    document.getElementById('currentWeek').textContent = '—';
  }
}

function renderQuests() {
  var list = document.getElementById('questList');
  var noMsg = document.getElementById('noQuests');
  list.innerHTML = '';

  var today = new Date();
  today.setHours(0,0,0,0);
  var endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

  var quests = [];

  // gather deadlines coming up in the next 7 days
  state.courses.forEach(function(course) {
    course.deadlines.forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= today && d <= endOfWeek) {
        quests.push({
          id: course.name + '|' + dl.date + '|' + dl.label,
          text: course.name + ': ' + dl.label,
          date: dl.date,
          type: dl.type
        });
      }
    });
  });

  // add daily wellness quests based on energy type
  var wellnessQuests = buildWellnessQuests();
  quests = quests.concat(wellnessQuests);

  if (quests.length === 0) {
    noMsg.style.display = 'block';
    return;
  }
  noMsg.style.display = 'none';

  // sort by date, wellness quests first for today
  quests.sort(function(a, b) {
    if (a.type === 'wellness' && b.type !== 'wellness') return -1;
    if (b.type === 'wellness' && a.type !== 'wellness') return 1;
    return a.date < b.date ? -1 : 1;
  });

  quests.forEach(function(q) {
    var li = document.createElement('li');
    var done = state.completedQuests.indexOf(q.id) !== -1;
    if (done) li.classList.add('done');

    var label = document.createElement('span');
    label.textContent = q.text;

    var btn = document.createElement('button');
    btn.className = 'quest-check';
    btn.textContent = done ? '✓' : '';
    btn.onclick = function() { toggleQuest(q.id); };

    li.appendChild(label);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function buildWellnessQuests() {
  var today = todayStr();
  var quests = [];
  var prefix = 'wellness|' + today + '|';

  // everyone gets these
  quests.push({ id: prefix + 'water', text: '💧 Drink water (8 glasses)', date: today, type: 'wellness' });
  quests.push({ id: prefix + 'meal', text: '🍽 Eat a real meal', date: today, type: 'wellness' });

  if (state.energyType === 'morning') {
    quests.push({ id: prefix + 'morning-study', text: '📖 Deep study block (morning)', date: today, type: 'wellness' });
    quests.push({ id: prefix + 'evening-wind', text: '🌙 Wind down by 10pm', date: today, type: 'wellness' });
  } else if (state.energyType === 'night') {
    quests.push({ id: prefix + 'night-study', text: '📖 Deep study block (evening)', date: today, type: 'wellness' });
    quests.push({ id: prefix + 'sleep-in', text: '😴 No alarm — sleep full cycle', date: today, type: 'wellness' });
  } else {
    quests.push({ id: prefix + 'afternoon-study', text: '📖 Deep study block (afternoon)', date: today, type: 'wellness' });
    quests.push({ id: prefix + 'break', text: '🚶 Take a 15min break outside', date: today, type: 'wellness' });
  }

  quests.push({ id: prefix + 'move', text: '🏃 Move your body (any exercise)', date: today, type: 'wellness' });
  return quests;
}

function renderBossFights() {
  var list = document.getElementById('bossList');
  var noMsg = document.getElementById('noBosses');
  list.innerHTML = '';

  var today = new Date();
  today.setHours(0,0,0,0);
  var bosses = [];

  state.courses.forEach(function(course) {
    course.deadlines.forEach(function(dl) {
      var d = new Date(dl.date + 'T00:00:00');
      if (d >= today && (dl.type === 'exam' || dl.type === 'project')) {
        bosses.push({ course: course.name, label: dl.label, date: dl.date, type: dl.type });
      }
    });
  });

  bosses.sort(function(a, b) { return a.date < b.date ? -1 : 1; });

  if (bosses.length === 0) {
    noMsg.style.display = 'block';
    return;
  }
  noMsg.style.display = 'none';

  bosses.slice(0, 5).forEach(function(b) {
    var li = document.createElement('li');
    var icon = b.type === 'exam' ? '☠' : '⚔';
    li.innerHTML =
      '<span>' + icon + ' ' + b.course + ' — ' + b.label + '</span>' +
      '<span class="boss-date">' + formatDate(b.date) + '</span>';
    list.appendChild(li);
  });
}

// ============ ACHIEVEMENTS ============

var achievementDefs = [
  { id: 'first-checkin', icon: '🌅', name: 'First Dawn', desc: 'Complete your first check-in' },
  { id: 'week-streak-3', icon: '🔥', name: 'On Fire', desc: '3-day check-in streak' },
  { id: 'week-streak-7', icon: '⚡', name: 'Unstoppable', desc: '7-day check-in streak' },
  { id: '5-quests', icon: '⚔', name: 'Adventurer', desc: 'Complete 5 quests' },
  { id: '20-quests', icon: '🛡', name: 'Veteran', desc: 'Complete 20 quests' },
  { id: '50-quests', icon: '👑', name: 'Legend', desc: 'Complete 50 quests' },
  { id: 'hp-full-week', icon: '💚', name: 'Iron Will', desc: 'Keep HP above 80 for 7 days' },
  { id: 'early-bird', icon: '🐦', name: 'Early Bird', desc: 'Complete all quests before noon' }
];

function checkAchievements() {
  var completed = state.completedQuests.length;
  var checkins = state.checkins.length;

  if (checkins >= 1) unlock('first-checkin');
  if (getStreak() >= 3) unlock('week-streak-3');
  if (getStreak() >= 7) unlock('week-streak-7');
  if (completed >= 5) unlock('5-quests');
  if (completed >= 20) unlock('20-quests');
  if (completed >= 50) unlock('50-quests');
}

function unlock(id) {
  if (!state.achievements[id]) {
    state.achievements[id] = true;
    store.save(state);
  }
}

function getStreak() {
  if (state.checkins.length === 0) return 0;
  var sorted = state.checkins.map(function(c) { return c.date; }).sort().reverse();
  var streak = 1;
  for (var i = 1; i < sorted.length; i++) {
    var prev = new Date(sorted[i-1] + 'T00:00:00');
    var curr = new Date(sorted[i] + 'T00:00:00');
    var diff = (prev - curr) / (1000 * 60 * 60 * 24);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function renderAchievements() {
  var grid = document.getElementById('achievementGrid');
  grid.innerHTML = '';

  achievementDefs.forEach(function(ach) {
    var div = document.createElement('div');
    var unlocked = state.achievements[ach.id];
    div.className = 'achievement ' + (unlocked ? 'unlocked' : 'locked');
    div.innerHTML = '<span class="ach-icon">' + ach.icon + '</span>' + ach.name;
    div.title = ach.desc;
    grid.appendChild(div);
  });
}

// ============ HP / XP LOGIC ============

function recalcHP() {
  // hp is based on recent check-ins
  // no check-ins = hp slowly decays from 100
  var todayCheckin = getTodayCheckin();
  if (!todayCheckin) {
    // decay 2 per day without check-in, min 20
    var daysSinceCheckin = daysSinceLastCheckin();
    state.hp = Math.max(20, 100 - (daysSinceCheckin * 5));
  } else {
    // hp comes from sleep and stress scores
    var sleepBoost = (todayCheckin.sleep - 1) * 10; // 0 to 40
    var stressPenalty = (todayCheckin.stress - 1) * 8; // 0 to 32
    var exerciseBoost = todayCheckin.exercise ? 15 : 0;
    state.hp = Math.min(100, Math.max(10, 50 + sleepBoost - stressPenalty + exerciseBoost));
  }
  store.save(state);
  updateBars();
}

function addXP(amount) {
  state.xp += amount;
  store.save(state);
  updateBars();
}

function updateBars() {
  document.getElementById('hpFill').style.width = state.hp + '%';
  document.getElementById('hpText').textContent = Math.round(state.hp);

  // xp bar wraps every 100
  var xpPercent = (state.xp % 100);
  document.getElementById('xpFill').style.width = xpPercent + '%';
  document.getElementById('xpText').textContent = state.xp;
}

function getTodayCheckin() {
  var today = todayStr();
  for (var i = 0; i < state.checkins.length; i++) {
    if (state.checkins[i].date === today) return state.checkins[i];
  }
  return null;
}

function daysSinceLastCheckin() {
  if (state.checkins.length === 0) return 0;
  var sorted = state.checkins.map(function(c) { return c.date; }).sort().reverse();
  var last = new Date(sorted[0] + 'T00:00:00');
  var now = new Date();
  return Math.floor((now - last) / (1000 * 60 * 60 * 24));
}

// ============ QUEST COMPLETION ============

function toggleQuest(id) {
  var idx = state.completedQuests.indexOf(id);
  if (idx === -1) {
    state.completedQuests.push(id);
    addXP(10);
  } else {
    state.completedQuests.splice(idx, 1);
    state.xp = Math.max(0, state.xp - 10);
  }
  store.save(state);
  checkAchievements();
  renderAll();
}

// ============ MODALS ============

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// settings
document.getElementById('settingsBtn').onclick = function() {
  document.getElementById('semStart').value = state.semStart;
  document.getElementById('semEnd').value = state.semEnd;
  document.getElementById('energyType').value = state.energyType;
  renderCourseList();
  openModal('settingsModal');
};

document.getElementById('closeSettingsModal').onclick = function() { closeModal('settingsModal'); };

document.getElementById('settingsForm').onsubmit = function(e) {
  e.preventDefault();
  state.semStart = document.getElementById('semStart').value;
  state.semEnd = document.getElementById('semEnd').value;
  state.energyType = document.getElementById('energyType').value;
  store.save(state);
  renderAll();
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

  // replace if already checked in today
  var existing = -1;
  for (var i = 0; i < state.checkins.length; i++) {
    if (state.checkins[i].date === entry.date) { existing = i; break; }
  }
  if (existing >= 0) {
    state.checkins[existing] = entry;
  } else {
    state.checkins.push(entry);
  }

  store.save(state);
  closeModal('checkinModal');
  checkAchievements();
  recalcHP();
  renderAll();
};

// courses
document.getElementById('addCourseBtn').onclick = function() {
  closeModal('settingsModal');
  document.getElementById('courseForm').reset();
  document.getElementById('deadlineList').innerHTML = '<h3>Deadlines</h3>';
  document.getElementById('diffLabel').textContent = '3';
  openModal('courseModal');
};
document.getElementById('closeCourseModal').onclick = function() {
  closeModal('courseModal');
  openModal('settingsModal');
};

document.getElementById('addDeadlineBtn').onclick = function() {
  var row = document.createElement('div');
  row.className = 'deadline-row';
  row.innerHTML =
    '<input type="text" placeholder="e.g. Midterm" required>' +
    '<input type="date" required>' +
    '<select>' +
      '<option value="assignment">Assignment</option>' +
      '<option value="exam">Exam</option>' +
      '<option value="project">Project</option>' +
    '</select>' +
    '<button type="button" class="remove-dl" title="Remove">✕</button>';
  row.querySelector('.remove-dl').onclick = function() { row.remove(); };
  document.getElementById('deadlineList').appendChild(row);
};

document.getElementById('courseForm').onsubmit = function(e) {
  e.preventDefault();
  var name = document.getElementById('courseName').value.trim();
  var diff = parseInt(document.getElementById('courseDiff').value);
  var deadlines = [];
  var rows = document.getElementById('deadlineList').querySelectorAll('.deadline-row');
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

  state.courses.push({ name: name, difficulty: diff, deadlines: deadlines });
  store.save(state);
  closeModal('courseModal');
  openModal('settingsModal');
  renderCourseList();
  renderAll();
};

// course difficulty slider label
document.getElementById('courseDiff').oninput = function() {
  document.getElementById('diffLabel').textContent = this.value;
};

// check-in slider labels
document.getElementById('sleepScore').oninput = function() {
  document.getElementById('sleepLabel').textContent = this.value;
};
document.getElementById('stressScore').oninput = function() {
  document.getElementById('stressLabel').textContent = this.value;
};

// reset
document.getElementById('resetBtn').onclick = function() {
  if (confirm('Wipe all data and start fresh?')) {
    store.nuke();
    state = freshState();
    closeModal('settingsModal');
    renderAll();
  }
};

function renderCourseList() {
  var container = document.getElementById('courseListDisplay');
  container.innerHTML = '';
  state.courses.forEach(function(course, i) {
    var div = document.createElement('div');
    div.className = 'course-chip';
    div.innerHTML =
      '<span>' + course.name + ' (diff: ' + course.difficulty + ', ' + course.deadlines.length + ' deadlines)</span>' +
      '<button class="remove-course" title="Remove">✕</button>';
    div.querySelector('.remove-course').onclick = function() {
      state.courses.splice(i, 1);
      store.save(state);
      renderCourseList();
      renderAll();
    };
    container.appendChild(div);
  });
}

// close modals on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(function(backdrop) {
  backdrop.onclick = function(e) {
    if (e.target === backdrop) backdrop.classList.remove('open');
  };
});

// ============ HELPERS ============

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatDate(dateStr) {
  var parts = dateStr.split('-');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(parts[1]) - 1] + ' ' + parseInt(parts[2]);
}

// ============ CLEAN OLD COMPLETED QUESTS ============

function cleanOldQuests() {
  // remove completed quest IDs older than 7 days so storage doesn't bloat
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  var cutoffStr = cutoff.getFullYear() + '-' + pad(cutoff.getMonth() + 1) + '-' + pad(cutoff.getDate());

  state.completedQuests = state.completedQuests.filter(function(id) {
    var parts = id.split('|');
    if (parts.length >= 2) {
      return parts[1] >= cutoffStr;
    }
    return true;
  });
  store.save(state);
}

// ============ RENDER ALL ============

function renderAll() {
  renderWeekGrid();
  renderQuests();
  renderBossFights();
  renderAchievements();
  recalcHP();
  updateBars();
}

// boot
cleanOldQuests();
renderAll();

// first time? pop settings
if (!state.semStart) {
  setTimeout(function() { openModal('settingsModal'); }, 400);
}
