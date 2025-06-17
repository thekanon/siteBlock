import { PopupManager } from './popupManager.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing PopupManager...');
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
