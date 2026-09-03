// Small formatting + DOM helpers shared across every view.

function iconFor(name) {
  return name.trim().charAt(0).toUpperCase();
}

const FEELING_LABELS = { easy: 'Easy', sababa: 'Sababa', hard: 'Hard' };

function fmtWeight(w) {
  return Number.isInteger(w) ? String(w) : w.toFixed(1);
}

// Movements normally done at bodyweight — used to surface the "Bodyweight"
// toggle only where it makes sense, and to default new exercises to it.
function looksBodyweight(name) {
  return /pull[- ]?up|chin[- ]?up|\bdips?\b|push[- ]?up|\bplank|muscle[- ]?up|pistol|sit[- ]?up|leg raise|hanging|inverted row|hyperextension|nordic|air squat|burpee/i.test(
    name
  );
}

// One set as text: a zero-weight set is bodyweight ("BW×10"), else "40kg×10".
function fmtSet(s) {
  return s.weight > 0 ? `${fmtWeight(s.weight)}kg×${s.reps}` : `BW×${s.reps}`;
}

function fmtSetsInline(sets) {
  // Only collapse when every set is identical: 12kg×12, 12kg×12, 12kg×12 -> 12kg×12reps×3sets.
  // The moment weight or reps varies between sets, fall back to listing each set plainly.
  const allSame = sets.every((s) => s.weight === sets[0].weight && s.reps === sets[0].reps);
  if (allSame && sets.length > 1) {
    const each =
      sets[0].weight > 0
        ? `${fmtWeight(sets[0].weight)}kg×${sets[0].reps}reps`
        : `BW×${sets[0].reps}reps`;
    return `${each}×${sets.length}sets`;
  }
  return sets.map(fmtSet).join(', ');
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
