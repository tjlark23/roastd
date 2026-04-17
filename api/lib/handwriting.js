// api/lib/handwriting.js
// Deterministic server-side annotation renderer using handwriting fonts + Rough.js.
// Replaces Gemini's image-generation step. Called from api/roast.js when
// HANDWRITING_ENGINE=fonts (default).

import sharp from 'sharp';
import opentype from 'opentype.js';
import roughDefault from 'roughjs';
import path from 'node:path';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRng, hashString } from './rng.js';
import {
  buildFrameLayout,
  getCalloutLayout,
  getHeadlineLayout,
  getDoodleLayout,
  getCircleTargetFrom,
} from './layout.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel's @vercel/node bundler may flatten or relocate files. Try the most
// likely paths in order; first one that exists wins.
function resolveFontsDir() {
  const candidates = [
    path.join(__dirname, '..', 'fonts'),
    path.join(process.cwd(), 'api', 'fonts'),
    path.join(process.cwd(), 'fonts'),
    '/var/task/api/fonts',
  ];
  for (const c of candidates) {
    try {
      if (fsSync.existsSync(path.join(c, 'PermanentMarker-Regular.ttf'))) return c;
    } catch (_) { /* continue */ }
  }
  // Fall back to the conventional location and let opentype.js throw a
  // descriptive ENOENT including the bad path.
  return path.join(__dirname, '..', 'fonts');
}

const RED = '#d91c1c';
const HALO = '#ffffff';

// Map roast style ID to font names per tier. Headline and callout stay on
// Permanent Marker across styles; only the frame joke font varies.
const DEFAULT_MAP = { joke: 'caveat', callout: 'permanentMarker', headline: 'permanentMarker' };
const STYLE_FONT_MAP = {
  genz:         { joke: 'caveat',             callout: 'permanentMarker', headline: 'permanentMarker' },
  boomer:       { joke: 'patrickHand',        callout: 'permanentMarker', headline: 'permanentMarker' },
  shakespeare:  { joke: 'architectsDaughter', callout: 'permanentMarker', headline: 'permanentMarker' },
  asian_parent: { joke: 'patrickHand',        callout: 'permanentMarker', headline: 'permanentMarker' },
  jackson:      { joke: 'permanentMarker',    callout: 'permanentMarker', headline: 'permanentMarker' },
  coworker:     { joke: 'patrickHand',        callout: 'permanentMarker', headline: 'permanentMarker' },
  jewish_mom:   { joke: 'kalam',              callout: 'permanentMarker', headline: 'permanentMarker' },
  british:      { joke: 'architectsDaughter', callout: 'permanentMarker', headline: 'permanentMarker' },
  aussie:       { joke: 'caveat',             callout: 'permanentMarker', headline: 'permanentMarker' },
  redneck:      { joke: 'caveat',             callout: 'permanentMarker', headline: 'permanentMarker' },
};

// ─── Font loading (cached on globalThis for warm-start reuse) ─────────────────
function loadFonts() {
  if (globalThis.__roastdFonts) return globalThis.__roastdFonts;
  const dir = resolveFontsDir();
  const loadOne = (file) => {
    const p = path.join(dir, file);
    try {
      return opentype.loadSync(p);
    } catch (e) {
      const msg = `Failed to load font ${p}: ${e && e.message ? e.message : e}`;
      const err = new Error(msg);
      err.cause = e;
      throw err;
    }
  };
  const fonts = {
    permanentMarker: loadOne('PermanentMarker-Regular.ttf'),
    caveat: loadOne('Caveat-Variable.ttf'),
    patrickHand: loadOne('PatrickHand-Regular.ttf'),
    kalam: loadOne('Kalam-Regular.ttf'),
    architectsDaughter: loadOne('ArchitectsDaughter-Regular.ttf'),
  };
  globalThis.__roastdFonts = fonts;
  return fonts;
}

// ─── Rough.js generator (Node-safe API; tolerant of CJS/ESM interop shapes) ──
function getRoughGenerator() {
  if (globalThis.__roastdRough) return globalThis.__roastdRough;
  const candidates = [
    roughDefault,
    roughDefault && roughDefault.default,
    roughDefault && roughDefault.rough,
  ].filter(Boolean);
  for (const c of candidates) {
    if (typeof c?.generator === 'function') {
      globalThis.__roastdRough = c.generator();
      return globalThis.__roastdRough;
    }
  }
  // As a last resort, see if it exposes RoughGenerator class directly.
  const RG = roughDefault?.RoughGenerator || roughDefault?.default?.RoughGenerator;
  if (typeof RG === 'function') {
    globalThis.__roastdRough = new RG({}, { width: 1000, height: 1000 });
    return globalThis.__roastdRough;
  }
  throw new Error(`roughjs import shape not recognized; got keys: ${Object.keys(roughDefault || {}).join(',')}`);
}

// Convert a Rough.js Drawable's op sets into SVG <path> strings. The generator
// emits three op types: move, lineTo, bcurveTo (cubic bezier).
function drawableToPaths(drawable, { stroke = RED, strokeWidth = 3, fill = 'none' } = {}) {
  if (!drawable || !drawable.sets) return '';
  return drawable.sets
    .map(set => {
      const d = opsToPathD(set.ops);
      if (!d) return '';
      if (set.type === 'fillPath') {
        return `<path d="${d}" fill="${fill}" stroke="none" />`;
      }
      if (set.type === 'fillSketch') {
        // Hachure / sketchy fill lines — drawn as strokes.
        return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth / 2}" stroke-linecap="round" />`;
      }
      // Default: path (outline)
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');
}

function opsToPathD(ops) {
  let d = '';
  for (const op of ops) {
    if (op.op === 'move') {
      d += `M${fmt(op.data[0])},${fmt(op.data[1])} `;
    } else if (op.op === 'lineTo') {
      d += `L${fmt(op.data[0])},${fmt(op.data[1])} `;
    } else if (op.op === 'bcurveTo') {
      d += `C${fmt(op.data[0])},${fmt(op.data[1])} ${fmt(op.data[2])},${fmt(op.data[3])} ${fmt(op.data[4])},${fmt(op.data[5])} `;
    }
  }
  return d.trim();
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toString();
}

// ─── Text measurement and wrapping ────────────────────────────────────────────
function measureText(text, font, fontSize) {
  let w = 0;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    w += (glyph.advanceWidth / font.unitsPerEm) * fontSize;
  }
  return w;
}

function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = current + ' ' + words[i];
    if (measureText(test, font, fontSize) <= maxWidth) {
      current = test;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

// Pick a fontSize that lets `text` fit in the given width either as a single line
// or with wrapping; returns { fontSize, lines }.
function fitTextBlock(text, font, opts) {
  const {
    startFontSize,
    minFontSize,
    maxWidth,
    maxLines = 3,
    shrinkStep = 0.94,
  } = opts;
  let fs = startFontSize;
  let lines = wrapText(text, font, fs, maxWidth);
  while ((lines.length > maxLines || lines.some(l => measureText(l, font, fs) > maxWidth)) && fs > minFontSize) {
    fs *= shrinkStep;
    lines = wrapText(text, font, fs, maxWidth);
  }
  // Clamp at minFontSize even if we didn't fully fit — acceptable worst case.
  if (fs < minFontSize) fs = minFontSize;
  return { fontSize: fs, lines };
}

// ─── Text rendering: per-glyph SVG paths with jitter + halo ───────────────────
function renderTextLine(text, font, fontSize, rng, { color = RED, baselineJitter = 0.04, sizeJitter = 0.03, strokeHaloRatio = 0.15 } = {}) {
  let x = 0;
  const glyphPaths = [];
  for (const ch of text) {
    if (ch === ' ') {
      const glyph = font.charToGlyph(' ');
      x += (glyph.advanceWidth / font.unitsPerEm) * fontSize;
      continue;
    }
    const localSize = fontSize * (1 + (rng() * 2 - 1) * sizeJitter);
    const dy = (rng() * 2 - 1) * baselineJitter * fontSize;
    const p = font.getPath(ch, x, dy, localSize);
    glyphPaths.push(p.toPathData(2));
    const glyph = font.charToGlyph(ch);
    x += (glyph.advanceWidth / font.unitsPerEm) * localSize;
  }
  const strokeW = Math.max(3, fontSize * strokeHaloRatio);
  const inner = glyphPaths
    .map(d => `<path d="${d}" fill="${color}" stroke="${HALO}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill" />`)
    .join('');
  return { svgInner: inner, width: x };
}

function renderTextBlock(text, font, { anchor, fontSize, rotationDeg = 0, lineHeightFactor = 1.15, maxWidth, maxLines = 3, minFontSize = 16 }, rng) {
  const fit = fitTextBlock(text, font, {
    startFontSize: fontSize,
    minFontSize,
    maxWidth,
    maxLines,
  });
  const lineH = fit.fontSize * lineHeightFactor;

  // Render each line and collect widths so we can align the block.
  const rendered = fit.lines.map(line => renderTextLine(line, font, fit.fontSize, rng));
  const blockW = Math.max(...rendered.map(r => r.width));

  let dx = anchor.x;
  if (anchor.align === 'center') dx = anchor.x - blockW / 2;
  else if (anchor.align === 'right') dx = anchor.x - blockW;

  const groupParts = rendered
    .map((r, i) => {
      // Per-line horizontal alignment within the block
      let lineDx = 0;
      if (anchor.align === 'center') lineDx = (blockW - r.width) / 2;
      else if (anchor.align === 'right') lineDx = blockW - r.width;
      const lineY = i * lineH;
      return `<g transform="translate(${lineDx} ${lineY})">${r.svgInner}</g>`;
    })
    .join('');

  const svg = `<g transform="translate(${fmt(dx)} ${fmt(anchor.y)}) rotate(${fmt(rotationDeg)})">${groupParts}</g>`;
  return {
    svg,
    width: blockW,
    height: lineH * rendered.length,
    fontSize: fit.fontSize,
    lineCount: fit.lines.length,
  };
}

// ─── Arrows (Rough.js curve with white halo) ─────────────────────────────────
function renderArrow(from, to, rng, { strokeWidth = 3.5, color = RED, curvature = 0.22, roughness = 2.2 } = {}) {
  const gen = getRoughGenerator();
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const off = curvature * dist * (rng() > 0.5 ? 1 : -1) * (0.8 + rng() * 0.4);
  const cx = mx + perpX * off;
  const cy = my + perpY * off;

  const curve = gen.curve(
    [[from.x, from.y], [cx, cy], [to.x, to.y]],
    { stroke: color, strokeWidth, roughness, bowing: 1.2, seed: Math.floor(rng() * 1e9) }
  );

  // Arrowhead — two short strokes at the endpoint
  const tangent = Math.atan2(to.y - cy, to.x - cx);
  const ahLen = Math.max(12, strokeWidth * 4);
  const ahSpread = 0.55;
  const a1 = { x: to.x - Math.cos(tangent - ahSpread) * ahLen, y: to.y - Math.sin(tangent - ahSpread) * ahLen };
  const a2 = { x: to.x - Math.cos(tangent + ahSpread) * ahLen, y: to.y - Math.sin(tangent + ahSpread) * ahLen };
  const head = gen.linearPath(
    [[a1.x, a1.y], [to.x, to.y], [a2.x, a2.y]],
    { stroke: color, strokeWidth, roughness: 1.2, seed: Math.floor(rng() * 1e9) }
  );

  const haloW = strokeWidth * 2.2;
  const colored = drawableToPaths(curve, { stroke: color, strokeWidth }) + drawableToPaths(head, { stroke: color, strokeWidth });
  const haloed = drawableToPaths(curve, { stroke: HALO, strokeWidth: haloW }) + drawableToPaths(head, { stroke: HALO, strokeWidth: haloW });
  return haloed + colored;
}

// ─── Wobbly circle/ellipse on the photo ───────────────────────────────────────
function renderCircle(cx, cy, rx, ry, rng, { strokeWidth = 3.2, color = RED } = {}) {
  const gen = getRoughGenerator();
  const el = gen.ellipse(cx, cy, rx * 2, ry * 2, {
    stroke: color,
    strokeWidth,
    roughness: 2.6,
    bowing: 1.4,
    fill: undefined,
    seed: Math.floor(rng() * 1e9),
  });
  const haloW = strokeWidth * 2.2;
  const haloed = drawableToPaths(el, { stroke: HALO, strokeWidth: haloW });
  const colored = drawableToPaths(el, { stroke: color, strokeWidth });
  return haloed + colored;
}

// ─── Doodle library — picks a shape based on sketch_idea keywords ─────────────
function renderDoodle(sketchIdea, layout, rng) {
  const hint = (sketchIdea || '').toLowerCase();
  const gen = getRoughGenerator();
  const { x, y, size } = layout;
  const strokeWidth = 3;
  const haloW = strokeWidth * 2.2;

  let shape;
  let labelText = null;
  let labelOffsetY = size * 0.7;

  if (/(star|rating|review|\/\s*10|\d\/10)/.test(hint)) {
    shape = starPath(x, y, size, rng);
    const match = hint.match(/(\d+\s*\/\s*10)/);
    labelText = match ? match[1].replace(/\s+/g, '') : '2/10';
  } else if (/(speech|bubble|says|thinking|thought)/.test(hint)) {
    shape = speechBubble(x, y, size * 1.6, size, rng, gen);
    labelText = '?!';
  } else if (/(trophy|award|medal|winner)/.test(hint)) {
    shape = trophyPath(x, y, size, rng);
  } else if (/(price|tag|\$|cost|cheap|discount|sale|%\s*off)/.test(hint)) {
    shape = priceTag(x, y, size * 1.4, size * 0.8, rng);
    labelText = '$0.99';
  } else if (/(x\b|cross|wrong|no\b|nope|fail)/.test(hint)) {
    shape = bigX(x, y, size, rng);
  } else if (/(heart|love)/.test(hint)) {
    shape = heartPath(x, y, size, rng);
  } else {
    // Default fallback: small star + "lol"
    shape = starPath(x, y, size, rng);
    labelText = 'lol';
  }

  let svg = `<g>${shape}</g>`;

  if (labelText) {
    const fonts = loadFonts();
    const font = fonts.permanentMarker;
    const labelFs = size * 0.6;
    const line = renderTextLine(labelText, font, labelFs, rng);
    svg += `<g transform="translate(${fmt(x + size * 0.9)} ${fmt(y + labelOffsetY)})">${line.svgInner}</g>`;
  }

  return svg;
}

function starPath(cx, cy, size, rng) {
  const r1 = size * 0.55;
  const r2 = r1 * 0.42;
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
  }
  pts.push(pts[0]);
  const gen = getRoughGenerator();
  const d = gen.linearPath(pts, { stroke: RED, strokeWidth: 3, roughness: 2.0, seed: Math.floor(rng() * 1e9) });
  const haloed = drawableToPaths(d, { stroke: HALO, strokeWidth: 6.5 });
  const colored = drawableToPaths(d, { stroke: RED, strokeWidth: 3 });
  return haloed + colored;
}

function heartPath(cx, cy, size, rng) {
  // Two arcs + a bottom V, built as a rough path via gen.curve
  const s = size * 0.55;
  const top = [cx, cy + s * 0.2];
  const leftTop = [cx - s, cy - s * 0.3];
  const leftPeak = [cx - s * 0.55, cy - s * 0.85];
  const midTop = [cx, cy - s * 0.3];
  const rightPeak = [cx + s * 0.55, cy - s * 0.85];
  const rightTop = [cx + s, cy - s * 0.3];
  const bottom = [cx, cy + s * 1.0];
  const pts = [top, leftTop, leftPeak, midTop, rightPeak, rightTop, bottom, top];
  const gen = getRoughGenerator();
  const d = gen.linearPath(pts, { stroke: RED, strokeWidth: 3, roughness: 1.8, seed: Math.floor(rng() * 1e9) });
  const haloed = drawableToPaths(d, { stroke: HALO, strokeWidth: 6.5 });
  const colored = drawableToPaths(d, { stroke: RED, strokeWidth: 3 });
  return haloed + colored;
}

function bigX(cx, cy, size, rng) {
  const s = size * 0.6;
  const gen = getRoughGenerator();
  const a = gen.line(cx - s, cy - s, cx + s, cy + s, { stroke: RED, strokeWidth: 4, roughness: 2.4, seed: Math.floor(rng() * 1e9) });
  const b = gen.line(cx - s, cy + s, cx + s, cy - s, { stroke: RED, strokeWidth: 4, roughness: 2.4, seed: Math.floor(rng() * 1e9) });
  const haloed = drawableToPaths(a, { stroke: HALO, strokeWidth: 8.5 }) + drawableToPaths(b, { stroke: HALO, strokeWidth: 8.5 });
  const colored = drawableToPaths(a, { stroke: RED, strokeWidth: 4 }) + drawableToPaths(b, { stroke: RED, strokeWidth: 4 });
  return haloed + colored;
}

function trophyPath(cx, cy, size, rng) {
  // Simple cup shape: two handles + cup body + base
  const s = size * 0.5;
  const gen = getRoughGenerator();
  const cup = gen.polygon(
    [[cx - s * 0.8, cy - s], [cx + s * 0.8, cy - s], [cx + s * 0.55, cy + s * 0.4], [cx - s * 0.55, cy + s * 0.4]],
    { stroke: RED, strokeWidth: 3, roughness: 2.0, seed: Math.floor(rng() * 1e9) }
  );
  const base = gen.line(cx - s * 0.55, cy + s * 0.5, cx + s * 0.55, cy + s * 0.5, { stroke: RED, strokeWidth: 3, roughness: 1.8, seed: Math.floor(rng() * 1e9) });
  const stand = gen.line(cx, cy + s * 0.5, cx, cy + s * 0.85, { stroke: RED, strokeWidth: 3, roughness: 1.2, seed: Math.floor(rng() * 1e9) });
  const haloed = drawableToPaths(cup, { stroke: HALO, strokeWidth: 6.5 }) + drawableToPaths(base, { stroke: HALO, strokeWidth: 6.5 }) + drawableToPaths(stand, { stroke: HALO, strokeWidth: 6.5 });
  const colored = drawableToPaths(cup, { stroke: RED, strokeWidth: 3 }) + drawableToPaths(base, { stroke: RED, strokeWidth: 3 }) + drawableToPaths(stand, { stroke: RED, strokeWidth: 3 });
  return haloed + colored;
}

function priceTag(cx, cy, w, h, rng) {
  const gen = getRoughGenerator();
  const left = cx - w / 2;
  const top = cy - h / 2;
  const notchX = left - h * 0.3;
  const tag = gen.polygon(
    [
      [notchX, cy],
      [left, top],
      [left + w, top],
      [left + w, top + h],
      [left, top + h],
    ],
    { stroke: RED, strokeWidth: 3, roughness: 1.8, seed: Math.floor(rng() * 1e9) }
  );
  const hole = gen.circle(left - h * 0.05, cy, h * 0.14, { stroke: RED, strokeWidth: 2.5, roughness: 1.5, seed: Math.floor(rng() * 1e9) });
  const haloed = drawableToPaths(tag, { stroke: HALO, strokeWidth: 6.5 }) + drawableToPaths(hole, { stroke: HALO, strokeWidth: 5.5 });
  const colored = drawableToPaths(tag, { stroke: RED, strokeWidth: 3 }) + drawableToPaths(hole, { stroke: RED, strokeWidth: 2.5 });
  return haloed + colored;
}

function speechBubble(cx, cy, w, h, rng, gen) {
  const left = cx - w / 2;
  const top = cy - h / 2;
  const body = gen.rectangle(left, top, w, h, { stroke: RED, strokeWidth: 3, roughness: 2.0, seed: Math.floor(rng() * 1e9) });
  const tail = gen.linearPath(
    [[left + w * 0.25, top + h], [left + w * 0.15, top + h * 1.35], [left + w * 0.45, top + h]],
    { stroke: RED, strokeWidth: 3, roughness: 1.8, seed: Math.floor(rng() * 1e9) }
  );
  const haloed = drawableToPaths(body, { stroke: HALO, strokeWidth: 6.5 }) + drawableToPaths(tail, { stroke: HALO, strokeWidth: 6.5 });
  const colored = drawableToPaths(body, { stroke: RED, strokeWidth: 3 }) + drawableToPaths(tail, { stroke: RED, strokeWidth: 3 });
  return haloed + colored;
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function renderAnnotations({ framedBuffer, roastData, style, canvasGeometry }) {
  const fonts = loadFonts();
  const fontMap = STYLE_FONT_MAP[style] || DEFAULT_MAP;
  const jokeFont = fonts[fontMap.joke] || fonts[DEFAULT_MAP.joke];
  const calloutFont = fonts[fontMap.callout] || fonts[DEFAULT_MAP.callout];
  const headlineFont = fonts[fontMap.headline] || fonts[DEFAULT_MAP.headline];

  const seedBasis = String(roastData.overall_burn || '') + '|' + String(roastData.callout?.text || '') + '|' + (style || '');
  const rng = makeRng(hashString(seedBasis) || 1);

  const { canvasW, canvasH, imgW, imgH } = canvasGeometry;
  const baseFontSize = Math.round(canvasH * 0.030);
  const calloutFontSize = Math.round(canvasH * 0.040);
  const headlineFontSize = Math.round(canvasH * 0.062);

  const parts = [];

  // 1. Frame jokes
  const frameList = Array.isArray(roastData.frame) ? roastData.frame.slice(0, 4) : [];
  const frameZones = buildFrameLayout(canvasGeometry, frameList.length);
  const frameBlocks = [];
  for (let i = 0; i < frameList.length; i++) {
    const joke = frameList[i];
    const zone = frameZones[i];
    if (!zone || !joke?.text) continue;
    const block = renderTextBlock(joke.text, jokeFont, {
      anchor: zone.textAnchor,
      fontSize: baseFontSize,
      rotationDeg: zone.rotationDeg + (rng() * 2 - 1) * 1.5,
      maxWidth: zone.maxWidth,
      maxLines: 3,
      minFontSize: Math.max(14, baseFontSize * 0.70),
    }, rng);
    frameBlocks.push({ block, zone });
  }

  // 2. Arrows for frame jokes (drawn BEFORE text so text sits on top)
  for (const { block, zone } of frameBlocks) {
    const from = computeArrowStart(zone.textAnchor, block, zone.arrowFromOffset);
    const to = {
      x: zone.arrowTo.x + (rng() * 2 - 1) * 10,
      y: zone.arrowTo.y + (rng() * 2 - 1) * 10,
    };
    parts.push(renderArrow(from, to, rng));
  }

  // 3. Callout text on the photo + arrow + circle
  const callout = roastData.callout || {};
  if (callout.text) {
    const cLayout = getCalloutLayout(canvasGeometry);
    const cBlock = renderTextBlock(callout.text, calloutFont, {
      anchor: cLayout.textAnchor,
      fontSize: calloutFontSize,
      rotationDeg: cLayout.rotationDeg + (rng() * 2 - 1) * 1.5,
      maxWidth: cLayout.maxWidth,
      maxLines: 2,
      minFontSize: Math.max(18, calloutFontSize * 0.70),
    }, rng);
    const cFrom = computeArrowStart(cLayout.textAnchor, cBlock, cLayout.arrowFromOffset);
    const cTo = {
      x: cLayout.arrowTo.x + (rng() * 2 - 1) * 8,
      y: cLayout.arrowTo.y + (rng() * 2 - 1) * 8,
    };
    parts.push(renderArrow(cFrom, cTo, rng));

    // Circle around the callout's target area
    const cTarget = getCircleTargetFrom(cLayout);
    const baseR = Math.min(imgW, imgH);
    parts.push(renderCircle(cTarget.cx, cTarget.cy, baseR * 0.14, baseR * 0.08, rng));

    parts.push(cBlock.svg);
  }

  // 4. Frame text blocks drawn after their arrows
  for (const { block } of frameBlocks) parts.push(block.svg);

  // 5. Doodle
  const doodleLayout = getDoodleLayout(canvasGeometry);
  parts.push(renderDoodle(roastData.sketch_idea, doodleLayout, rng));

  // 6. Headline at bottom
  if (roastData.overall_burn) {
    const hLayout = getHeadlineLayout(canvasGeometry);
    const hBlock = renderTextBlock(roastData.overall_burn, headlineFont, {
      anchor: { x: hLayout.x, y: hLayout.y, align: hLayout.align },
      fontSize: headlineFontSize,
      rotationDeg: hLayout.rotationDeg + (rng() * 2 - 1) * 1.0,
      maxWidth: hLayout.maxWidth,
      maxLines: 2,
      minFontSize: Math.max(28, headlineFontSize * 0.70),
    }, rng);
    parts.push(hBlock.svg);
  }

  const overlaySvg = `<svg width="${canvasW}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;

  const final = await sharp(framedBuffer)
    .composite([{ input: Buffer.from(overlaySvg), left: 0, top: 0 }])
    .png()
    .toBuffer();

  return final;
}

function computeArrowStart(anchor, block, offset = { dx: 0, dy: 0 }) {
  // Approximate "bottom center" of the block as the arrow origin. For left/right
  // aligned blocks this is still visually correct enough.
  let x = anchor.x;
  if (anchor.align === 'center') x = anchor.x;
  else if (anchor.align === 'left') x = anchor.x + block.width / 2;
  else if (anchor.align === 'right') x = anchor.x - block.width / 2;
  const y = anchor.y + (offset.dy ?? 0) + block.height * 0.3;
  return { x: x + (offset.dx ?? 0), y };
}
