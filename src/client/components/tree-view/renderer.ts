import { css, svg } from 'lit';

import { mediaUrl } from '@client/api';
import type { PersonRow } from '@common/types';

import type { Box, DrawnLine } from './emit';

const NAME_TRUNCATE = 22;
const avatarR = 22;
const avatarCx = 28;

// Lives with paint because dim choices are paint choices; emit receives
// them as a parameter rather than reaching back here.
export const dims = {
  boxW: 184,
  boxH: 90,
  gapX: 28,
  gapY: 70,
  tieOffset: 6
};

export const styles = css`
  .node rect.box {
    fill: var(--card);
    stroke: var(--border);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .node.focus rect.box {
    stroke: var(--accent);
    stroke-width: 2;
  }

  .node text {
    fill: var(--fg);
    font-size: 13px;
  }

  .node text.name {
    font-weight: 600;
  }

  .node text.dates {
    fill: var(--muted);
    font-size: 11px;
  }

  .node .hit {
    fill: transparent;
    cursor: pointer;
  }

  .node:hover rect.box {
    stroke: var(--accent);
  }

  .placeholder-avatar {
    fill: var(--border);
  }

  .avatar-img {
    clip-path: circle(50%);
  }

  .edge {
    stroke: var(--muted);
    stroke-width: 1.2;
    fill: none;
    vector-effect: non-scaling-stroke;
  }

  /* Focus change snaps — only opacity is animated, for fade-in of newly
     rendered nodes and edges. The Pin keeps the focused node visually fixed
     across the snap. */
  .node {
    animation: sl-enter var(--sl-anim-fade) ease-out both;
  }

  .edge {
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
`;

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
  return `${b}–${d}`;
}

export function renderBox(
  box: Box,
  person: PersonRow,
  isFocus: boolean,
  onClick: () => void
) {
  const { boxW, boxH } = dims;
  const tx = box.pos.x - boxW / 2;
  const ty = box.pos.y - boxH / 2;
  const photoSrc =
    person.photo_path === null ? null : mediaUrl(person.photo_path);
  const fullName = formatName(person);
  const name =
    fullName.length > NAME_TRUNCATE
      ? `${fullName.slice(0, NAME_TRUNCATE - 1)}…`
      : fullName;
  const dates = formatDates(person);
  return svg`
    <g
      class="node ${isFocus ? 'focus' : ''}"
      data-node-id=${box.personId}
      style="transform: translate(${tx}px, ${ty}px)"
      @click=${onClick}
    >
      <rect class="box" x="0" y="0" width=${boxW} height=${boxH} rx="6" />
      ${
        photoSrc === null
          ? svg`<circle
              class="placeholder-avatar"
              cx=${avatarCx}
              cy=${boxH / 2}
              r=${avatarR}
            />`
          : svg`<image
              class="avatar-img"
              href=${photoSrc}
              x=${avatarCx - avatarR}
              y=${boxH / 2 - avatarR}
              width=${avatarR * 2}
              height=${avatarR * 2}
              preserveAspectRatio="xMidYMid slice"
            />`
      }
      <text class="name" x="60" y=${boxH / 2 - 4}>${name}</text>
      <text class="dates" x="60" y=${boxH / 2 + 14}>${dates}</text>
      <rect class="hit" x="0" y="0" width=${boxW} height=${boxH} rx="6" />
    </g>
  `;
}

export function renderEdge(line: DrawnLine) {
  return svg`<path
    class="edge ${line.kind}"
    d="M ${line.from.x} ${line.from.y} L ${line.to.x} ${line.to.y}"
  />`;
}
