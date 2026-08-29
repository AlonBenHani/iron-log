// Reusable UI pieces: bottom nav, page header, exercise card, and the
// bottom-sheet modal. These are pure builders — they return elements and
// lean on utils.js, storage.js, and chart.js.

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
