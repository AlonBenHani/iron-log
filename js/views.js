// The five screens the router can show. Each returns a detached element tree
// that router.js drops into #app. They pull data from Store, build markup with
// helpers from utils.js/components.js, and draw canvases via chart.js.

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
      el(`<div class="empty-state">No sessions logged yet for ${escapeHtml(exercise.name)}.</div>`)
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
