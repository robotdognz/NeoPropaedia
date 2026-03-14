import { h } from 'preact';
import { useRef, useState } from 'preact/hooks';

export interface CircleNavigatorPart {
  partNumber: number;
  partName: string;
  title: string;
  href: string;
  colorHex: string;
}

export interface CircleNavigatorProps {
  parts: CircleNavigatorPart[];
}

const VIEWBOX_SIZE = 560;
const CENTER = VIEWBOX_SIZE / 2;
const OUTER_RADIUS = 168;
const INNER_RADIUS = 96;
const LABEL_RADIUS = 244;
const CONNECTOR_RADIUS = 192;
const SEGMENT_COUNT = 9;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;
const DEFAULT_CENTER_PART = 10;
const DRAG_DISTANCE_THRESHOLD = 6;
const INWARD_DROP_THRESHOLD = INNER_RADIUS - 10;

function polar(cx: number, cy: number, radius: number, degrees: number) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function donutSlicePath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const startOuter = polar(cx, cy, outerRadius, startAngle);
  const endOuter = polar(cx, cy, outerRadius, endAngle);
  const startInner = polar(cx, cy, innerRadius, startAngle);
  const endInner = polar(cx, cy, innerRadius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    'Z',
  ].join(' ');
}

function normalizeDegrees(value: number): number {
  let nextValue = value;

  while (nextValue <= -180) nextValue += 360;
  while (nextValue > 180) nextValue -= 360;

  return nextValue;
}

function snapRotation(value: number): number {
  return Math.round(value / SEGMENT_ANGLE) * SEGMENT_ANGLE;
}

function wrapLabel(title: string, maxLength = 17, maxLines = 3): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxLength || currentLine.length === 0) {
      currentLine = nextLine;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) lines.push(currentLine);

  if (lines.length <= maxLines) return lines;

  const nextLines = lines.slice(0, maxLines);
  nextLines[maxLines - 1] = `${nextLines[maxLines - 1]}...`;
  return nextLines;
}

function distanceFromCenter(x: number, y: number): number {
  return Math.hypot(x - CENTER, y - CENTER);
}

function angleFromPoint(x: number, y: number): number {
  return (Math.atan2(y - CENTER, x - CENTER) * 180) / Math.PI + 90;
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const bounds = svg.getBoundingClientRect();

  return {
    x: ((clientX - bounds.left) / bounds.width) * VIEWBOX_SIZE,
    y: ((clientY - bounds.top) / bounds.height) * VIEWBOX_SIZE,
  };
}

function textAnchorForAngle(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  const horizontal = Math.cos(radians);

  if (horizontal > 0.3) return 'start';
  if (horizontal < -0.3) return 'end';
  return 'middle';
}

type DragState = {
  pointerId: number;
  activePartNumber: number;
  startAngle: number;
  startRotation: number;
  startX: number;
  startY: number;
  moved: boolean;
  centered: boolean;
};

export default function CircleNavigator({ parts }: CircleNavigatorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [centerPartNumber, setCenterPartNumber] = useState(DEFAULT_CENTER_PART);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [selectedPartNumber, setSelectedPartNumber] = useState(DEFAULT_CENTER_PART);

  const centerPart = parts.find((part) => part.partNumber === centerPartNumber) ?? parts[0];
  const outerParts = parts.filter((part) => part.partNumber !== centerPartNumber);
  const normalizedRotation = ((snapRotation(rotationDegrees) % 360) + 360) % 360;
  const topIndex = Math.round(((360 - normalizedRotation) % 360) / SEGMENT_ANGLE) % outerParts.length;
  const topPart = outerParts[topIndex] ?? outerParts[0];
  const selectedPart = parts.find((part) => part.partNumber === selectedPartNumber) ?? centerPart;

  const rotatePartToTop = (partNumber: number) => {
    const partIndex = outerParts.findIndex((part) => part.partNumber === partNumber);
    if (partIndex === -1) return;

    setRotationDegrees(-partIndex * SEGMENT_ANGLE);
    setSelectedPartNumber(partNumber);
  };

  const movePartToCenter = (partNumber: number) => {
    if (partNumber === centerPartNumber) return;
    setCenterPartNumber(partNumber);
    setSelectedPartNumber(partNumber);
  };

  const finishDrag = (pointerId: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== pointerId) return;

    if (!dragState.centered) {
      setRotationDegrees((currentRotation) => snapRotation(currentRotation));

      if (!dragState.moved) {
        setSelectedPartNumber(dragState.activePartNumber);
      } else if (topPart) {
        setSelectedPartNumber(topPart.partNumber);
      }
    }

    if (svgRef.current?.hasPointerCapture(pointerId)) {
      svgRef.current.releasePointerCapture(pointerId);
    }

    dragStateRef.current = null;
  };

  const handleSegmentPointerDown = (partNumber: number) => (event: h.JSX.TargetedPointerEvent<SVGPathElement>) => {
    if (!svgRef.current) return;

    const point = svgPoint(svgRef.current, event.clientX, event.clientY);
    const startAngle = angleFromPoint(point.x, point.y);

    setSelectedPartNumber(partNumber);
    dragStateRef.current = {
      pointerId: event.pointerId,
      activePartNumber: partNumber,
      startAngle,
      startRotation: rotationDegrees,
      startX: point.x,
      startY: point.y,
      moved: false,
      centered: false,
    };

    svgRef.current.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const point = svgPoint(svgRef.current, event.clientX, event.clientY);
    const nextRadius = distanceFromCenter(point.x, point.y);
    const travelled = Math.hypot(point.x - dragState.startX, point.y - dragState.startY);

    if (travelled > DRAG_DISTANCE_THRESHOLD) {
      dragState.moved = true;
    }

    if (!dragState.centered && nextRadius <= INWARD_DROP_THRESHOLD && dragState.activePartNumber !== centerPartNumber) {
      dragState.centered = true;
      movePartToCenter(dragState.activePartNumber);
      return;
    }

    if (dragState.centered) return;

    const nextAngle = angleFromPoint(point.x, point.y);
    const delta = normalizeDegrees(nextAngle - dragState.startAngle);
    setRotationDegrees(dragState.startRotation + delta);
  };

  const handlePointerUp = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    finishDrag(event.pointerId);
  };

  const handlePointerCancel = (event: h.JSX.TargetedPointerEvent<SVGSVGElement>) => {
    finishDrag(event.pointerId);
  };

  return (
    <div class="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] xl:items-start">
      <div class="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4 sm:p-6">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          class="mx-auto aspect-square w-full max-w-[42rem] touch-none select-none"
          role="img"
          aria-label="Interactive circle navigation for the ten parts of the Propaedia"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={(event) => {
            if (dragStateRef.current?.pointerId === event.pointerId) finishDrag(event.pointerId);
          }}
        >
          <title>Interactive circle navigation for the Propaedia</title>

          <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS + 22} fill="#f8fafc" />

          {outerParts.map((part, index) => {
            const centerAngle = -90 + rotationDegrees + index * SEGMENT_ANGLE;
            const startAngle = centerAngle - SEGMENT_ANGLE / 2;
            const endAngle = centerAngle + SEGMENT_ANGLE / 2;
            const numberPosition = polar(CENTER, CENTER, 134, centerAngle);
            const connectorEnd = polar(CENTER, CENTER, CONNECTOR_RADIUS, centerAngle);
            const labelPosition = polar(CENTER, CENTER, LABEL_RADIUS, centerAngle);
            const labelLines = wrapLabel(part.title);
            const textAnchor = textAnchorForAngle(centerAngle);
            const isSelected = selectedPartNumber === part.partNumber;

            return (
              <g key={part.partNumber}>
                <path
                  d={donutSlicePath(CENTER, CENTER, INNER_RADIUS, OUTER_RADIUS, startAngle, endAngle)}
                  fill={part.colorHex}
                  stroke={isSelected ? '#0f172a' : 'white'}
                  stroke-width={isSelected ? 4 : 2}
                  opacity={isSelected ? 1 : 0.94}
                  class="cursor-grab active:cursor-grabbing transition-opacity"
                  onPointerDown={handleSegmentPointerDown(part.partNumber)}
                  onMouseEnter={() => setSelectedPartNumber(part.partNumber)}
                />

                <text
                  x={numberPosition.x}
                  y={numberPosition.y}
                  fill="white"
                  font-size="24"
                  font-family="Inter, sans-serif"
                  font-weight="700"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  pointer-events="none"
                >
                  {part.partNumber}
                </text>

                <a
                  href={part.href}
                  onMouseEnter={() => setSelectedPartNumber(part.partNumber)}
                  onFocus={() => setSelectedPartNumber(part.partNumber)}
                >
                  <line
                    x1={polar(CENTER, CENTER, OUTER_RADIUS + 6, centerAngle).x}
                    y1={polar(CENTER, CENTER, OUTER_RADIUS + 6, centerAngle).y}
                    x2={connectorEnd.x}
                    y2={connectorEnd.y}
                    stroke={isSelected ? part.colorHex : '#cbd5e1'}
                    stroke-width={isSelected ? 2.5 : 1.5}
                  />
                  <circle cx={connectorEnd.x} cy={connectorEnd.y} r={3.5} fill={part.colorHex} />
                  <text
                    x={labelPosition.x}
                    y={labelPosition.y - (labelLines.length * 8)}
                    fill={isSelected ? '#0f172a' : '#334155'}
                    font-size="11"
                    font-family="Inter, sans-serif"
                    font-weight="700"
                    letter-spacing="0.12em"
                    text-anchor={textAnchor}
                  >
                    <tspan x={labelPosition.x} dy="0">
                      {part.partName.toUpperCase()}
                    </tspan>
                    {labelLines.map((line, lineIndex) => (
                      <tspan
                        x={labelPosition.x}
                        dy={lineIndex === 0 ? 16 : 14}
                        font-size="13"
                        font-weight={isSelected ? '700' : '600'}
                        letter-spacing="0"
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </a>
              </g>
            );
          })}

          <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS - 8} fill={centerPart.colorHex} stroke="white" stroke-width="4" />
          <text
            x={CENTER}
            y={CENTER - 12}
            fill="white"
            font-size="42"
            font-family="Inter, sans-serif"
            font-weight="700"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {centerPart.partNumber}
          </text>
          <text
            x={CENTER}
            y={CENTER + 18}
            fill="white"
            font-size="13"
            font-family="Inter, sans-serif"
            font-weight="700"
            text-anchor="middle"
            letter-spacing="0.12em"
          >
            {centerPart.partName.toUpperCase()}
          </text>
        </svg>
      </div>

      <div class="space-y-4">
        <div class="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p class="text-sm font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            Selected Part
          </p>
          <h3 class="mt-3 text-2xl font-serif font-bold text-slate-900">
            {selectedPart.partName}: {selectedPart.title}
          </h3>

          <div class="mt-5 space-y-3 text-sm leading-7 text-slate-600">
            <p>
              <span class="font-semibold text-slate-800">At the top:</span> {topPart.partName}: {topPart.title}
            </p>
            <p>
              <span class="font-semibold text-slate-800">At the centre:</span> {centerPart.partName}: {centerPart.title}
            </p>
          </div>

          <div class="mt-6 flex flex-wrap gap-2">
            <a
              href={selectedPart.href}
              class="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Open {selectedPart.partName}
            </a>

            {selectedPart.partNumber !== centerPartNumber && (
              <button
                type="button"
                onClick={() => movePartToCenter(selectedPart.partNumber)}
                class="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Move to centre
              </button>
            )}

            {selectedPart.partNumber !== centerPartNumber && selectedPart.partNumber !== topPart.partNumber && (
              <button
                type="button"
                onClick={() => rotatePartToTop(selectedPart.partNumber)}
                class="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Rotate to top
              </button>
            )}
          </div>
        </div>

        <div class="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p class="text-sm font-sans font-semibold uppercase tracking-[0.18em] text-slate-500">
            How to use the circle
          </p>
          <ul class="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            <li>Drag any outer segment around the ring to rotate the order of the parts.</li>
            <li>Pull an outer segment inward toward the centre to make that part the middle of the circle.</li>
            <li>Use the floating labels or the selected-part controls to open any part directly.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
