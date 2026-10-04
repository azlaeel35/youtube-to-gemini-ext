chrome.contextMenus.removeAll(function() {
  chrome.contextMenus.create({
    id: "geminiSummarize",
    title: "Geminiで概要を作成",
    contexts: ["link", "page"],
    documentUrlPatterns: ["*://www.youtube.com/*"],
    targetUrlPatterns: [
      "*://www.youtube.com/watch?v=*", 
      "*://www.youtube.com/embed/*",
      "*://www.youtube.com/shorts/*"
    ]
  });
});

chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === "geminiSummarize") {
    var rawUrl = info.linkUrl || info.pageUrl;
    if (rawUrl) {
      function cleanYoutubeUrl(url) {
        try {
          var urlObj = new URL(url);
          var videoId = urlObj.searchParams.get('v');
          
          // 通常のwatch URLの場合
          if (videoId) return "https://www.youtube.com/watch?v=" + videoId;
          
          // 埋め込み（embed）の場合
          if (urlObj.pathname.includes('/embed/')) {
            var parts = urlObj.pathname.split('/');
            var embedId = parts[parts.indexOf('embed') + 1];
            if (embedId) return "https://www.youtube.com/watch?v=" + embedId;
          }
          
          // ショート動画（shorts）の場合
          if (urlObj.pathname.includes('/shorts/')) {
            var parts = urlObj.pathname.split('/');
            var shortsIndex = parts.indexOf('shorts');
            var shortsId = parts[shortsIndex + 1];
            if (shortsId) return "https://www.youtube.com/watch?v=" + shortsId;
          }
        } catch (e) {}
        
        return url.split('&')[0];
      }

      var youtubeUrl = cleanYoutubeUrl(rawUrl);
      var queryText = "動画内容の概要を作成してください: " + youtubeUrl;
      var retryText = "先ほどの動画の内容が正しく読み込めなかったようです。もう一度リンク先を確認して概要を作成してください: " + youtubeUrl;
      var geminiUrl = "https://gemini.google.com/app";

      chrome.tabs.create({ url: geminiUrl }, function(newTab) {
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
          if (tabId === newTab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            
            chrome.scripting.executeScript({
              target: { tabId: newTab.id },
              args: [queryText, retryText],
              func: function(initialText, retryText) {
                console.log("[Gemini Extension] スクリプトが注入され、実行を開始します。");
                var attempts = 0;
                var hasSentMessage = false;

                // 確実に送信を行うための共通関数
                function sendMessage(text) {
                  console.log("[Gemini Extension] メッセージ送信処理を実行します:", text);
                  var form = document.querySelector('div[contenteditable="true"]');
                  if (form) {
                    form.focus();
                    
                    // 文字を流し込む
                    document.execCommand('insertText', false, text);
                    form.dispatchEvent(new Event('input', { bubbles: true }));

                    // 少し待ってから送信アクションを実行（DOMの反映を確実に待つ）
                    setTimeout(function() {
                      var sendButton = document.querySelector('button[aria-label="送信"], button[aria-label="メッセージを送信"], button[aria-label="Send message"]');
                      
                      if (sendButton && !sendButton.disabled) {
                        sendButton.click();
                        console.log("[Gemini Extension] 送信ボタンをクリックしました。");
                      } else {
                        // ボタンが押せない・見つからない場合は、複数のキーイベントを連続で発火して確実にEnterを認識させる
                        var enterEventDown = new KeyboardEvent('keydown', {
                          key: 'Enter',
                          code: 'Enter',
                          keyCode: 13,
                          which: 13,
                          bubbles: true,
                          cancelable: true
                        });
                        var enterEventPress = new KeyboardEvent('keypress', {
                          key: 'Enter',
                          code: 'Enter',
                          keyCode: 13,
                          which: 13,
                          bubbles: true,
                          cancelable: true
                        });
                        var enterEventUp = new KeyboardEvent('keyup', {
                          key: 'Enter',
                          code: 'Enter',
                          keyCode: 13,
                          which: 13,
                          bubbles: true,
                          cancelable: true
                        });

                        form.dispatchEvent(enterEventDown);
                        form.dispatchEvent(enterEventPress);
                        form.dispatchEvent(enterEventUp);
                        console.log("[Gemini Extension] 強化版Enterキーイベントで送信をシミュレートしました。");
                      }
                      hasSentMessage = true;
                    }, 800); // 待機時間を少し安全側に拡大
                  } else {
                    console.warn("[Gemini Extension] 入力フォームが見つかりませんでした。");
                  }
                }

                function watchForCompletion() {
                  var hasFinished = false;
                  var lastTextLength = 0;
                  var stableCount = 0;

                  var checkInterval = setInterval(function() {
                    if (hasFinished) {
                      clearInterval(checkInterval);
                      return;
                    }

                    if (!hasSentMessage) return;

                    var pageText = document.body.innerText;

                    // 【失敗・エラー応答の検知】
                    var hasError = (
                      pageText.indexOf("取得できませんでした") !== -1 || 
                      pageText.indexOf("取得することができませんでした") !== -1 ||
                      pageText.indexOf("読み込めませんでした") !== -1 ||
                      pageText.indexOf("作成できませんでした") !== -1 ||
                      pageText.indexOf("作成することができませんでした") !== -1 ||
                      pageText.indexOf("確認できませんでした") !== -1 ||
                      pageText.indexOf("確認することができませんでした") !== -1 ||
                      pageText.indexOf("再生できません") !== -1 ||
                      pageText.indexOf("エラーが発生") !== -1
                    );

                    if (hasError) {
                      hasFinished = true;
                      clearInterval(checkInterval);
                      console.log("[Gemini Extension] ⚠️ 失敗（エラー応答）を確実に検知しました。リトライプロンプトを送信します。");
                      
                      // リトライ時はもう一度送信フラグをリセットして再送できるようにする
                      hasSentMessage = false;
                      setTimeout(function() {
                        sendMessage(retryText);
                        watchForCompletion(); // 再監視を再開
                      }, 1000);
                      return;
                    }

                    // 【処理中の場合はカウンターリセット】
                    if (
                      pageText.indexOf("YouTubeに接続") !== -1 || 
                      pageText.indexOf("情報を取得") !== -1 || 
                      pageText.indexOf("読み込んでいます") !== -1 ||
                      pageText.indexOf("動画を読み込んで") !== -1 ||
                      pageText.indexOf("考えています") !== -1 ||
                      pageText.indexOf("生成中") !== -1
                    ) {
                      stableCount = 0;
                      return;
                    }

                    // 【成功判定】
                    var hasKeyword = pageText.indexOf("の概要") !== -1 || 
                                     pageText.indexOf("概要は以下の通り") !== -1 || 
                                     pageText.indexOf("この動画では") !== -1;

                    if (hasKeyword && pageText.length > 150) {
                      if (pageText.length === lastTextLength) {
                        stableCount++;
                        console.log("[Gemini Extension] 🔍 安定確認カウンター:", stableCount, "/ 3");
                        
                        if (stableCount >= 3) {
                          hasFinished = true;
                          clearInterval(checkInterval);
                          console.log("[Gemini Extension] ✔ 要約の成功を確実に検知しました。監視を終了します。");
                          return;
                        }
                      } else {
                        stableCount = 0;
                        lastTextLength = pageText.length;
                      }
                    } else {
                      stableCount = 0;
                      lastTextLength = pageText.length;
                    }

                  }, 1000);
                }

                function tryInitialSend() {
                  var form = document.querySelector('div[contenteditable="true"]');
                  if (form) {
                    console.log("[Gemini Extension] 入力フォームを検出しました。初回メッセージを送信します。");
                    sendMessage(initialText);
                    watchForCompletion();
                  } else if (attempts < 30) {
                    attempts++;
                    setTimeout(tryInitialSend, 600);
                  } else {
                    console.error("[Gemini Extension] ❌ 一定時間経過しても入力フォームが見つかりませんでした。");
                  }
                }

                tryInitialSend();
              }
            });
          }
        });
      });
    }
  }
});
