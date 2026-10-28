// WKWebView hands a key the page leaves alone on to macOS, which beeps: with
// no field focused, every key typed beeps. Keys with nothing to do there are
// marked handled. Left alone: anything typed in a field, ⌘ and Ctrl
// shortcuts (the app menu's), Tab, Space and Enter on a button or link, and
// the keys that scroll, where there's something to scroll.

// Which way each scrolling key moves.
const SCROLLS: Record<string, 'x' | 'y'> = {
  'ArrowUp': 'y',
  'ArrowDown': 'y',
  'ArrowLeft': 'x',
  'ArrowRight': 'x',
  'PageUp': 'y',
  'PageDown': 'y',
  'Home': 'y',
  'End': 'y',
  ' ': 'y'
};

const PRESSES = new Set([' ', 'Enter']);

type KeyTarget = 'field' | 'control' | 'other';

interface KeyPress {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}

// `scrolls` says whether there's something the key's way to scroll.
export function quiets(
  press: KeyPress,
  on: KeyTarget,
  scrolls: (axis: 'x' | 'y') => boolean
) {
  const { key } = press;
  if (press.metaKey || press.ctrlKey || key === 'Tab') return false;
  if (on === 'field') return false;
  if (on === 'control' && PRESSES.has(key)) return false;
  const axis = SCROLLS[key];
  return axis === undefined || !scrolls(axis);
}

function targetOf(target: EventTarget | undefined): KeyTarget {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return 'field';
  }
  return target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement
    ? 'control'
    : 'other';
}

// Whether `at` scrolls that way: it has room, and the page or its overflow
// lets it.
function scrollsWay(at: Element, axis: 'x' | 'y') {
  const style = getComputedStyle(at);
  const overflow = axis === 'x' ? style.overflowX : style.overflowY;
  const room =
    axis === 'x'
      ? at.scrollWidth > at.clientWidth
      : at.scrollHeight > at.clientHeight;
  if (!room) return false;
  return (
    at === document.scrollingElement ||
    overflow === 'auto' ||
    overflow === 'scroll'
  );
}

// Up from `from` through shadow roots' hosts, an element that scrolls that
// way: what WebKit would scroll with the key.
function scrollerFrom(from: EventTarget | null, axis: 'x' | 'y') {
  let at = from instanceof Element ? from : null;
  while (at !== null) {
    if (scrollsWay(at, axis)) return true;
    const root = at.getRootNode();
    at = at.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return false;
}

export function quietUnhandledKeys() {
  // With nothing focused, WebKit scrolls what was last pressed on.
  let pressedOn: EventTarget | null = null;
  window.addEventListener(
    'pointerdown',
    (e) => {
      pressedOn = e.composedPath()[0] ?? null;
    },
    true
  );
  window.addEventListener('keydown', (e) => {
    const [target] = e.composedPath();
    const from = target === document.body ? pressedOn : (target ?? null);
    const scrolls = scrollerFrom.bind(null, from);
    if (quiets(e, targetOf(target), scrolls)) e.preventDefault();
  });
}
