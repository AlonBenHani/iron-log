// Persistence + data model for the Gym Progression Tracker.
// Everything lives in localStorage under a single namespaced key.

const STORAGE_KEY = 'gym-tracker-data-v1';
const WEEKLY_GOAL = 3; // workouts per week, Sunday–Saturday

const PRESET_EXERCISES = [
  'Bench Press',
  'Squat',
  'Deadlift',
  'Overhead Press',
  'Barbell Row',
  'Pull-up',
  'Bicep Curl',
  'Lat Pulldown',
  'Leg Press',
  'Dumbbell Shoulder Press',
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      // fall through to seed
    }
  }
  const seeded = {
    exercises: PRESET_EXERCISES.map((name) => ({ id: uid(), name, isPreset: true })),
    sessions: [],
  };
  saveData(seeded);
  return seeded;
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

const Store = {
  data: loadData(),

  save() {
    saveData(this.data);
  },

  getExercises() {
    return this.data.exercises.slice().sort((a, b) => a.name.localeCompare(b.name));
  },

  addExercise(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = this.data.exercises.find(
      (e) => e.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing;
    const ex = { id: uid(), name: trimmed, isPreset: false };
    if (looksBodyweight(trimmed)) ex.bodyweight = true;
    this.data.exercises.push(ex);
    this.save();
    return ex;
  },

  getExercise(id) {
    return this.data.exercises.find((e) => e.id === id) || null;
  },

  deleteExercise(id) {
    this.data.exercises = this.data.exercises.filter((e) => e.id !== id);
    this.data.sessions = this.data.sessions.filter((s) => s.exerciseId !== id);
    this.save();
  },

  getSessionsFor(exerciseId) {
    return this.data.sessions
      .filter((s) => s.exerciseId === exerciseId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  getLastSession(exerciseId) {
    const sessions = this.getSessionsFor(exerciseId);
    return sessions.length ? sessions[sessions.length - 1] : null;
  },

  logSession(exerciseId, sets, feeling, note) {
    // Bodyweight exercises accept a blank/zero weight (stored as 0); everything
    // else still needs a real positive weight so a mis-typed field can't slip
    // through as 0kg.
    const bw = !!(this.getExercise(exerciseId) || {}).bodyweight;
    const cleanSets = sets
      .map((s) => ({ weight: bw ? Number(s.weight) || 0 : Number(s.weight), reps: Number(s.reps) }))
      .filter((s) => s.reps > 0 && s.weight >= 0 && !Number.isNaN(s.weight) && (bw || s.weight > 0));
    if (!cleanSets.length) return null;

    const date = todayISO();
    // one session per exercise per day: overwrite if already logged today
    const existingIdx = this.data.sessions.findIndex(
      (s) => s.exerciseId === exerciseId && s.date === date
    );
    const session = {
      id: uid(),
      date,
      exerciseId,
      sets: cleanSets,
      feeling: feeling || null,
      note: (note || '').trim(),
    };
    if (existingIdx >= 0) {
      session.id = this.data.sessions[existingIdx].id;
      this.data.sessions[existingIdx] = session;
    } else {
      this.data.sessions.push(session);
    }
    this.save();
    return session;
  },

  topSetWeight(session) {
    return Math.max(...session.sets.map((s) => s.weight));
  },

  topSetReps(session) {
    return Math.max(...session.sets.map((s) => s.reps));
  },

  avgWeight(session) {
    const sum = session.sets.reduce((acc, s) => acc + s.weight, 0);
    return sum / session.sets.length;
  },

  avgReps(session) {
    const sum = session.sets.reduce((acc, s) => acc + s.reps, 0);
    return sum / session.sets.length;
  },

  // { metric, best, bestUnit, maxWeight, maxReps, sinceDate, isStuck, stuckDays,
  //   lastSession, isPR, sessionCount } or null if no sessions.
  // A bodyweight exercise that has never carried added weight is scored in
  // reps ('reps' metric); everything else is scored in kilos ('weight').
  getStats(exerciseId) {
    const sessions = this.getSessionsFor(exerciseId);
    if (!sessions.length) return null;

    const exercise = this.getExercise(exerciseId);
    const repsMode =
      !!(exercise && exercise.bodyweight) &&
      !sessions.some((s) => this.topSetWeight(s) > 0);
    const metricOf = repsMode
      ? (s) => this.topSetReps(s)
      : (s) => this.topSetWeight(s);

    let best = -Infinity;
    let sinceDate = sessions[0].date;
    for (const s of sessions) {
      const v = metricOf(s);
      if (v > best) {
        best = v;
        sinceDate = s.date;
      }
    }

    const today = todayISO();
    const stuckDays = daysBetween(sinceDate, today);
    const isStuck = stuckDays >= 30;

    const last = sessions[sessions.length - 1];
    const isPR = metricOf(last) === best && last.date === sinceDate;

    return {
      metric: repsMode ? 'reps' : 'weight',
      best,
      bestUnit: repsMode ? 'reps' : 'kg',
      maxWeight: repsMode ? 0 : best,
      maxReps: repsMode ? best : Math.max(...sessions.map((s) => this.topSetReps(s))),
      sinceDate,
      isStuck,
      stuckDays,
      lastSession: last,
      isPR: isPR && sessions.length > 1,
      sessionCount: sessions.length,
    };
  },

  sessionsLoggedOnDate(date) {
    return this.data.sessions.filter((s) => s.date === date);
  },

  // Current calendar week, Sunday through Saturday, as 7 ISO date strings.
  getWeekDates() {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay()); // getDay(): 0 = Sunday
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
  },

  loggedDatesThisWeek() {
    const weekDates = this.getWeekDates();
    const set = new Set();
    for (const iso of weekDates) {
      if (this.data.sessions.some((s) => s.date === iso)) set.add(iso);
    }
    return set;
  },

  recentTopWeights(exerciseId, n) {
    const sessions = this.getSessionsFor(exerciseId);
    return sessions.slice(-n).map((s) => this.topSetWeight(s));
  },

  recentTopReps(exerciseId, n) {
    const sessions = this.getSessionsFor(exerciseId);
    return sessions.slice(-n).map((s) => this.topSetReps(s));
  },
};

window.Store = Store;
window.todayISO = todayISO;
window.daysBetween = daysBetween;
window.WEEKLY_GOAL = WEEKLY_GOAL;
