// Hash-based router + app bootstrap. Loaded last, so every render* function
// it dispatches to (views.js, timer-ui.js, components.js) is already defined.
// Routes: #/today, #/today-lifts, #/log, #/log/:id, #/progress, #/progress/:id

function parseHash() {
  const h = (location.hash || '#/today').slice(1); // strip '#'
  const parts = h.split('/').filter(Boolean);
  return { section: parts[0] || 'today', id: parts[1] || null };
}

function navigate(hash) {
  location.hash = hash;
}

// Shared between render() and renderTimerPill() (timer-ui.js): the interval
// driving the floating "Resting" pill, cleared on every re-render.
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

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
