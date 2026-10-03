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
    let rawUrl = info.linkUrl || info.pageUrl;
    
    if (rawUrl) {
      // --- 【追加】YouTubeのURLを綺麗な形（watch?v=XXXXXXXXXXX）に成型する ---
      const cleanYoutubeUrl = (url) => {
        try {
          const urlObj = new URL(url);
          // 通常のwatch?v=形式の場合
          const videoId = urlObj.searchParams.get('v');
          if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
          }
          // 埋め込み(embed/)形式の場合 (/embed/VIDEO_ID)
          if (urlObj.pathname.includes('/embed/')) {
            const parts = urlObj.pathname.split('/');
            const embedId = parts[parts.indexOf('embed') + 1];
            if (embedId) {
              return `https://www.youtube.com/watch?v=${embedId}`;
            }
          }
        } catch (e) {
          console.error('URLの解析に失敗しました:', e);
        }
        // 万が一パースに失敗した場合は、最低限「&」以降を削るフォールバック
        return url.split('&')[0];
      };

      const youtubeUrl = cleanYoutubeUrl(rawUrl);
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

                    setTimeout(() => {
                      const sendButton = document.querySelector('button[aria-label="送信"], button[aria-label="メッセージを送信"], button[aria-label="Send message"]');
                      
                      if (sendButton && !sendButton.disabled) {
                        sendButton.click();
                      } else {
                        const enterEvent = new KeyboardEvent('keydown', {
                          key: 'Enter',
                          code: 'Enter',
                          keyCode: 13,
                          bubbles: true
                        });
                        form.dispatchEvent(enterEvent);
                      }
                    }, 500);

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
