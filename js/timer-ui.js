// Rest-timer UI. The RestTimer model itself lives in timer.js; this file is
// only the on-screen representations of it:
//   - the square tile on the Home screen (idle -> picking -> running -> done)
//   - the floating "Resting" pill shown on every other screen
// Both are re-renders of a single element driven by short setInterval ticks.

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
      showConfirmModal({
        title: 'Cancel this rest timer?',
        confirmLabel: 'Cancel timer',
        dismissLabel: 'Keep going',
        onConfirm: () => {
          RestTimer.cancel();
          showIdle();
        },
      });
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
