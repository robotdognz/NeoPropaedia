import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PARTS_META = [
  { partNumber: 1, colorHex: '#1e40af', title: 'Matter and Energy' },
  { partNumber: 2, colorHex: '#065f46', title: 'The Earth' },
  { partNumber: 3, colorHex: '#16a34a', title: 'Life on Earth' },
  { partNumber: 4, colorHex: '#dc2626', title: 'Human Life' },
  { partNumber: 5, colorHex: '#7c3aed', title: 'Human Society' },
  { partNumber: 6, colorHex: '#ea580c', title: 'Art' },
  { partNumber: 7, colorHex: '#0891b2', title: 'Technology' },
  { partNumber: 8, colorHex: '#4338ca', title: 'Religion' },
  { partNumber: 9, colorHex: '#be185d', title: 'The History of Mankind' },
  { partNumber: 10, colorHex: '#a16207', title: 'The Branches of Knowledge' },
];

const progressPath = process.argv[2];

if (!progressPath) {
  console.error('Usage: node scripts/generate-app-icons.mjs <progress-export.json>');
  process.exit(1);
}

const projectRoot = process.cwd();
const coverageSourcePath = path.join(projectRoot, 'dist', 'home-coverage', 'iot.json');
const publicDir = path.join(projectRoot, 'public');
const iconSvgPath = path.join(publicDir, 'icon.svg');
const icon192Path = path.join(publicDir, 'icon-192.png');
const icon512Path = path.join(publicDir, 'icon-512.png');

function polar(cx, cy, radius, angleDeg) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function offsetAngleDeg(radius, boundaryDeg, offsetPx) {
  return boundaryDeg + Math.asin(Math.min(1, Math.max(-1, offsetPx / radius))) * (180 / Math.PI);
}

function roundedDonutSlicePath(cx, cy, innerR, outerR, startBoundaryDeg, endBoundaryDeg, options = {}) {
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
  const cornerRadius = Math.min(Math.max(0, requestedCornerRadius), thickness / 2);
  const crODeg = outerR > 0 ? (cornerRadius / outerR) * (180 / Math.PI) : 0;
  const crIDeg = innerR > 0 ? (cornerRadius / innerR) * (180 / Math.PI) : 0;

  if (cornerRadius <= 0.01 || outerSweep < crODeg * 4 || innerSweep < crIDeg * 4) {
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

  const edgeStartOuter = polar(cx, cy, outerR - cornerRadius, offsetAngleDeg(outerR - cornerRadius, startBoundaryDeg, halfGapPx));
  const edgeStartInner = polar(cx, cy, innerR + cornerRadius, offsetAngleDeg(innerR + cornerRadius, startBoundaryDeg, halfGapPx));
  const edgeEndOuter = polar(cx, cy, outerR - cornerRadius, offsetAngleDeg(outerR - cornerRadius, endBoundaryDeg, -halfGapPx));
  const edgeEndInner = polar(cx, cy, innerR + cornerRadius, offsetAngleDeg(innerR + cornerRadius, endBoundaryDeg, -halfGapPx));

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

function buildPartFractions(entries, checklistState) {
  const allByPart = new Map(PARTS_META.map((part) => [part.partNumber, new Set()]));
  const coveredByPart = new Map(PARTS_META.map((part) => [part.partNumber, new Set()]));

  for (const entry of entries) {
    for (const section of entry.sections) {
      allByPart.get(section.partNumber)?.add(section.sectionCode);
      if (checklistState[entry.checklistKey]) {
        coveredByPart.get(section.partNumber)?.add(section.sectionCode);
      }
    }
  }

  return PARTS_META.map((part) => {
    const total = allByPart.get(part.partNumber)?.size ?? 0;
    const covered = coveredByPart.get(part.partNumber)?.size ?? 0;
    return {
      ...part,
      covered,
      total,
      fraction: total > 0 ? covered / total : 0,
    };
  });
}

function buildSvg(segments) {
  const size = 512;
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = 200;
  const innerRadius = 118;
  const gapPx = 8;
  const cornerRadiusPx = 8;
  const segmentDegrees = 360 / segments.length;

  const clipDefs = [];
  const paths = [];

  segments.forEach((segment, index) => {
    const centerDeg = index * segmentDegrees;
    const segmentPath = roundedDonutSlicePath(
      cx,
      cy,
      innerRadius,
      outerRadius,
      centerDeg - segmentDegrees / 2,
      centerDeg + segmentDegrees / 2,
      { gapPx, cornerRadiusPx },
    );
    const fillRadius = innerRadius + segment.fraction * (outerRadius - innerRadius);
    const clipId = `seg-${index}`;

    clipDefs.push(`<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${fillRadius.toFixed(3)}" /></clipPath>`);
    paths.push(`<path d="${segmentPath}" fill="${segment.colorHex}" fill-opacity="0.16" />`);
    paths.push(`<path d="${segmentPath}" fill="${segment.colorHex}" fill-opacity="0.92" clip-path="url(#${clipId})" />`);
  });

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '  <rect width="512" height="512" rx="108" fill="white"/>',
    '  <defs>',
    ...clipDefs.map((line) => `    ${line}`),
    '  </defs>',
    ...paths.map((line) => `  ${line}`),
    '  <circle cx="256" cy="256" r="104" fill="white"/>',
    '  <text x="256" y="256" fill="#0f172a" font-family="Georgia, \'Times New Roman\', serif" font-size="146" font-weight="700" text-anchor="middle" dominant-baseline="central">P</text>',
    '</svg>',
    '',
  ].join('\n');
}

async function main() {
  const progressExport = JSON.parse(await fs.readFile(progressPath, 'utf8'));
  const coverageSource = JSON.parse(await fs.readFile(coverageSourcePath, 'utf8'));
  const checklistState = JSON.parse(progressExport.data['propaedia-reading-checklist-v1'] ?? '{}');
  const segments = buildPartFractions(coverageSource.entries, checklistState);
  const svg = buildSvg(segments);

  await fs.writeFile(iconSvgPath, svg, 'utf8');
  await execFileAsync('rsvg-convert', ['-w', '192', '-h', '192', '-o', icon192Path, iconSvgPath]);
  await execFileAsync('rsvg-convert', ['-w', '512', '-h', '512', '-o', icon512Path, iconSvgPath]);

  const summary = segments.map((segment) => `${segment.partNumber}:${segment.covered}/${segment.total}`).join(' ');
  console.log(`Updated app icons from ${path.basename(progressPath)} (${summary})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
