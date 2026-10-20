import { trackFocusRings } from './focus-ring';

import './components/app';

trackFocusRings();

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
