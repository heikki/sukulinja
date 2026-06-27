import { css, svg } from 'lit';

import { mediaUrl } from '@client/api';
import type { PersonRow } from '@common/types';

import type { Box, DrawnLine } from './emit';

const NAME_MAX_CHARS = 14;

export function formatName(p: PersonRow) {
  const given = (p.given ?? '').trim();
  const surname = (p.surname ?? '').trim();
  const joined = [given, surname].filter((s) => s.length > 0).join(' ');
  return joined.length > 0 ? joined : '—';
}

export function formatDates(p: PersonRow) {
  const b = p.birth_year ?? '';
  const d = p.death_year ?? '';
  if (b === '' && d === '') return '';
  return `${b} – ${d}`;
}

// Manual split so wrapping can use SVG <tspan>: foreignObject HTML
// rasterizes at the SVG's pixel scale and looks blurry under viewport
// fit-scale, while <text>/<tspan> stays vector through the pipeline.
function wrapName(name: string): string[] {
  if (name.length <= NAME_MAX_CHARS) return [name];
  const words = name.split(' ');
  if (words.length === 1) {
    return [`${name.slice(0, NAME_MAX_CHARS - 1)}…`];
  }
  let bestSplit = 1;
  let bestMaxLen = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ').length;
    const right = words.slice(i).join(' ').length;
    const maxLen = Math.max(left, right);
    if (maxLen < bestMaxLen) {
      bestMaxLen = maxLen;
      bestSplit = i;
    }
  }
  const line1 = words.slice(0, bestSplit).join(' ');
  const line2Raw = words.slice(bestSplit).join(' ');
  const line2 =
    line2Raw.length > NAME_MAX_CHARS
      ? `${line2Raw.slice(0, NAME_MAX_CHARS - 1)}…`
      : line2Raw;
  return [line1, line2];
}

function avatar(p: PersonRow, cx: number, cy: number, r: number) {
  const photoSrc = p.photo_path === null ? null : mediaUrl(p.photo_path);
  if (photoSrc !== null) {
    return svg`
      <image
        class="avatar-img"
        href=${photoSrc}
        x=${cx - r}
        y=${cy - r}
        width=${r * 2}
        height=${r * 2}
        preserveAspectRatio="xMidYMid slice"
      />
    `;
  }
  // The shoulder ellipse touches the bg-circle only at its bottom point;
  // anywhere else it sits inside, so no clipPath is needed.
  const headR = r * 0.32;
  const headCy = cy - r * 0.22;
  return svg`
    <circle class="silhouette-bg" cx=${cx} cy=${cy} r=${r} />
    <circle class="silhouette" cx=${cx} cy=${headCy} r=${headR} />
    <ellipse class="silhouette" cx=${cx} cy=${cy + r * 0.5} rx=${r * 0.7} ry=${r * 0.5} />
  `;
}

export function renderEdge(line: DrawnLine, isNew: boolean) {
  return svg`<path
    class="edge ${line.kind} ${isNew ? 'enter' : ''}"
    data-edge-key=${line.key}
    d="M ${line.from.x} ${line.from.y} L ${line.to.x} ${line.to.y}"
  />`;
}

// Lives with paint because dim choices are paint choices; emit receives
// them as a parameter rather than reaching back here.
export const dims = {
  boxW: 110,
  boxH: 140,
  gapX: 22,
  gapY: 60,
  tieOffset: 6
};

const avatarR = 28;
const NAME_LINE_HEIGHT = 14;
const DATES_GAP = 4;
const DATES_BASELINE_OFFSET = 9;

export function renderBox(
  box: Box,
  person: PersonRow,
  state: { focus: boolean; entering: boolean },
  onClick: () => void
) {
  const { focus, entering } = state;
  const { boxW, boxH } = dims;
  const tx = box.pos.x - boxW / 2;
  const ty = box.pos.y - boxH / 2;
  const cx = boxW / 2;
  const avatarCy = 14 + avatarR;
  const lines = wrapName(formatName(person));
  const dates = formatDates(person);
  const textRegionTop = avatarCy + avatarR + 10;
  const textRegionBottom = boxH - 14;
  const textRegionCenter = (textRegionTop + textRegionBottom) / 2;
  const blockHeight = lines.length * NAME_LINE_HEIGHT + DATES_GAP + 12;
  const blockTop = textRegionCenter - blockHeight / 2;
  const firstLineY = blockTop + 10;
  const datesY =
    blockTop +
    lines.length * NAME_LINE_HEIGHT +
    DATES_GAP +
    DATES_BASELINE_OFFSET;
  return svg`
    <g
      class="node ${focus ? 'focus' : ''} ${entering ? 'enter' : ''}"
      data-box-key=${box.key}
      style="transform: translate(${tx}px, ${ty}px)"
      @click=${onClick}
    >
      <rect class="box" x="0" y="0" width=${boxW} height=${boxH} rx="6" />
      ${avatar(person, cx, avatarCy, avatarR)}
      <text class="name" x=${cx} y=${firstLineY}>
        ${lines.map(
          (line, i) =>
            svg`<tspan x=${cx} dy=${i === 0 ? 0 : NAME_LINE_HEIGHT}>${line}</tspan>`
        )}
      </text>
      <text class="dates" x=${cx} y=${datesY}>${dates}</text>
      <rect class="hit" x="0" y="0" width=${boxW} height=${boxH} rx="6" />
    </g>
  `;
}

export const styles = css`
  .avatar-img {
    clip-path: circle(50%);
    image-rendering: -webkit-optimize-contrast;
  }
  .silhouette-bg {
    fill: #e5e7eb;
  }
  .silhouette {
    fill: #9ca3af;
  }

  .node .box {
    fill: var(--card);
    stroke: var(--border);
    stroke-width: 1.5;
  }
  .node.focus .box {
    stroke: var(--accent);
    stroke-width: 2.5;
  }
  .node .hit {
    fill: transparent;
    cursor: pointer;
  }

  .node .name {
    fill: var(--fg);
    font-size: 12px;
    font-weight: 500;
    text-anchor: middle;
    text-rendering: optimizeLegibility;
  }
  .node .dates {
    fill: var(--muted);
    font-size: 11px;
    text-anchor: middle;
    text-rendering: optimizeLegibility;
  }

  .edge {
    stroke: var(--muted);
    stroke-width: 1.2;
    fill: none;
    vector-effect: non-scaling-stroke;
  }

  /* Focus change snaps. Only nodes and edges that are newly on screen carry
     the .enter class and fade in; cards that persist across the snap stay put
     (the Pin keeps the focused card visually fixed). Existing cards must not
     fade in or out — the fade is reserved for genuinely new ones. */
  .node.enter,
  .edge.enter {
    animation: sl-enter var(--sl-anim-fade) ease-out both;
  }
  @keyframes sl-enter {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* The card-move slide and edge cross-fade are Web Animations that already
     bail under reduced motion; drop the enter-fade here to match. */
  @media (prefers-reduced-motion: reduce) {
    .node.enter,
    .edge.enter {
      animation: none;
    }
  }
`;
