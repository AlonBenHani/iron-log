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
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <div style="width:38px"></div>
      </div>
    </div>
  `);
  header.querySelector('.back-btn').addEventListener('click', () => navigate(backHash));
  return header;
}

function exerciseCard({ exercise, stats, onClick, loggedToday = false }) {
  const hasStats = !!stats;
  const card = el(`
    <div class="exercise-card${loggedToday ? ' logged-today' : ''}" role="button" tabindex="0">
      <div class="exercise-icon">${escapeHtml(iconFor(exercise.name))}</div>
      <div class="exercise-main">
        <div class="exercise-name-row">
          <span class="exercise-name">${escapeHtml(exercise.name)}</span>
        </div>
        ${
          hasStats
            ? `<div class="exercise-sub">${fmtSetsInline(stats.lastSession.sets)}</div>`
            : `<div class="exercise-empty">No sessions yet</div>`
        }
      </div>
      <canvas class="spark-canvas"></canvas>
    </div>
  `);
  card.addEventListener('click', onClick);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  });

  const vals = hasStats
    ? stats.metric === 'reps'
      ? Store.recentTopReps(exercise.id, 7)
      : Store.recentTopWeights(exercise.id, 7)
    : [];
  if (vals.length > 1) {
    const canvas = card.querySelector('canvas');
    requestAnimationFrame(() => {
      drawSparkline(canvas, vals, { color: '#4ADE80' });
    });
  } else {
    // A single bar would just fill the whole canvas and look like a plain
    // block rather than a trend — not useful until there's real history.
    card.querySelector('canvas').remove();
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
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  function close() {
    if (!overlay.isConnected) return;
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  return { close };
}

// A styled yes/no bottom sheet — the in-app stand-in for window.confirm().
// Dismissing (close button, backdrop tap, or the dismiss button) does nothing;
// only the confirm button runs onConfirm.
function showConfirmModal({ title, message, confirmLabel = 'Confirm', dismissLabel = 'Never mind', onConfirm }) {
  const panel = el(`
    <div class="modal-panel">
      <div class="modal-header">
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      ${message ? `<div class="modal-body">${escapeHtml(message)}</div>` : ''}
      <div class="modal-actions">
        <button class="primary-btn modal-dismiss">${escapeHtml(dismissLabel)}</button>
        <button class="modal-delete-btn modal-confirm">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `);
  const { close } = showModal(panel);
  panel.querySelector('.modal-close').addEventListener('click', close);
  panel.querySelector('.modal-dismiss').addEventListener('click', close);
  panel.querySelector('.modal-confirm').addEventListener('click', () => {
    close();
    if (onConfirm) onConfirm();
  });
  return { close };
}

// A styled single-button notice — the in-app stand-in for window.alert().
function showAlertModal({ title, message, dismissLabel = 'Got it' }) {
  const panel = el(`
    <div class="modal-panel">
      <div class="modal-header">
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      ${message ? `<div class="modal-body">${escapeHtml(message)}</div>` : ''}
      <div class="modal-actions">
        <button class="primary-btn modal-dismiss">${escapeHtml(dismissLabel)}</button>
      </div>
    </div>
  `);
  const { close } = showModal(panel);
  panel.querySelector('.modal-close').addEventListener('click', close);
  panel.querySelector('.modal-dismiss').addEventListener('click', close);
  return { close };
}

// A styled text-input bottom sheet — the in-app stand-in for window.prompt().
// onConfirm(value) runs only with a non-empty trimmed value; the confirm button
// stays disabled until then, and Enter in the field submits.
function showPromptModal({
  title,
  message,
  placeholder = '',
  initialValue = '',
  confirmLabel = 'Add',
  dismissLabel = 'Cancel',
  onConfirm,
}) {
  const panel = el(`
    <div class="modal-panel">
      <div class="modal-header">
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      ${message ? `<div class="modal-body">${escapeHtml(message)}</div>` : ''}
      <input class="text-input modal-input" type="text" placeholder="${escapeHtml(
        placeholder
      )}" value="${escapeHtml(initialValue)}" />
      <div class="modal-actions">
        <button class="primary-btn modal-confirm">${escapeHtml(confirmLabel)}</button>
        <button class="link-btn modal-dismiss">${escapeHtml(dismissLabel)}</button>
      </div>
    </div>
  `);
  const { close } = showModal(panel);
  const input = panel.querySelector('.modal-input');
  const confirmBtn = panel.querySelector('.modal-confirm');
  const sync = () => {
    confirmBtn.disabled = !input.value.trim();
  };
  const submit = () => {
    const v = input.value.trim();
    if (!v) return;
    close();
    if (onConfirm) onConfirm(v);
  };
  sync();
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  confirmBtn.addEventListener('click', submit);
  panel.querySelector('.modal-close').addEventListener('click', close);
  panel.querySelector('.modal-dismiss').addEventListener('click', close);
  requestAnimationFrame(() => input.focus());
  return { close };
}

function openExerciseInfoModal(exercise, stats) {
  const s = stats.lastSession;
  const panel = el(`
    <div class="modal-panel">
      <div class="modal-header">
        <h2 class="modal-title">${escapeHtml(exercise.name)}</h2>
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
    showConfirmModal({
      title: `Delete ${exercise.name}?`,
      message: 'This removes the exercise and every session logged for it. This cannot be undone.',
      confirmLabel: 'Delete',
      dismissLabel: 'Keep it',
      onConfirm: () => {
        Store.deleteExercise(exercise.id);
        close();
        render();
      },
    });
  });
}
