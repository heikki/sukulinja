import './components/tree-view';

import type { TreeViewElement } from './components/tree-view';

document.querySelector('header h1')?.addEventListener('click', () => {
  document.querySelector<TreeViewElement>('sl-tree-view')?.resetFocus();
});
