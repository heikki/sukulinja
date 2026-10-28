import { dlopen, FFIType } from 'bun:ffi';

import type { BrowserWindow } from 'electrobun/main';

// The window opens holding the keyboard itself, not handing it to its webview,
// so no key reaches the page (⌘F, the Scan viewer's arrows) until a click
// does. Electrobun has no call for this, so it's asked of AppKit directly.
// AppKit wants it on the main thread, and this process's JS isn't on it.
//
// objc_msgSend takes whatever signature the method has, so it's bound once per
// signature used.
const libobjc = '/usr/lib/libobjc.A.dylib';
const registerSelector = dlopen(libobjc, {
  sel_registerName: { args: [FFIType.cstring], returns: FFIType.ptr }
}).symbols.sel_registerName;
const send = dlopen(libobjc, {
  objc_msgSend: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.ptr }
}).symbols.objc_msgSend;
const sendOnMain = dlopen(libobjc, {
  objc_msgSend: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.bool],
    returns: FFIType.ptr
  }
}).symbols.objc_msgSend;

function selector(name: string) {
  return registerSelector(Buffer.from(`${name}\0`));
}

export function focusWebview(win: BrowserWindow) {
  const window = win.ptr;
  // Electrobun's webview pointer is its wrapper object, not an NSView: made
  // first responder itself, AppKit throws on the next click and the app dies.
  // The WKWebView it wraps is its webView property; an Electrobun that drops
  // it crashes here on launch, which an upgrade's first dev run shows.
  const wrapper = win.webview.ptr;
  if (window === null || wrapper === null) return;
  const view = send(wrapper, selector('webView'));
  if (view === null) return;
  sendOnMain(
    window,
    selector('performSelectorOnMainThread:withObject:waitUntilDone:'),
    selector('makeFirstResponder:'),
    view,
    false
  );
}
