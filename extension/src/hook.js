// MAINワールドで動作。Xが自分で取得したAPI応答を複製して分析側へ渡す。追加リクエストは送らない。
(() => {
  const TARGET = /\/i\/api\/graphql\/[^/]+\/(TweetDetail|ModeratedTimeline|TweetResultByRestId)(?:\?|$)/;
  const post = (status, body) => {
    window.postMessage({ __commenterAnalyzer: true, status, body }, location.origin);
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input && input.url;
      if (url && TARGET.test(url)) {
        res.clone().text().then((text) => post(res.status, text)).catch(() => {});
      }
    } catch (_) { /* ページの動作を妨げない */ }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (TARGET.test(String(url))) {
        this.addEventListener('load', async () => {
          try {
            const type = this.responseType;
            let text;
            if (type === '' || type === 'text') text = this.responseText;
            else if (type === 'json') text = JSON.stringify(this.response);
            else if (type === 'blob') text = await this.response.text();
            else if (type === 'arraybuffer') text = new TextDecoder().decode(this.response);
            if (text != null) post(this.status, text);
          } catch (_) { /* 無視 */ }
        });
      }
    } catch (_) { /* 無視 */ }
    return origOpen.call(this, method, url, ...rest);
  };
})();
