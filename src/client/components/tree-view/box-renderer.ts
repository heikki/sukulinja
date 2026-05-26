// One person box: the dimensions/gaps that decide the slot pitch (forwarded
// to emit via the EmitTheme fields) and the render function that paints
// each <rect> at those dimensions. Caller composes per-box context
// (person, focus state, click handler) at the call site.

import { svg } from 'lit';

import { mediaUrl } from '@client/api';
import type { PersonRow } from '@common/types';

import type { Box } from './emit';

const NAME_TRUNCATE = 22;

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

export const boxRenderer = {
  boxW: 184,
  boxH: 90,
  gapX: 28,
  gapY: 70,
  nonprimaryTieYOffset: 6,
  avatarR: 22,
  avatarCx: 28,
  render(box: Box, person: PersonRow, isFocus: boolean, onClick: () => void) {
    const { boxW, boxH, avatarR, avatarCx } = this;
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
                href=${photoSrc}
                x=${avatarCx - avatarR}
                y=${boxH / 2 - avatarR}
                width=${avatarR * 2}
                height=${avatarR * 2}
                clip-path="url(#sl-avatar)"
                preserveAspectRatio="xMidYMid slice"
              />`
        }
        <text class="name" x="60" y=${boxH / 2 - 4}>${name}</text>
        <text class="dates" x="60" y=${boxH / 2 + 14}>${dates}</text>
        <rect class="hit" x="0" y="0" width=${boxW} height=${boxH} rx="6" />
      </g>
    `;
  }
};
