// Naad – Background Service Worker
// Opens the side panel when the extension action is clicked.

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Keep the service worker alive during tab capture sessions.
// The side panel itself holds the MediaStream, so the service worker
// only needs to handle the sidePanel.open lifecycle.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Naad] Extension installed / updated');
});
