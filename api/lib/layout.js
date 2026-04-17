// api/lib/layout.js
// Pure geometry: given the canvas dimensions, returns where each joke text block
// should be anchored and where its arrow should point. No rendering happens here.
//
// Coordinates are in canvas pixel space. Callers apply per-roast jitter themselves.

// The 4 frame jokes are assigned in order to these zones:
//   frame[0] -> TOP         (full-width horizontal strip above the photo)
//   frame[1] -> LEFT        (vertical block in left white margin, upper half)
//   frame[2] -> RIGHT-UPPER (vertical block in right white margin, upper half)
//   frame[3] -> RIGHT-LOWER (vertical block in right white margin, lower half)
//
// For a user with fewer than 4 frame jokes the first N zones are used.

export function buildFrameLayout(g, jokeCount) {
  const { canvasW, canvasH, padX, padTop, padBottom, imgW, imgH } = g;
  const photoL = padX;
  const photoT = padTop;
  const photoR = padX + imgW;
  const photoB = padTop + imgH;

  const zones = [
    {
      // TOP
      textAnchor: { x: canvasW / 2, y: padTop * 0.35, align: 'center' },
      maxWidth: canvasW - 80,
      arrowTo: { x: photoL + imgW * 0.50, y: photoT + imgH * 0.18 },
      rotationDeg: -1.5,
      arrowFromOffset: { dx: 0, dy: 24 },
    },
    {
      // LEFT (upper half of left margin)
      textAnchor: { x: 24, y: photoT + imgH * 0.30, align: 'left' },
      maxWidth: padX - 40,
      arrowTo: { x: photoL + imgW * 0.22, y: photoT + imgH * 0.45 },
      rotationDeg: 2,
      arrowFromOffset: { dx: 0, dy: 12 },
    },
    {
      // RIGHT-UPPER
      textAnchor: { x: canvasW - 24, y: photoT + imgH * 0.30, align: 'right' },
      maxWidth: padX - 40,
      arrowTo: { x: photoL + imgW * 0.82, y: photoT + imgH * 0.32 },
      rotationDeg: -2,
      arrowFromOffset: { dx: 0, dy: 12 },
    },
    {
      // RIGHT-LOWER
      textAnchor: { x: canvasW - 24, y: photoT + imgH * 0.72, align: 'right' },
      maxWidth: padX - 40,
      arrowTo: { x: photoL + imgW * 0.78, y: photoT + imgH * 0.80 },
      rotationDeg: 1.2,
      arrowFromOffset: { dx: 0, dy: -12 },
    },
  ];

  return zones.slice(0, Math.min(4, Math.max(0, jokeCount)));
}

export function getCalloutLayout(g) {
  const { padX, padTop, imgW, imgH } = g;
  // Anchored on the photo, upper-right-ish quadrant. Arrow points toward face area.
  return {
    textAnchor: {
      x: padX + imgW * 0.58,
      y: padTop + imgH * 0.22,
      align: 'center',
    },
    maxWidth: imgW * 0.55,
    arrowTo: { x: padX + imgW * 0.35, y: padTop + imgH * 0.38 },
    rotationDeg: -3,
    arrowFromOffset: { dx: 0, dy: 16 },
  };
}

export function getHeadlineLayout(g) {
  const { canvasW, canvasH, padBottom } = g;
  return {
    x: canvasW / 2,
    y: canvasH - padBottom * 0.40,
    align: 'center',
    rotationDeg: -1,
    maxWidth: canvasW - 80,
  };
}

export function getDoodleLayout(g) {
  const { padX, padTop, imgW, imgH } = g;
  return {
    x: padX + imgW * 0.22,
    y: padTop + imgH * 0.68,
    size: imgH * 0.10,
  };
}

export function getCircleTargetFrom(calloutLayout) {
  // The circle wraps the callout's arrow target point.
  return { cx: calloutLayout.arrowTo.x, cy: calloutLayout.arrowTo.y };
}
