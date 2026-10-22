import { trackFocusRings } from './focus-ring';
import { quietUnhandledKeys } from './quiet-keys';

import './components/app';

// Electrobun's preload wraps these to turn a URL write made with ⌘ held (or
// just let go) into a new window, which the app would open in the browser;
// the chart writes its URL on every card click and pan, so a ⌘-click would.
// The prototype's own versions sit under the wrappers.
delete (history as Partial<History>).pushState;
delete (history as Partial<History>).replaceState;

trackFocusRings();
quietUnhandledKeys();

// The app draws its own menus where it has any; WebKit's has nothing for
// it but copy and paste in a text field, so it's kept only there.
window.addEventListener('contextmenu', (e) => {
  const [target] = e.composedPath();
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }
  e.preventDefault();
});
