// src/background/service-worker.ts
chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId !== void 0) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Naad] Extension installed / updated");
});
