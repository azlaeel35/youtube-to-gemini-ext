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
      const cleanYoutubeUrl = (url) => {
        try {
          const urlObj = new URL(url);
          const videoId = urlObj.searchParams.get('v');
          if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
          }
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
        return url.split('&')[0];
      };

      const youtubeUrl = cleanYoutubeUrl(rawUrl);
      const queryText = `動画内容の概要を作成してください: ${youtubeUrl}`;
      const retryText = `先ほどの動画の内容が正しく読み込めなかったようです。もう一度リンク先を確認して概要を作成してください: ${youtubeUrl}`;
      const geminiUrl = "https://gemini.google.com/app";

      chrome.tabs.create({ url: geminiUrl }, (newTab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            
            chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              func: (initialText, retryText) => {
                let attempts = 0;
                const maxAttempts = 30;
                const interval = 600;

                const sendMessage = (text) => {
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
                  }
                };

                // 成功を検知してリトライをキャンセルし、タイムアウトしたら自動リトライする方式
                let isResolved = false;
                
                const watchForSuccessOrTimeout = () => {
                  // 12秒経っても成功ワードが出なかったら「失敗した可能性が高い」とみなして自動リトライ
                  const timeoutTimer = setTimeout(() => {
                    if (!isResolved) {
                      isResolved = true;
                      obs.disconnect();
                      sendMessage(retryText);
                    }
                  }, 12000);

                  const obs = new MutationObserver((mutations, observer) => {
                    if (isResolved) return;

                    const pageText = document.body.innerText;
                    
                    // 成功時の定番キーワードが含まれているかチェック
                    if (pageText.includes("概要は以下の通りです") || pageText.includes("の概要")) {
                      isResolved = true;
                      clearTimeout(timeoutTimer); // タイムアウトを解除（成功確定）
                      observer.disconnect();      // 監視終了
                    }
                  });

                  obs.observe(document.body, {
                    childList: true,
                    subtree: true
                  });
                };

                const tryInitialSend = () => {
                  const form = document.querySelector('div[contenteditable="true"]');
                  if (form) {
                    sendMessage(initialText);
                    watchForSuccessOrTimeout(); // 成功監視とタイムアウト判定を開始
                  } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(tryInitialSend, interval);
                  }
                };

                tryInitialSend();
              },
              args: [queryText, retryText]
            });
          }
        });
      });
    }
  }
});
