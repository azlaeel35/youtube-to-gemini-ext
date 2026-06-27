chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "geminiSummarize") {
    // アクティブなタブにメッセージを送信
    chrome.tabs.sendMessage(tab.id, { action: "getYouTubeUrl" }, (response) => {
      if (chrome.runtime.lastError) {
        // エラーを無視するか、より詳細なログを記録
        console.warn("Could not establish connection to content script.");
        return;
      }
      
      const youtubeUrl = response.url;
      const geminiUrl = "https://gemini.google.com/app?q=" + encodeURIComponent(`動画内容の概要を作成してください: ${youtubeUrl}`);
      
      chrome.tabs.create({ url: geminiUrl });
    });
  }
});