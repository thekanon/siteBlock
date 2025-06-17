import { PopupManager } from './popupManager.js';

document.addEventListener('DOMContentLoaded', () => {
  window.popupManager = new PopupManager();
});

document.addEventListener('contextmenu', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    if (window.popupManager) {
      window.popupManager.toggleDebug();
    }
  }
});
