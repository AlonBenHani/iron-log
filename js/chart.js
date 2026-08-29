// Minimal canvas line chart + tiny bar sparkline. No external chart library
// (keeps the app dependency-free so it works fully offline once installed).

function drawLineChart(canvas, points, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 34;
  const padR = 12;
  const padT = 16;
  const padB = 24;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  const lineColor = opts.lineColor || '#4ADE80';
  const gridColor = opts.gridColor || 'rgba(245,246,248,0.08)';
  const textColor = opts.textColor || '#8B92A3';

  if (!points.length) {
    ctx.fillStyle = textColor;
    ctx.font = '13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Log a session to see progress', cssW / 2, cssH / 2);
    return;
  }

  const weights = points.map((p) => p.weight);
  let min = Math.min(...weights);
  let max = Math.max(...weights);
  if (min === max) {
    min -= 5;
    max += 5;
  } else {
    const pad = (max - min) * 0.15;
    min -= pad;
    max += pad;
  }

  // horizontal grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const gridLines = 4;
  ctx.fillStyle = textColor;
  ctx.font = '11px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridLines; i++) {
    const y = padT + (plotH * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    const val = max - ((max - min) * i) / gridLines;
    ctx.fillText(Math.round(val).toString(), padL - 8, y + 3);
  }

  const xFor = (i) =>
    points.length === 1
      ? padL + plotW / 2
      : padL + (plotW * i) / (points.length - 1);
  const yFor = (w) => padT + plotH - ((w - min) / (max - min)) * plotH;

  // line
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(p.weight);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // fill under line
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, 'rgba(74,222,128,0.25)');
  grad.addColorStop(1, 'rgba(74,222,128,0)');
  ctx.lineTo(xFor(points.length - 1), padT + plotH);
  ctx.lineTo(xFor(0), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // points
  ctx.fillStyle = lineColor;
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xFor(i), yFor(p.weight), 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Renders a tiny bar sparkline into a small canvas (the app's signature motif).
function drawSparkline(canvas, values, opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!values.length) return;

  const color = opts.color || '#4ADE80';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const gap = 3;
  const barW = (cssW - gap * (values.length - 1)) / values.length;

  values.forEach((v, i) => {
    const h = Math.max(3, ((v - min) / range) * cssH);
    const x = i * (barW + gap);
    const y = cssH - h;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.4 + (0.6 * i) / (values.length - 1 || 1);
    const r = Math.min(2, barW / 2);
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + barW - r, y);
    ctx.arcTo(x + barW, y, x + barW, y + r, r);
    ctx.lineTo(x + barW, cssH);
    ctx.lineTo(x, cssH);
    ctx.closePath();
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

window.drawLineChart = drawLineChart;
window.drawSparkline = drawSparkline;
