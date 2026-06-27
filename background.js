chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "geminiSummarize",
      title: "Geminiで概要を作成",
      contexts: ["link", "page"],
      documentUrlPatterns: ["*://www.youtube.com/*"],
      targetUrlPatterns: ["*://www.youtube.com/watch?v=*", "*://www.youtube.com/embed/*"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "geminiSummarize") {
    const youtubeUrl = info.linkUrl || info.pageUrl;
    
    if (youtubeUrl) {
      const queryText = `動画内容の概要を作成してください: ${youtubeUrl}`;
      const geminiUrl = "https://gemini.google.com/app";

      chrome.tabs.create({ url: geminiUrl }, (newTab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            
            chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              func: (text) => {
                let attempts = 0;
                const maxAttempts = 30;
                const interval = 600;

                const tryFillAndSend = () => {
                  const form = document.querySelector('div[contenteditable="true"]');
                  
                  if (form) {
                    form.focus();
                    document.execCommand('insertText', false, text);
                    form.dispatchEvent(new Event('input', { bubbles: true }));

                    // 少しだけ待ってから送信ボタンを叩く（ボタンの有効化を待つ）
                    setTimeout(() => {
                      const sendButton = document.querySelector('button[aria-label="送信"], button[aria-label="メッセージを送信"], button[aria-label="Send message"]');
                      
                      // ボタンが「無効」でなければクリックする
                      if (sendButton && !sendButton.disabled) {
                        sendButton.click();
                      } else {
                        // ボタンがまだ無効なら、最終手段としてEnterキーを送信
                        const enterEvent = new KeyboardEvent('keydown', {
                          key: 'Enter',
                          code: 'Enter',
                          keyCode: 13,
                          bubbles: true
                        });
                        form.dispatchEvent(enterEvent);
                      }
                    }, 500); // 0.5秒の猶予を持たせることで、Reactの更新を待つ

                  } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(tryFillAndSend, interval);
                  }
                };

                tryFillAndSend();
              },
              args: [queryText]
            });
          }
        });
      });
    }
  }
});