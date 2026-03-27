type Point = { x: number; y: number };

type RoundedDonutSliceOptions = {
  gapPx?: number;
  cornerRadiusPx?: number;
};

type RoundedDonutSliceBoundaryOptions = RoundedDonutSliceOptions & {
  pointCount?: number;
};

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function offsetAngleDeg(r: number, boundaryDeg: number, offsetPx: number): number {
  return boundaryDeg + Math.asin(Math.min(1, Math.max(-1, offsetPx / r))) * (180 / Math.PI);
}

function quadraticPoint(start: { x: number; y: number }, control: { x: number; y: number }, end: { x: number; y: number }, t: number) {
  const mt = 1 - t;
  return {
    x: mt * mt * start.x + 2 * mt * t * control.x + t * t * end.x,
    y: mt * mt * start.y + 2 * mt * t * control.y + t * t * end.y,
  };
}

function arcPoints(cx: number, cy: number, radius: number, startDeg: number, endDeg: number, segments: number) {
  const steps = Math.max(1, segments);
  return Array.from({ length: steps + 1 }, (_, index) =>
    polar(cx, cy, radius, startDeg + ((endDeg - startDeg) * index) / steps)
  );
}

function linePoints(start: { x: number; y: number }, end: { x: number; y: number }, segments: number) {
  const steps = Math.max(1, segments);
  return Array.from({ length: steps + 1 }, (_, index) => ({
    x: start.x + ((end.x - start.x) * index) / steps,
    y: start.y + ((end.y - start.y) * index) / steps,
  }));
}

function quadraticPoints(start: { x: number; y: number }, control: { x: number; y: number }, end: { x: number; y: number }, segments: number) {
  const steps = Math.max(1, segments);
  return Array.from({ length: steps + 1 }, (_, index) =>
    quadraticPoint(start, control, end, index / steps)
  );
}

function appendPoints(target: Array<{ x: number; y: number }>, points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return;
  if (target.length === 0) {
    target.push(...points);
    return;
  }
  target.push(...points.slice(1));
}

function distanceBetween(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

// Keep morph points evenly distributed around the perimeter so the collapse stays balanced.
function resampleClosedPolyline(points: Point[], pointCount: number): Point[] {
  if (points.length === 0 || pointCount <= 0) return [];
  if (points.length === 1) return Array.from({ length: pointCount }, () => points[0]);

  const segments: Array<{ start: Point; end: Point; startDistance: number; length: number }> = [];
  let perimeter = 0;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = distanceBetween(start, end);

    if (length <= 0.001) continue;

    segments.push({ start, end, startDistance: perimeter, length });
    perimeter += length;
  }

  if (segments.length === 0 || perimeter <= 0.001) {
    return Array.from({ length: pointCount }, () => points[0]);
  }

  const sampled: Point[] = [];
  let segmentIndex = 0;

  for (let sampleIndex = 0; sampleIndex < pointCount; sampleIndex += 1) {
    const sampleDistance = (perimeter * sampleIndex) / pointCount;

    while (
      segmentIndex < segments.length - 1
      && sampleDistance > segments[segmentIndex].startDistance + segments[segmentIndex].length
    ) {
      segmentIndex += 1;
    }

    const segment = segments[segmentIndex];
    const localT = Math.min(1, Math.max(0, (sampleDistance - segment.startDistance) / segment.length));
    sampled.push(lerpPoint(segment.start, segment.end, localT));
  }

  return sampled;
}

export function roundedDonutSlicePath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startBoundaryDeg: number,
  endBoundaryDeg: number,
  options: RoundedDonutSliceOptions = {},
): string {
  const halfGapPx = (options.gapPx ?? 0) / 2;

  const oStartDeg = offsetAngleDeg(outerR, startBoundaryDeg, halfGapPx);
  const oEndDeg = offsetAngleDeg(outerR, endBoundaryDeg, -halfGapPx);
  const iStartDeg = offsetAngleDeg(innerR, startBoundaryDeg, halfGapPx);
  const iEndDeg = offsetAngleDeg(innerR, endBoundaryDeg, -halfGapPx);

  const outerSweep = oEndDeg - oStartDeg;
  const innerSweep = iEndDeg - iStartDeg;
  if (outerSweep <= 0.01 || innerSweep <= 0.01) return '';

  const pOS = polar(cx, cy, outerR, oStartDeg);
  const pOE = polar(cx, cy, outerR, oEndDeg);
  const pIS = polar(cx, cy, innerR, iStartDeg);
  const pIE = polar(cx, cy, innerR, iEndDeg);

  const thickness = outerR - innerR;
  const requestedCornerRadius = options.cornerRadiusPx ?? thickness * 0.15;
  const cr = Math.min(Math.max(0, requestedCornerRadius), thickness / 2);
  const crODeg = outerR > 0 ? (cr / outerR) * (180 / Math.PI) : 0;
  const crIDeg = innerR > 0 ? (cr / innerR) * (180 / Math.PI) : 0;

  if (cr <= 0.01 || outerSweep < crODeg * 4 || innerSweep < crIDeg * 4) {
    return [
      `M ${pIS.x} ${pIS.y}`,
      `L ${pOS.x} ${pOS.y}`,
      `A ${outerR} ${outerR} 0 ${outerSweep > 180 ? 1 : 0} 1 ${pOE.x} ${pOE.y}`,
      `L ${pIE.x} ${pIE.y}`,
      `A ${innerR} ${innerR} 0 ${innerSweep > 180 ? 1 : 0} 0 ${pIS.x} ${pIS.y}`,
      'Z',
    ].join(' ');
  }

  const oS = polar(cx, cy, outerR, oStartDeg + crODeg);
  const oE = polar(cx, cy, outerR, oEndDeg - crODeg);
  const iS = polar(cx, cy, innerR, iStartDeg + crIDeg);
  const iE = polar(cx, cy, innerR, iEndDeg - crIDeg);

  const edgeStartOuter = polar(cx, cy, outerR - cr, offsetAngleDeg(outerR - cr, startBoundaryDeg, halfGapPx));
  const edgeStartInner = polar(cx, cy, innerR + cr, offsetAngleDeg(innerR + cr, startBoundaryDeg, halfGapPx));
  const edgeEndOuter = polar(cx, cy, outerR - cr, offsetAngleDeg(outerR - cr, endBoundaryDeg, -halfGapPx));
  const edgeEndInner = polar(cx, cy, innerR + cr, offsetAngleDeg(innerR + cr, endBoundaryDeg, -halfGapPx));

  const mainOSweep = outerSweep - 2 * crODeg;
  const mainISweep = innerSweep - 2 * crIDeg;

  return [
    `M ${edgeStartInner.x} ${edgeStartInner.y}`,
    `L ${edgeStartOuter.x} ${edgeStartOuter.y}`,
    `Q ${pOS.x} ${pOS.y} ${oS.x} ${oS.y}`,
    `A ${outerR} ${outerR} 0 ${mainOSweep > 180 ? 1 : 0} 1 ${oE.x} ${oE.y}`,
    `Q ${pOE.x} ${pOE.y} ${edgeEndOuter.x} ${edgeEndOuter.y}`,
    `L ${edgeEndInner.x} ${edgeEndInner.y}`,
    `Q ${pIE.x} ${pIE.y} ${iE.x} ${iE.y}`,
    `A ${innerR} ${innerR} 0 ${mainISweep > 180 ? 1 : 0} 0 ${iS.x} ${iS.y}`,
    `Q ${pIS.x} ${pIS.y} ${edgeStartInner.x} ${edgeStartInner.y}`,
    'Z',
  ].join(' ');
}

export function roundedDonutSliceBoundaryPoints(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startBoundaryDeg: number,
  endBoundaryDeg: number,
  options: RoundedDonutSliceBoundaryOptions = {},
): Array<{ x: number; y: number }> {
  const halfGapPx = (options.gapPx ?? 0) / 2;

  const oStartDeg = offsetAngleDeg(outerR, startBoundaryDeg, halfGapPx);
  const oEndDeg = offsetAngleDeg(outerR, endBoundaryDeg, -halfGapPx);
  const iStartDeg = offsetAngleDeg(innerR, startBoundaryDeg, halfGapPx);
  const iEndDeg = offsetAngleDeg(innerR, endBoundaryDeg, -halfGapPx);

  const outerSweep = oEndDeg - oStartDeg;
  const innerSweep = iEndDeg - iStartDeg;
  if (outerSweep <= 0.01 || innerSweep <= 0.01) return [];

  const pOS = polar(cx, cy, outerR, oStartDeg);
  const pOE = polar(cx, cy, outerR, oEndDeg);
  const pIS = polar(cx, cy, innerR, iStartDeg);
  const pIE = polar(cx, cy, innerR, iEndDeg);

  const thickness = outerR - innerR;
  const requestedCornerRadius = options.cornerRadiusPx ?? thickness * 0.15;
  const cr = Math.min(Math.max(0, requestedCornerRadius), thickness / 2);
  const crODeg = outerR > 0 ? (cr / outerR) * (180 / Math.PI) : 0;
  const crIDeg = innerR > 0 ? (cr / innerR) * (180 / Math.PI) : 0;

  const points: Array<{ x: number; y: number }> = [];
  const pointCount = Math.max(12, Math.round(options.pointCount ?? 40));

  if (cr <= 0.01 || outerSweep < crODeg * 4 || innerSweep < crIDeg * 4) {
    const sideSegments = Math.max(2, Math.ceil(thickness / 18));
    const outerArcSegments = Math.max(6, Math.ceil(Math.abs(outerSweep) / 12));
    const innerArcSegments = Math.max(6, Math.ceil(Math.abs(innerSweep) / 12));

    appendPoints(points, linePoints(pIS, pOS, sideSegments));
    appendPoints(points, arcPoints(cx, cy, outerR, oStartDeg, oEndDeg, outerArcSegments));
    appendPoints(points, linePoints(pOE, pIE, sideSegments));
    appendPoints(points, arcPoints(cx, cy, innerR, iEndDeg, iStartDeg, innerArcSegments));
    return resampleClosedPolyline(points, pointCount);
  }

  const oS = polar(cx, cy, outerR, oStartDeg + crODeg);
  const oE = polar(cx, cy, outerR, oEndDeg - crODeg);
  const iS = polar(cx, cy, innerR, iStartDeg + crIDeg);
  const iE = polar(cx, cy, innerR, iEndDeg - crIDeg);

  const edgeStartOuter = polar(cx, cy, outerR - cr, offsetAngleDeg(outerR - cr, startBoundaryDeg, halfGapPx));
  const edgeStartInner = polar(cx, cy, innerR + cr, offsetAngleDeg(innerR + cr, startBoundaryDeg, halfGapPx));
  const edgeEndOuter = polar(cx, cy, outerR - cr, offsetAngleDeg(outerR - cr, endBoundaryDeg, -halfGapPx));
  const edgeEndInner = polar(cx, cy, innerR + cr, offsetAngleDeg(innerR + cr, endBoundaryDeg, -halfGapPx));

  const mainOSweep = oEndDeg - oStartDeg - 2 * crODeg;
  const mainISweep = iEndDeg - iStartDeg - 2 * crIDeg;
  const outerArcSegments = Math.max(6, Math.ceil(Math.abs(mainOSweep) / 12));
  const innerArcSegments = Math.max(6, Math.ceil(Math.abs(mainISweep) / 12));
  const lineSegments = Math.max(2, Math.ceil((outerR - innerR) / 18));
  const curveSegments = 4;

  appendPoints(points, linePoints(edgeStartInner, edgeStartOuter, lineSegments));
  appendPoints(points, quadraticPoints(edgeStartOuter, pOS, oS, curveSegments));
  appendPoints(points, arcPoints(cx, cy, outerR, oStartDeg + crODeg, oEndDeg - crODeg, outerArcSegments));
  appendPoints(points, quadraticPoints(oE, pOE, edgeEndOuter, curveSegments));
  appendPoints(points, linePoints(edgeEndOuter, edgeEndInner, lineSegments));
  appendPoints(points, quadraticPoints(edgeEndInner, pIE, iE, curveSegments));
  appendPoints(points, arcPoints(cx, cy, innerR, iEndDeg - crIDeg, iStartDeg + crIDeg, innerArcSegments));
  appendPoints(points, quadraticPoints(iS, pIS, edgeStartInner, curveSegments));

  return resampleClosedPolyline(points, pointCount);
}
