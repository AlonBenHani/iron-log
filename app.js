// View rendering + routing for the Gym Progression Tracker.
// Hash-based router: #/today, #/log, #/log/:id, #/progress, #/progress/:id

function iconFor(name) {
  return name.trim().charAt(0).toUpperCase();
}

const FEELING_LABELS = { easy: 'Easy', sababa: 'Sababa', hard: 'Hard' };

function fmtWeight(w) {
  return Number.isInteger(w) ? String(w) : w.toFixed(1);
}

function fmtSetsInline(sets) {
  // Only collapse when every set is identical: 12kg×12, 12kg×12, 12kg×12 -> 12kg×12reps×3sets.
  // The moment weight or reps varies between sets, fall back to listing each set plainly.
  const allSame = sets.every((s) => s.weight === sets[0].weight && s.reps === sets[0].reps);
  if (allSame && sets.length > 1) {
    return `${fmtWeight(sets[0].weight)}kg×${sets[0].reps}reps×${sets.length}sets`;
  }
  return sets.map((s) => `${fmtWeight(s.weight)}kg×${s.reps}`).join(', ');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- router ----------

function parseHash() {
  const h = (location.hash || '#/today').slice(1); // strip '#'
  const parts = h.split('/').filter(Boolean);
  return { section: parts[0] || 'today', id: parts[1] || null };
}

function navigate(hash) {
  location.hash = hash;
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);

let pillIntervalId = null;

function render() {
  const { section, id } = parseHash();
  const app = document.getElementById('app');
  app.innerHTML = '';
  if (pillIntervalId) {
    clearInterval(pillIntervalId);
    pillIntervalId = null;
  }

  let content;
  if (section === 'today') content = renderToday();
  else if (section === 'today-lifts') content = renderTodayLifts();
  else if (section === 'log' && id) content = renderLogEntry(id);
  else if (section === 'log') content = renderPicker('log');
  else if (section === 'progress' && id) content = renderProgressDetail(id);
  else if (section === 'progress') content = renderPicker('progress');
  else content = renderToday();

  app.appendChild(content);
  // The Home tile already shows the running timer in full — skip the pill there.
  const pill = section === 'today' ? null : renderTimerPill();
  if (pill) app.appendChild(pill);
  app.appendChild(renderBottomNav(section === 'today-lifts' ? 'today' : section));
}

// ---------- shared pieces ----------

function renderBottomNav(activeSection) {
  const items = [
    { key: 'today', label: 'Home' },
    { key: 'log', label: 'Log' },
    { key: 'progress', label: 'Progress' },
  ];
  const activeIndex = Math.max(
    0,
    items.findIndex((it) => it.key === activeSection)
  );

  const nav = el(`
    <div class="bottom-nav">
      <div class="nav-pill">
        <div class="nav-indicator"></div>
      </div>
    </div>
  `);
  const pill = nav.querySelector('.nav-pill');
  const indicator = nav.querySelector('.nav-indicator');
  const buttons = [];
  items.forEach((it) => {
    const btn = el(
      `<button class="nav-item${it.key === activeSection ? ' active' : ''}" data-key="${it.key}">${it.label}</button>`
    );
    btn.addEventListener('click', () => navigate('/' + it.key));
    pill.appendChild(btn);
    buttons.push(btn);
  });

  function setActiveText(key) {
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.key === key));
  }
  function snapIndicatorToIndex(i) {
    indicator.style.transform = `translateX(${i * 100}%)`;
  }
  // Set initial position without animating in from the left edge.
  indicator.style.transition = 'none';
  snapIndicatorToIndex(activeIndex);
  requestAnimationFrame(() => {
    indicator.style.transition = '';
  });

  function keyAtRatio(ratio) {
    const idx = Math.min(items.length - 1, Math.max(0, Math.floor(ratio * items.length)));
    return items[idx].key;
  }

  let dragKey = activeSection;

  function followFinger(clientX) {
    const rect = pill.getBoundingClientRect();
    const slotWidth = rect.width / items.length;
    // indicator's left edge follows the finger directly, clamped inside the pill
    let left = clientX - rect.left - slotWidth / 2;
    left = Math.min(rect.width - slotWidth, Math.max(0, left));
    indicator.style.transition = 'none';
    indicator.style.transform = `translateX(${left}px)`;

    const key = keyAtRatio((clientX - rect.left) / rect.width);
    if (key !== dragKey) {
      dragKey = key;
      setActiveText(key);
    }
  }

  pill.addEventListener(
    'touchstart',
    (e) => followFinger(e.touches[0].clientX),
    { passive: true }
  );
  pill.addEventListener(
    'touchmove',
    (e) => followFinger(e.touches[0].clientX),
    { passive: true }
  );
  pill.addEventListener('touchend', () => {
    const idx = items.findIndex((it) => it.key === dragKey);
    indicator.style.transition = '';
    snapIndicatorToIndex(idx);
    if (dragKey !== activeSection) navigate('/' + dragKey);
  });

  return nav;
}

function headerWithBack(title, backHash) {
  const header = el(`
    <div class="header">
      <div class="header-row">
        <button class="back-btn" aria-label="Back"><span class="back-btn-glyph">‹</span></button>
        <h1 class="page-title">${title}</h1>
        <div style="width:38px"></div>
      </div>
    </div>
  `);
  header.querySelector('.back-btn').addEventListener('click', () => navigate(backHash));
  return header;
}

function exerciseCard({ exercise, stats, onClick, onDelete }) {
  const hasStats = !!stats;
  const badgeCls = hasStats && stats.isStuck ? 'stuck' : hasStats && stats.isPR ? 'pr' : '';
  const card = el(`
    <div class="exercise-card ${badgeCls}" role="button" tabindex="0">
      <div class="exercise-icon">${iconFor(exercise.name)}</div>
      <div class="exercise-main">
        <div class="exercise-name-row">
          <span class="exercise-name">${exercise.name}</span>
          ${
            hasStats && stats.isStuck
              ? `<span class="exercise-badge stuck">${stats.stuckDays}d stuck</span>`
              : hasStats && stats.isPR
              ? `<span class="exercise-badge pr">PR</span>`
              : ''
          }
        </div>
        ${
          hasStats
            ? `<div class="exercise-sub">${fmtSetsInline(stats.lastSession.sets)}</div>`
            : `<div class="exercise-empty">No sessions yet</div>`
        }
      </div>
      ${onDelete ? '' : '<canvas class="spark-canvas"></canvas>'}
    </div>
  `);
  card.addEventListener('click', onClick);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  });

  if (onDelete) {
    const delBtn = el(`<button class="exercise-delete" aria-label="Delete ${exercise.name}">×</button>`);
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete();
    });
    card.appendChild(delBtn);
  } else {
    const vals = hasStats ? Store.recentTopWeights(exercise.id, 7) : [];
    if (vals.length > 1) {
      const canvas = card.querySelector('canvas');
      requestAnimationFrame(() => {
        drawSparkline(canvas, vals, { color: stats.isStuck ? '#F5A24B' : '#4ADE80' });
      });
    } else {
      // A single bar would just fill the whole canvas and look like a plain
      // block rather than a trend — not useful until there's real history.
      card.querySelector('canvas').remove();
    }
  }
  return card;
}

// ---------- Modal (bottom sheet) ----------

function showModal(contentEl, onClose) {
  const overlay = el(`<div class="modal-overlay"></div>`);
  overlay.appendChild(contentEl);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  function close() {
    overlay.remove();
    if (onClose) onClose();
  }
  document.body.appendChild(overlay);
  return { close };
}

function openExerciseInfoModal(exercise, stats) {
  const s = stats.lastSession;
  const panel = el(`
    <div class="modal-panel">
      <div class="modal-header">
        <h2 class="modal-title">${exercise.name}</h2>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <div class="recall-label">Logged · ${fmtDateShort(s.date)}</div>
        <div class="recall-sets" style="margin-bottom:12px;">${fmtSetsInline(s.sets)}</div>
        ${
          s.feeling || s.note
            ? `<div class="history-meta" style="margin-top:2px;">
                ${s.feeling ? `<span class="feeling-tag ${s.feeling}">${FEELING_LABELS[s.feeling]}</span>` : ''}
                ${s.note ? `<span class="history-note">${escapeHtml(s.note)}</span>` : ''}
              </div>`
            : ''
        }
      </div>
      <div class="modal-actions">
        <button class="link-btn modal-edit">Edit this entry</button>
        <button class="modal-delete-btn">Delete exercise</button>
      </div>
    </div>
  `);
  const { close } = showModal(panel);
  panel.querySelector('.modal-close').addEventListener('click', close);
  panel.querySelector('.modal-edit').addEventListener('click', () => {
    close();
    navigate('/log/' + exercise.id);
  });
  panel.querySelector('.modal-delete-btn').addEventListener('click', () => {
    if (confirm(`Delete "${exercise.name}"? This also removes its logged history.`)) {
      Store.deleteExercise(exercise.id);
      close();
      render();
    }
  });
}

// ---------- Rest timer ----------
// The timer lives entirely inside one square tile — no popup. It moves
// through idle -> picking (scroll wheel) -> running (clock face + hand)
// -> done (green flash) -> idle, all as re-renders of the same element.

const TIMER_PICKER_OPTIONS = [];
for (let s = 15; s <= 300; s += 15) TIMER_PICKER_OPTIONS.push(s);
const TIMER_PICKER_ITEM_H = 40;
const TIMER_PICKER_DEFAULT_SEC = 120;

function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function mountRestTimerTile(tile) {
  let intervalId = null;
  function stopTicking() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function showIdle() {
    stopTicking();
    tile.className = 'tile timer-tile';
    tile.innerHTML = `
      <div class="tile-icon timer-tile-icon"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"></circle></svg></div>
      <div class="tile-label">Rest Timer</div>
      <div class="tile-sub">Tap to set</div>
    `;
    tile.onclick = showPicking;
  }

  function showPicking() {
    stopTicking();
    tile.onclick = null;
    tile.className = 'tile timer-tile picking';
    tile.innerHTML = `
      <div class="timer-picker-area">
        <div class="timer-picker-scroll"></div>
        <div class="timer-picker-bar"></div>
      </div>
      <button class="timer-picker-start">Start</button>
    `;
    const area = tile.querySelector('.timer-picker-area');
    const scroller = tile.querySelector('.timer-picker-scroll');
    TIMER_PICKER_OPTIONS.forEach((sec) => {
      const item = document.createElement('div');
      item.className = 'timer-picker-item';
      item.textContent = fmtClock(sec);
      scroller.appendChild(item);
    });

    let selectedSec = TIMER_PICKER_DEFAULT_SEC;
    function updateSelection() {
      const idx = Math.round(scroller.scrollTop / TIMER_PICKER_ITEM_H);
      const clamped = Math.max(0, Math.min(TIMER_PICKER_OPTIONS.length - 1, idx));
      selectedSec = TIMER_PICKER_OPTIONS[clamped];
      [...scroller.children].forEach((child, i) => child.classList.toggle('active', i === clamped));
    }

    // Pad top/bottom so the first/last options can still reach the centered
    // selection bar, the same trick a native scroll-wheel picker uses.
    requestAnimationFrame(() => {
      const pad = area.clientHeight / 2 - TIMER_PICKER_ITEM_H / 2;
      scroller.style.paddingTop = pad + 'px';
      scroller.style.paddingBottom = pad + 'px';
      const defaultIdx = TIMER_PICKER_OPTIONS.indexOf(TIMER_PICKER_DEFAULT_SEC);
      scroller.scrollTop = defaultIdx * TIMER_PICKER_ITEM_H;
      updateSelection();
    });

    let scrollScheduled = false;
    scroller.addEventListener(
      'scroll',
      () => {
        if (scrollScheduled) return;
        scrollScheduled = true;
        requestAnimationFrame(() => {
          updateSelection();
          scrollScheduled = false;
        });
      },
      { passive: true }
    );

    tile.querySelector('.timer-picker-start').addEventListener('click', (e) => {
      // Without this, the click bubbling up to `tile` fires the cancel
      // handler that showRunning() just wired up on the very same event.
      e.stopPropagation();
      RestTimer.start(selectedSec);
      showRunning();
    });
  }

  // A flip-clock-style digit: flips down to reveal a new value whenever it changes.
  function createFlipDigit(initialChar) {
    const box = document.createElement('div');
    box.className = 'flip-digit-box';
    const face = document.createElement('span');
    face.className = 'flip-digit-face';
    face.textContent = initialChar;
    box.appendChild(face);
    let current = initialChar;
    function set(newChar) {
      if (newChar === current) return;
      current = newChar;
      face.classList.add('flip-out');
      setTimeout(() => {
        face.textContent = newChar;
        face.classList.remove('flip-out');
        face.classList.add('flip-in');
        requestAnimationFrame(() => requestAnimationFrame(() => face.classList.remove('flip-in')));
      }, 150);
    }
    return { el: box, set };
  }

  function showRunning() {
    stopTicking();
    tile.className = 'tile timer-tile running';
    tile.innerHTML = '';

    const clock = document.createElement('div');
    clock.className = 'flip-clock';
    const dMin = createFlipDigit('0');
    const colon = document.createElement('div');
    colon.className = 'flip-colon';
    colon.textContent = ':';
    const dSecTens = createFlipDigit('0');
    const dSecUnits = createFlipDigit('0');
    clock.append(dMin.el, colon, dSecTens.el, dSecUnits.el);
    tile.appendChild(clock);

    tile.onclick = () => {
      if (confirm('Cancel this rest timer?')) {
        RestTimer.cancel();
        showIdle();
      }
    };

    function tick() {
      if (!RestTimer.isActive()) {
        showIdle();
        return;
      }
      if (RestTimer.state.status === 'running' && RestTimer.getRemaining() <= 0) {
        RestTimer.markDone();
      }
      if (RestTimer.state.status === 'done') {
        showDone();
        return;
      }
      const remaining = Math.max(0, Math.ceil(RestTimer.getRemaining()));
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      dMin.set(String(m));
      dSecTens.set(String(Math.floor(s / 10)));
      dSecUnits.set(String(s % 10));
    }
    tick();
    intervalId = setInterval(tick, 200);
  }

  function showDone() {
    stopTicking();
    tile.onclick = null;
    tile.className = 'tile timer-tile done';
    tile.innerHTML = `<div class="timer-done-label">Done!</div>`;
    // RestTimer auto-resets to idle ~5s after finishing; just watch for that.
    intervalId = setInterval(() => {
      if (!RestTimer.isActive()) showIdle();
    }, 400);
  }

  if (RestTimer.state.status === 'done') showDone();
  else if (RestTimer.isActive()) showRunning();
  else showIdle();
}

function renderRestTimerTile() {
  const tile = el(`<div class="tile timer-tile"></div>`);
  mountRestTimerTile(tile);
  return tile;
}

function renderTimerPill() {
  if (!RestTimer.isActive()) return null;

  const circumference = 2 * Math.PI * 15.5;
  const pill = el(`
    <button class="timer-pill">
      <span class="timer-pill-ring">
        <svg viewBox="0 0 36 36">
          <circle class="timer-pill-track" cx="18" cy="18" r="15.5"></circle>
          <circle class="timer-pill-progress" cx="18" cy="18" r="15.5"
            style="stroke-dasharray:${circumference};"></circle>
        </svg>
      </span>
      <span class="timer-pill-text">
        <span class="timer-pill-time">0:00</span>
        <span class="timer-pill-label">Resting</span>
      </span>
    </button>
  `);
  // No expand-to-overlay anymore — tapping just takes you to the Home tile.
  pill.addEventListener('click', () => navigate('/today'));

  const timeEl = pill.querySelector('.timer-pill-time');
  const labelEl = pill.querySelector('.timer-pill-label');
  const progressEl = pill.querySelector('.timer-pill-progress');

  function tick() {
    if (!RestTimer.isActive()) {
      clearInterval(pillIntervalId);
      pillIntervalId = null;
      pill.remove();
      return;
    }
    if (RestTimer.state.status === 'running' && RestTimer.getRemaining() <= 0) {
      RestTimer.markDone();
    }
    pill.classList.toggle('done', RestTimer.state.status === 'done');
    if (RestTimer.state.status === 'done') {
      timeEl.textContent = 'Done';
      labelEl.textContent = 'Resting';
      progressEl.style.strokeDashoffset = 0;
      return;
    }
    const remaining = RestTimer.getRemaining();
    const total = RestTimer.state.durationSec || 1;
    const ratio = Math.max(0, Math.min(1, remaining / total));
    progressEl.style.strokeDashoffset = circumference * (1 - ratio);
    timeEl.textContent = fmtClock(remaining);
    labelEl.textContent = 'Resting';
  }
  tick();
  pillIntervalId = setInterval(tick, 250);

  return pill;
}

// ---------- Today view ----------

function renderToday() {
  const wrap = el(`<div style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>`);

  const header = el(`
    <div class="header">
      <div class="header-row">
        <div>
          <p class="greeting-eyebrow">${greeting()},</p>
          <h1 class="greeting-name">Alonzo</h1>
          <p class="date-line">Today · ${new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'short',
            day: 'numeric',
          })}</p>
        </div>
      </div>
    </div>
  `);

  const weekDates = Store.getWeekDates();
  const loggedDates = Store.loggedDatesThisWeek();
  const dayStrip = el(`<div class="day-strip"></div>`);
  weekDates.forEach((iso) => {
    const d = new Date(iso + 'T00:00:00');
    const label = d.toLocaleDateString('en-US', { weekday: 'narrow' });
    const dot = el(`
      <div class="day-dot-wrap">
        <span class="day-label">${label}</span>
        <span class="day-dot${loggedDates.has(iso) ? ' logged' : ''}"></span>
      </div>
    `);
    dayStrip.appendChild(dot);
  });
  header.appendChild(dayStrip);
  wrap.appendChild(header);

  const fixedSection = el(`<div class="fixed-section"></div>`);

  const sessionsThisWeek = loggedDates.size;
  const consistencyPct = Math.min(100, Math.round((sessionsThisWeek / WEEKLY_GOAL) * 100));

  const exercises = Store.getExercises();
  const withStats = exercises
    .map((ex) => ({ ex, stats: Store.getStats(ex.id) }))
    .filter((x) => x.stats);
  const prCount = withStats.filter((x) => x.stats.isPR).length;

  const tileGrid = el(`
    <div class="tile-grid">
      <div class="tile stat-tile consistency-tile">
        <div class="stat-icon-row"><span class="stat-icon">📈</span> Consistency</div>
        <div class="stat-big">${consistencyPct}<span style="font-size:14px;color:var(--text-muted)">%</span></div>
        <div class="stat-sub">${sessionsThisWeek}/${WEEKLY_GOAL} days this week</div>
        <div class="bar-track consistency-bar"><div class="bar-fill" style="width:${consistencyPct}%"></div></div>
      </div>
      <div class="tile stat-tile">
        <div class="stat-icon-row"><span class="stat-icon">📅</span> Sessions</div>
        <div class="stat-big">${sessionsThisWeek}<span style="font-size:14px;color:var(--text-muted)"> /${WEEKLY_GOAL}</span></div>
        <div class="stat-sub">days this week</div>
      </div>
      <div class="tile stat-tile">
        <div class="stat-icon-row"><span class="stat-icon">🏆</span> PRs</div>
        <div class="stat-big">${prCount}</div>
        <div class="stat-sub">current bests</div>
      </div>
    </div>
  `);
  tileGrid.appendChild(renderRestTimerTile());
  fixedSection.appendChild(tileGrid);

  const loggedToday = withStats.filter((x) => x.stats.lastSession.date === todayISO());
  const todayLiftsLink = el(`
    <button class="card today-lifts-link">
      <div class="row-between">
        <div>
          <p class="card-title" style="margin-bottom:2px;">Today's Lifts</p>
          <p class="card-subtitle" style="margin-bottom:0;">${
            loggedToday.length
              ? `${loggedToday.length} exercise${loggedToday.length === 1 ? '' : 's'} logged today`
              : 'Nothing logged yet today'
          }</p>
        </div>
        <span class="today-lifts-arrow">›</span>
      </div>
    </button>
  `);
  todayLiftsLink.addEventListener('click', () => navigate('/today-lifts'));
  fixedSection.appendChild(todayLiftsLink);
  wrap.appendChild(fixedSection);

  return wrap;
}

// ---------- Today's Lifts (dedicated page) ----------

function renderTodayLifts() {
  const wrap = el(`<div style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>`);
  wrap.appendChild(headerWithBack("Today's Lifts", '/today'));

  const content = el(`<div class="content"></div>`);
  const loggedToday = Store.getExercises()
    .map((ex) => ({ ex, stats: Store.getStats(ex.id) }))
    .filter((x) => x.stats && x.stats.lastSession.date === todayISO())
    .sort((a, b) => b.stats.lastSession.date.localeCompare(a.stats.lastSession.date));

  if (!loggedToday.length) {
    content.appendChild(
      el(`<div class="empty-state">No workouts logged today yet.<br/>Tap <b>Log</b> below to get started.</div>`)
    );
  } else {
    loggedToday.forEach(({ ex, stats }) => {
      content.appendChild(
        exerciseCard({
          exercise: ex,
          stats,
          onClick: () => openExerciseInfoModal(ex, stats),
        })
      );
    });
  }

  wrap.appendChild(content);
  return wrap;
}

// ---------- Picker (shared by Log tab & Progress tab) ----------

function renderPicker(mode) {
  const isLog = mode === 'log';
  const wrap = el(`<div style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>`);
  const header = el(`
    <div class="header">
      <h1 class="page-title">${isLog ? 'Log a workout' : 'Progress'}</h1>
      <p class="date-line">${isLog ? 'Pick an exercise to log sets' : 'Pick an exercise to see trends'}</p>
    </div>
  `);
  wrap.appendChild(header);

  const content = el(`<div class="content"></div>`);
  const searchWrap = el(`<div class="search-picker"></div>`);
  const searchInput = el(`<input class="text-input" type="text" placeholder="Search exercises" />`);
  searchWrap.appendChild(searchInput);

  if (isLog) {
    const addBtn = el(`<button class="link-btn">+ Add a new exercise</button>`);
    addBtn.addEventListener('click', () => {
      const name = prompt('Exercise name');
      if (name && name.trim()) {
        const ex = Store.addExercise(name);
        navigate('/log/' + ex.id);
      }
    });
    searchWrap.appendChild(addBtn);
  }
  content.appendChild(searchWrap);

  const list = el(`<div style="display:flex;flex-direction:column;gap:10px;margin-top:6px;"></div>`);
  content.appendChild(list);

  function renderList(filter) {
    list.innerHTML = '';
    const exercises = Store.getExercises().filter((e) =>
      e.name.toLowerCase().includes(filter.toLowerCase())
    );
    if (!exercises.length) {
      list.appendChild(el(`<div class="empty-state">No matching exercises.</div>`));
      return;
    }
    exercises.forEach((ex) => {
      const stats = Store.getStats(ex.id);
      list.appendChild(
        exerciseCard({
          exercise: ex,
          stats,
          onClick: () => navigate(`/${mode}/${ex.id}`),
          onDelete: isLog
            ? () => {
                if (confirm(`Delete "${ex.name}"? This also removes its logged history.`)) {
                  Store.deleteExercise(ex.id);
                  renderList(searchInput.value);
                }
              }
            : undefined,
        })
      );
    });
  }
  renderList('');
  searchInput.addEventListener('input', () => renderList(searchInput.value));

  wrap.appendChild(content);
  return wrap;
}

// ---------- Log entry view ----------

function renderLogEntry(exerciseId) {
  const exercise = Store.getExercise(exerciseId);
  const wrap = el(`<div style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>`);
  if (!exercise) {
    wrap.appendChild(headerWithBack('Not found', '/log'));
    return wrap;
  }
  wrap.appendChild(headerWithBack(exercise.name, '/log'));

  const content = el(`<div class="content"></div>`);

  const allSessions = Store.getSessionsFor(exerciseId);
  const todaySession = allSessions.find((s) => s.date === todayISO()) || null;
  const priorSession = [...allSessions].reverse().find((s) => s.date !== todayISO()) || null;
  // "Last time" always means the session before today, even while editing
  // today's own entry — that's the reference point, not what's on screen.
  const lastSession = todaySession ? priorSession : Store.getLastSession(exerciseId);

  content.appendChild(
    el(`
      <div class="recall-card">
        <div class="recall-label">Last time${lastSession ? ' · ' + fmtDateShort(lastSession.date) : ''}</div>
        <div class="recall-sets">${
          lastSession ? fmtSetsInline(lastSession.sets) : 'No sessions logged yet — log your first below.'
        }</div>
      </div>
    `)
  );

  content.appendChild(el(`<p class="section-label">Today's sets</p>`));

  const setsWrap = el(`<div style="display:flex;flex-direction:column;gap:10px;"></div>`);
  content.appendChild(setsWrap);

  let rowCount = 0;
  function addSetRow(prefillWeight = '', prefillReps = '') {
    rowCount++;
    const idx = rowCount;
    const row = el(`
      <div class="set-row">
        <div class="set-index">${idx}</div>
        <div class="set-field">
          <label>Weight (kg)</label>
          <input type="number" inputmode="decimal" step="0.5" min="0" class="w-input" value="${prefillWeight}" />
        </div>
        <div class="set-field">
          <label>Reps</label>
          <input type="number" inputmode="numeric" min="0" class="r-input" value="${prefillReps}" />
        </div>
        <button class="set-remove" aria-label="Remove set">×</button>
      </div>
    `);
    row.querySelector('.set-remove').addEventListener('click', () => {
      row.remove();
      renumber();
    });

    // Most sessions use the same weight/reps across sets: editing the first
    // row live-fills every other row that hasn't been edited by hand.
    // Touching a row directly "unlocks" it from further auto-fill.
    const wInput = row.querySelector('.w-input');
    const rInput = row.querySelector('.r-input');
    function onFieldInput() {
      if (row === setsWrap.firstElementChild) {
        [...setsWrap.querySelectorAll('.set-row')].forEach((r) => {
          if (r === row || r.dataset.dirty === 'true') return;
          r.querySelector('.w-input').value = wInput.value;
          r.querySelector('.r-input').value = rInput.value;
        });
      } else {
        row.dataset.dirty = 'true';
      }
    }
    wInput.addEventListener('input', onFieldInput);
    rInput.addEventListener('input', onFieldInput);

    setsWrap.appendChild(row);
  }

  function renumber() {
    [...setsWrap.querySelectorAll('.set-row')].forEach((row, i) => {
      row.querySelector('.set-index').textContent = i + 1;
    });
  }

  const seedWeight = lastSession ? fmtWeight(Store.topSetWeight(lastSession)) : '';
  if (todaySession) {
    // Editing what's already saved for today: show exactly those sets, not a re-seeded guess.
    todaySession.sets.forEach((s) => addSetRow(fmtWeight(s.weight), s.reps));
  } else {
    for (let i = 0; i < 3; i++) {
      const priorSet = lastSession && lastSession.sets[i];
      addSetRow(priorSet ? fmtWeight(priorSet.weight) : seedWeight, priorSet ? priorSet.reps : '');
    }
  }

  const addSetBtn = el(`<button class="add-set-btn">+ Add another set</button>`);
  addSetBtn.addEventListener('click', () => {
    const first = setsWrap.firstElementChild;
    const w = first ? first.querySelector('.w-input').value || seedWeight : seedWeight;
    const r = first ? first.querySelector('.r-input').value : '';
    addSetRow(w, r);
  });
  content.appendChild(addSetBtn);

  content.appendChild(el(`<p class="section-label">How did it feel?</p>`));
  const feelings = [
    { key: 'easy', label: 'Easy' },
    { key: 'sababa', label: 'Sababa' },
    { key: 'hard', label: 'Hard' },
  ];
  const feelingWrap = el(`<div class="feeling-row"></div>`);
  let selectedFeeling = todaySession ? todaySession.feeling || null : null;
  const feelingButtons = feelings.map((f) => {
    const btn = el(
      `<button class="feeling-btn${f.key === selectedFeeling ? ' active' : ''}" data-key="${f.key}">${f.label}</button>`
    );
    btn.addEventListener('click', () => {
      selectedFeeling = selectedFeeling === f.key ? null : f.key;
      feelingButtons.forEach((b) => b.classList.toggle('active', b.dataset.key === selectedFeeling));
    });
    feelingWrap.appendChild(btn);
    return btn;
  });
  content.appendChild(feelingWrap);

  const noteInput = el(
    `<textarea class="text-input note-input" placeholder="Notes (optional) — anything about this session">${
      todaySession ? escapeHtml(todaySession.note || '') : ''
    }</textarea>`
  );
  content.appendChild(noteInput);

  const saveBtn = el(`<button class="primary-btn" style="margin-top:6px;">Save exercise</button>`);
  saveBtn.addEventListener('click', () => {
    const sets = [...setsWrap.querySelectorAll('.set-row')].map((row) => ({
      weight: row.querySelector('.w-input').value,
      reps: row.querySelector('.r-input').value,
    }));
    const saved = Store.logSession(exerciseId, sets, selectedFeeling, noteInput.value);
    if (saved) navigate('/today');
    else alert('Enter at least one set with weight and reps.');
  });
  content.appendChild(saveBtn);

  wrap.appendChild(content);
  return wrap;
}

// ---------- Progress detail view ----------

function renderProgressDetail(exerciseId) {
  const exercise = Store.getExercise(exerciseId);
  const wrap = el(`<div style="display:flex;flex-direction:column;flex:1;min-height:0;"></div>`);
  if (!exercise) {
    wrap.appendChild(headerWithBack('Not found', '/progress'));
    return wrap;
  }
  wrap.appendChild(headerWithBack(exercise.name, '/progress'));

  const content = el(`<div class="content"></div>`);
  const stats = Store.getStats(exerciseId);
  const sessions = Store.getSessionsFor(exerciseId);

  if (!stats) {
    content.appendChild(
      el(`<div class="empty-state">No sessions logged yet for ${exercise.name}.</div>`)
    );
    wrap.appendChild(content);
    return wrap;
  }

  content.appendChild(
    el(`
      <div class="card">
        <div class="big-stat">${fmtWeight(stats.maxWeight)}<span class="big-stat-unit">kg</span></div>
        <div class="big-stat-label">Current best top set</div>
      </div>
    `)
  );

  content.appendChild(
    el(`
      <div class="recall-card">
        <div class="recall-label">Last time · ${fmtDateShort(stats.lastSession.date)}</div>
        <div class="recall-sets">${fmtSetsInline(stats.lastSession.sets)}</div>
      </div>
    `)
  );

  if (stats.isStuck) {
    content.appendChild(
      el(`
        <div class="stuck-banner">
          <span>⚠️</span>
          <span>Stuck at ${fmtWeight(stats.maxWeight)}kg for ${stats.stuckDays} days. Consider a small jump or a deload.</span>
        </div>
      `)
    );
  }

  const chartCard = el(`
    <div class="card">
      <p class="card-title">Progress</p>
      <p class="card-subtitle">Average set weight per session over time.</p>
      <div class="chart-wrap"><canvas style="width:100%;height:100%;"></canvas></div>
    </div>
  `);
  content.appendChild(chartCard);
  requestAnimationFrame(() => {
    const canvas = chartCard.querySelector('canvas');
    const points = sessions.map((s) => ({ date: s.date, weight: Store.avgWeight(s) }));
    drawLineChart(canvas, points);
  });

  content.appendChild(el(`<p class="section-label">History</p>`));
  const historyCard = el(`<div class="card" style="padding:6px 16px;"></div>`);
  [...sessions].reverse().forEach((s) => {
    const hasMeta = s.feeling || s.note;
    historyCard.appendChild(
      el(`
        <div class="history-entry">
          <div class="history-row">
            <span class="history-date">${fmtDateShort(s.date)}</span>
            <span class="history-sets">${fmtSetsInline(s.sets)}</span>
          </div>
          ${
            hasMeta
              ? `<div class="history-meta">
                  ${s.feeling ? `<span class="feeling-tag ${s.feeling}">${FEELING_LABELS[s.feeling]}</span>` : ''}
                  ${s.note ? `<span class="history-note">${escapeHtml(s.note)}</span>` : ''}
                </div>`
              : ''
          }
        </div>
      `)
    );
  });
  content.appendChild(historyCard);

  wrap.appendChild(content);
  return wrap;
}
