// Rest timer: lives independently of the router so it survives navigation.
// Persists its real end-timestamp (not a countdown number) so it stays
// accurate across reloads/backgrounding instead of drifting.

const TIMER_KEY = 'gym-tracker-timer-v1';
const TIMER_DONE_FLASH_MS = 5000;

function loadTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { status: 'idle', durationSec: 0, endAt: null };
}

const RestTimer = {
  state: loadTimerState(),
  wakeLock: null,
  _doneTimeout: null,

  _save() {
    localStorage.setItem(TIMER_KEY, JSON.stringify(this.state));
  },

  start(durationSec) {
    clearTimeout(this._doneTimeout);
    this.state = { status: 'running', durationSec, endAt: Date.now() + durationSec * 1000 };
    this._save();
    this._requestWakeLock();
  },

  cancel() {
    clearTimeout(this._doneTimeout);
    this.state = { status: 'idle', durationSec: 0, endAt: null };
    this._save();
    this._releaseWakeLock();
  },

  markDone() {
    this.state = { ...this.state, status: 'done' };
    this._save();
    this._releaseWakeLock();
    if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
    // Flashes green for a few seconds, then quietly returns to idle on its own.
    clearTimeout(this._doneTimeout);
    this._doneTimeout = setTimeout(() => this.cancel(), TIMER_DONE_FLASH_MS);
  },

  // seconds remaining right now, given current status
  getRemaining() {
    if (this.state.status === 'running') {
      return Math.max(0, (this.state.endAt - Date.now()) / 1000);
    }
    return 0;
  },

  isActive() {
    return this.state.status === 'running' || this.state.status === 'done';
  },

  async _requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (e) {
      // ignore — e.g. denied, or page hidden at request time
    }
  },

  _releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  },
};

// A running timer that finished while the app was closed should surface as
// "done" on next load (with the same auto-revert) rather than sitting at 0.
if (RestTimer.state.status === 'running' && RestTimer.getRemaining() <= 0) {
  RestTimer.markDone();
}

window.RestTimer = RestTimer;
