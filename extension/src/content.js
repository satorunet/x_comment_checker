// 分析UI。返信本文などは信頼できない入力なので、DOMへは必ずテキストとして入れる。
(() => {
  const XCA = globalThis.XCA;
  if (typeof document === 'undefined') return;

  const tweets = new Map();
  let rateLimited = false;
  let responses = 0;

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__commenterAnalyzer !== true) return;
    responses++;
    if (e.data.status === 429) rateLimited = true;
    if (e.data.status !== 200 || typeof e.data.body !== 'string') return;
    try {
      for (const t of XCA.extractTweets(JSON.parse(e.data.body))) tweets.set(t.id, t);
    } catch (_) { /* 解析できない応答は無視 */ }
  });

  const focalId = () => (location.pathname.match(/\/status\/(\d+)/) || [])[1] || null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
    return el;
  }

  const CSS = `
  :host{all:initial;--bg:#fff;--fg:#0f1419;--mut:#536471;--ln:#e5e9eb;--card:#f7f9f9;--a:#1d9bf0;--low:#00875a;--mid:#b76e00;--hi:#d4351c;
    font:14px/1.6 system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI","Noto Sans JP",sans-serif;color:var(--fg)}
  :host([data-dark]){--bg:#0f1214;--fg:#e7e9ea;--mut:#8b98a5;--ln:#2f3336;--card:#171b1f;--low:#3ecf8e;--mid:#f0b429;--hi:#ff7a66}
  *{box-sizing:border-box}
  button{font:inherit;cursor:pointer}
  .fab{position:fixed;right:20px;bottom:84px;z-index:2147483000;background:var(--a);color:#fff;border:0;border-radius:999px;padding:11px 18px;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,.3)}
  .fab:hover{filter:brightness(.93)}
  .overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;justify-content:center;align-items:stretch;padding:24px}
  .panel{background:var(--bg);color:var(--fg);border-radius:14px;width:min(1280px,100%);display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.4)}
  header{display:flex;gap:10px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--ln);flex-wrap:wrap}
  h2{font-size:17px;margin:0;flex:1 1 auto}
  .btn{background:transparent;color:var(--fg);border:1px solid var(--ln);border-radius:999px;padding:5px 14px}
  .btn:hover{background:var(--card)}
  .body{overflow:auto;flex:1;padding:14px 16px}
  .status{color:var(--mut);padding:40px 16px;text-align:center}
  .status b{display:block;color:var(--fg);font-size:28px}
  .warn{border-left:3px solid var(--mid);background:var(--card);padding:8px 12px;margin:0 0 12px;font-size:13px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:10px}
  .card{background:var(--card);border-radius:10px;padding:8px 12px}
  .card small{color:var(--mut);display:block;font-size:12px}
  .card b{font-size:20px;font-variant-numeric:tabular-nums}
  .note{color:var(--mut);font-size:12px;margin:0 0 12px}
  .tools{display:flex;gap:12px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
  input[type=search]{font:inherit;color:var(--fg);background:var(--bg);border:1px solid var(--ln);border-radius:999px;padding:5px 12px;width:240px;max-width:100%}
  label{display:flex;gap:5px;align-items:center;color:var(--mut)}
  table{border-collapse:collapse;width:100%;min-width:960px}
  th{position:sticky;top:-14px;background:var(--bg);text-align:left;font-size:12px;color:var(--mut);border-bottom:1px solid var(--ln);padding:6px 8px;white-space:nowrap;z-index:1}
  th[data-key]{cursor:pointer}
  th[data-key]:hover{color:var(--fg)}
  td{border-bottom:1px solid var(--ln);padding:8px;vertical-align:top}
  td.num{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
  th.num{text-align:right}
  .who{display:flex;gap:8px;width:190px}
  .who img{width:32px;height:32px;border-radius:50%;flex:none}
  .who a{color:var(--fg);text-decoration:none;font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
  .who a:hover{text-decoration:underline}
  .who small{color:var(--mut);display:block;max-width:150px;overflow:hidden;text-overflow:ellipsis}
  .score{font-weight:700;font-size:16px;font-variant-numeric:tabular-nums}
  .s-low{color:var(--low)}.s-mid{color:var(--mid)}.s-hi{color:var(--hi)}
  .score-btn{background:transparent;border:0;padding:0;font-family:inherit;text-decoration:underline dotted 1px;text-underline-offset:3px}
  .score-btn:hover,.score-btn[aria-expanded=true]{text-decoration-style:solid}
  .comment{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
  .sort-btn{background:transparent;color:var(--mut);border:1px solid var(--ln);border-radius:999px;padding:0 8px;margin-left:6px;font-size:12px;font-weight:400}
  .sort-btn:hover{color:var(--fg)}
  .sort-btn[aria-pressed=true]{color:var(--a);border-color:var(--a)}
  .more{background:transparent;border:0;padding:0;margin-left:6px;color:var(--a);font-size:12px;white-space:nowrap}
  .more:hover{text-decoration:underline}
  .days{display:block;color:var(--mut);font-size:12px;font-variant-numeric:tabular-nums}
  .time{white-space:nowrap;font-variant-numeric:tabular-nums}
  .time a{color:var(--mut)}
  .badge{width:20px;height:20px;display:block;fill:currentColor}
  .badge-blue{color:#1d9bf0}.badge-gold{color:#e2b719}.badge-gray{color:#829aab}.badge-none{color:var(--mut);opacity:.25}
  .stats{color:var(--mut);font-size:12px;margin-left:8px;white-space:nowrap;font-variant-numeric:tabular-nums;display:inline-flex;gap:10px;vertical-align:middle}
  .stat{display:inline-flex;align-items:center;gap:3px}
  .stat svg{width:14px;height:14px;fill:currentColor;flex:none}
  .detail td{background:var(--card);font-size:13px}
  .detail h4{margin:0 0 4px;font-size:12px;color:var(--mut)}
  .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
  .cols ul{margin:0;padding:0;list-style:none}
  .cols li{display:flex;justify-content:space-between;gap:12px}
  .cols li span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}
  @media (max-width:640px){.overlay{padding:0}.panel{border-radius:0}}
  `;

  const host = h('div', { id: 'commenter-analyzer-root' });
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  shadow.adoptedStyleSheets = [sheet];

  const fab = h('button', { class: 'fab', text: 'Xコメント認知戦チェッカー', onclick: () => openPanel() });
  let overlay = null;
  let run = null; // 実行中の収集 { stop: boolean }

  function syncTheme() {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
    const dark = m && m.length >= 3 ? +m[0] + +m[1] + +m[2] < 200 : matchMedia('(prefers-color-scheme: dark)').matches;
    host.toggleAttribute('data-dark', !!dark);
  }

  function syncFab() {
    if (!document.documentElement) return;
    if (!host.isConnected) document.documentElement.append(host);
    const show = !!focalId();
    if (show && !fab.isConnected) shadow.append(fab);
    if (!show && fab.isConnected) fab.remove();
  }
  setInterval(syncFab, 700);

  function closePanel() {
    if (run) run.stop = true;
    overlay?.remove();
    overlay = null;
  }

  function shell(title, ...actions) {
    const body = h('div', { class: 'body' });
    const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Xコメント認知戦チェッカー' },
      h('header', null, h('h2', { text: title }), actions, h('button', { class: 'btn', text: '閉じる', onclick: closePanel })),
      body);
    overlay?.remove();
    overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) closePanel(); } }, panel);
    shadow.append(overlay);
    return body;
  }

  function clickLoadMore() {
    const re = /返信をさらに表示|さらに返信を表示|他の返信を表示|スパムの可能性|攻撃的な内容|Show (more|additional) replies|Show probable spam|Show replies|Show offensive/i;
    for (const b of document.querySelectorAll('[data-testid="cellInnerDiv"] [role="button"], [data-testid="cellInnerDiv"] button')) {
      if (!b.closest('article') && re.test(b.textContent || '')) {
        b.click();
        return true;
      }
    }
    return false;
  }

  function currentReplies(id) {
    const focal = tweets.get(id);
    if (!focal) return { focal: null, replies: [] };
    const sameConv = [...tweets.values()];
    return { focal, replies: XCA.selectReplies(sameConv, focal) };
  }

  async function openPanel() {
    syncTheme();
    const id = focalId();
    if (!id || run) return;
    const me = (run = { stop: false });
    const startY = window.scrollY;
    rateLimited = false;
    const count = h('b', { text: '0' });
    const body = shell('Xコメント認知戦チェッカー', h('button', {
      class: 'btn', text: '収集を止めて集計', onclick: () => { me.stop = true; },
    }));
    body.append(h('div', { class: 'status' }, count, '件の返信を収集中… 画面を自動でスクロールしています'));

    let last = -1;
    let idle = 0;
    for (let round = 0; round < 400 && !me.stop && !rateLimited && focalId() === id; round++) {
      const clicked = clickLoadMore();
      if (idle > 0 && idle % 2 === 0) window.scrollBy(0, -600);
      await sleep(idle > 0 && idle % 2 === 0 ? 250 : 0);
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(1400);
      const n = currentReplies(id).replies.length;
      count.textContent = String(n);
      if (n === last && !clicked) idle++;
      else idle = 0;
      last = n;
      if (idle >= 6) break;
    }
    window.scrollTo(0, startY);
    const closed = !overlay;
    run = null;
    if (closed) return;
    showResult(id);
  }

  const fmtDate = (ms) => {
    if (!ms) return '不明';
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const fmtTime = (ms) => {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const pct = (x) => `${Math.round(x * 100)}%`;
  const badgeText = (u) =>
    u.verifiedType === 'Government' ? '政府' : u.verifiedType === 'Business' ? '企業' : u.blue ? 'あり' : 'なし';
  const BADGE_PATH = 'M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z';
  const LIKE_PATH = 'M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 5 6.3 5c2.1 0 3.9 1.1 5.7 3.2C13.8 6.1 15.6 5 17.7 5 21 5 23.1 8.2 21.6 11.7 19.5 16.4 12 21 12 21z';
  const VIEW_PATH = 'M4 20h3V10H4v10zm6.5 0h3V4h-3v16zm6.5 0h3v-7h-3v7z';
  function svgIcon(d, cls, label) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    if (cls) svg.setAttribute('class', cls);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    const title = document.createElementNS(NS, 'title');
    title.textContent = label;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(title, path);
    return svg;
  }
  const stat = (d, label, value) => h('span', { class: 'stat' }, svgIcon(d, null, label), value);
  function badgeIcon(u) {
    const [kind, label] =
      u.verifiedType === 'Government' ? ['gray', '政府バッジ']
      : u.verifiedType === 'Business' ? ['gold', '企業バッジ']
      : u.blue ? ['blue', '青バッジ']
      : ['none', 'バッジなし'];
    return svgIcon(BADGE_PATH, `badge badge-${kind}`, label);
  }
  const stripReplyHead = (s) => s.replace(/^(\s*@\w+)+\s*/, '');
  const psyopClass = (s) => (s >= 50 ? 's-hi' : s >= 25 ? 's-mid' : 's-low');
  const credClass = (s) => (s >= 50 ? 's-low' : s >= 25 ? 's-mid' : 's-hi');
  const safeHandle = (s) => /^\w{1,50}$/.test(s);

  function csvCell(v) {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // 表計算ソフトの数式実行を防ぐ
    return `"${s.replace(/"/g, '""')}"`;
  }

  function downloadCsv(result, id) {
    const header = ['認知戦度', '社会信用度スコア', 'ユーザー名', '表示名', 'フォロワー数', 'フォロー数', '総投稿数', '登録日', 'バッジ', '根拠', '発言日時', '発言', 'いいね数', '表示数', '発言URL'];
    const lines = [header.map(csvCell).join(',')];
    for (const r of result.rows) {
      const why = r.psyop.signals.map((x) => `${x.label}(${x.points > 0 ? '+' : ''}${x.points})`).join(' / ');
      for (const c of r.comments) {
        lines.push([
          r.psyop.score, r.credibility.score, r.user.screenName, r.user.name, r.user.followers, r.user.following,
          r.user.statuses, fmtDate(r.user.createdAt), badgeText(r.user), why, c.createdAt ? new Date(c.createdAt).toISOString() : '',
          stripReplyHead(c.text), c.likes, c.views ?? '', `https://x.com/${r.user.screenName}/status/${c.id}`,
        ].map(csvCell).join(','));
      }
    }
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = h('a', { href: url, download: `commenters_${id}.csv` });
    shadow.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function showResult(id) {
    const { focal, replies } = currentReplies(id);
    if (!focal) {
      const body = shell('Xコメント認知戦チェッカー', h('button', { class: 'btn', text: '再読み込み', onclick: () => location.reload() }));
      body.append(h('div', { class: 'status', text: '投稿データを取得できませんでした。ページを再読み込みしてから、もう一度お試しください。' }));
      return;
    }
    const result = XCA.analyze(focal, replies);
    const { summary: m } = result;
    const body = shell(`Xコメント認知戦チェッカー — ${m.users}人 / ${m.comments}件`,
      h('button', { class: 'btn', text: 'さらに収集', onclick: openPanel }),
      h('button', { class: 'btn', text: 'CSV保存', onclick: () => downloadCsv(result, id) }));

    if (rateLimited) body.append(h('p', { class: 'warn', text: 'Xの取得回数制限に達したため、ここまでの分で集計しました。時間を置くと続きを収集できます。' }));
    if (m.users < 10) body.append(h('p', { class: 'warn', text: '返信者が10人未満のため、スレッド全体の指標は参考程度にご覧ください。' }));

    const card = (label, value, cls) => h('div', { class: 'card' }, h('small', { text: label }), h('b', { class: cls, text: value }));
    body.append(
      h('div', { class: 'cards' },
        card('スレッド認知戦指数', String(m.threadIndex), psyopClass(m.threadIndex)),
        card('平均 認知戦度', String(m.avgPsyop), psyopClass(m.avgPsyop)),
        card('平均 社会信用度', String(m.avgCredibility), credClass(m.avgCredibility)),
        card('高スコア（50以上）', `${m.high}人`),
        card('登録半年未満', pct(m.newShare)),
        card('青バッジ', pct(m.blueShare)),
        card('同文投稿グループ', `${result.clusters.length}組`)),
      h('p', { class: 'note', text: '認知戦度は +100（疑わしい）〜 −100（信頼できる）で、0が中立です。公開プロフィールと文面から機械的に算出した目安で、高スコアでも工作と断定できず、マイナスでも信頼を保証するものではありません。認知戦度・社会信用度の数値をタップすると根拠を確認できます。' }));

    const search = h('input', { type: 'search', placeholder: 'ユーザー名・発言を検索', 'aria-label': '検索' });
    const blueOnly = h('input', { type: 'checkbox' });
    const shown = h('span', { class: 'note', style: 'margin:0' });
    body.append(h('div', { class: 'tools' }, search, h('label', null, blueOnly, '青バッジのみ'), shown));

    const cols = [
      { key: 'psyop', label: '認知戦度', num: true, get: (r) => r.psyop.score },
      { key: 'cred', label: '社会信用度', num: true, get: (r) => r.credibility.score },
      { key: 'name', label: 'ユーザー', get: (r) => r.user.screenName.toLowerCase() },
      { key: 'followers', label: 'フォロワー', num: true, get: (r) => r.user.followers },
      { key: 'following', label: 'フォロー', num: true, get: (r) => r.user.following },
      { key: 'created', label: '登録日', get: (r) => r.user.createdAt || 0 },
      { key: 'badge', label: 'バッジ', get: (r) => (r.user.verifiedType ? 2 : r.user.blue ? 1 : 0) },
      { key: 'time', label: '投稿日時', get: (r) => r.comments[0].createdAt || 0 },
      { label: '発言' },
    ];
    // 発言単位の値なので、ユーザーの並びは各自の最大値で決める
    const commentSorts = [
      { key: 'likes', label: 'いいね順', value: (c) => c.likes, get: (r) => Math.max(...r.comments.map((c) => c.likes)) },
      { key: 'views', label: '表示順', value: (c) => c.views ?? -1, get: (r) => Math.max(...r.comments.map((c) => c.views ?? -1)) },
    ];
    let sortKey = 'psyop';
    let sortDir = -1;
    const open = new Set();
    const expanded = new Set();
    const MAX_CHARS = 120;
    const MAX_LINES = 4;
    function commentBody(c) {
      const full = stripReplyHead(c.text) || '（テキストなし）';
      const lines = full.split('\n');
      if (Array.from(full).length <= MAX_CHARS && lines.length <= MAX_LINES) return [full];
      const on = expanded.has(c.id);
      const short = Array.from(lines.slice(0, MAX_LINES).join('\n')).slice(0, MAX_CHARS).join('');
      return [on ? full : `${short}…`, h('button', {
        class: 'more',
        text: on ? '閉じる' : '続きを読む',
        'aria-expanded': String(on),
        onclick: () => {
          if (on) expanded.delete(c.id); else expanded.add(c.id);
          paint();
        },
      })];
    }
    const tbody = h('tbody');
    const setSort = (key) => {
      if (sortKey === key) sortDir = -sortDir;
      else { sortKey = key; sortDir = key === 'name' ? 1 : -1; }
      paint();
    };
    const sortButtons = commentSorts.map((s) => {
      const btn = h('button', { class: 'sort-btn', onclick: () => setSort(s.key) });
      return { s, btn };
    });
    const thead = h('thead', null, h('tr', null, cols.map((c) => {
      const th = h('th', { class: c.num ? 'num' : '', text: c.label, 'data-key': c.key });
      if (c.key) th.addEventListener('click', () => setSort(c.key));
      else th.append(...sortButtons.map((x) => x.btn));
      return th;
    })));
    body.append(h('table', null, thead, tbody));

    function detail(r) {
      const list = (items, fmt) => h('ul', null, items.map((x) => h('li', null, h('span', { text: x.label }), h('span', { text: fmt(x) }))));
      return h('tr', { class: 'detail' }, h('td', { colspan: cols.length }, h('div', { class: 'cols' },
        h('div', null, h('h4', { text: `認知戦度 ${r.psyop.score}（${XCA.psyopLevel(r.psyop.score)}）` }),
          r.psyop.signals.length ? list(r.psyop.signals, (x) => `${x.points > 0 ? '+' : ''}${x.points}`) : '該当なし'),
        h('div', null, h('h4', { text: `社会信用度スコア ${r.credibility.score}` }),
          list(r.credibility.parts, (x) => `${Math.round(x.points)} / ${x.max}`)),
        h('div', null, h('h4', { text: 'プロフィール' }),
          h('div', { text: r.user.bio || '自己紹介なし' }),
          h('div', { class: 'note', text: `総投稿数 ${r.user.statuses.toLocaleString()}` })))));
    }

    function row(r) {
      const u = r.user;
      const profile = safeHandle(u.screenName) ? `https://x.com/${u.screenName}` : null;
      const avatar = /^https:\/\/pbs\.twimg\.com\//.test(u.avatar) ? h('img', { src: u.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null;
      const scoreBtn = (score, cls) => h('button', {
        class: `score score-btn ${cls}`,
        text: String(score),
        title: '根拠を表示',
        'aria-expanded': String(open.has(u.id)),
        onclick: () => {
          if (open.has(u.id)) open.delete(u.id); else open.add(u.id);
          paint();
        },
      });
      const lead = [
        h('td', { class: 'num' }, scoreBtn(r.psyop.score, psyopClass(r.psyop.score))),
        h('td', { class: 'num' }, scoreBtn(r.credibility.score, `cred-btn ${credClass(r.credibility.score)}`)),
        h('td', null, h('div', { class: 'who' }, avatar, h('div', null,
          h('a', { href: profile, target: '_blank', rel: 'noopener noreferrer', text: u.name }),
          h('small', { text: `@${u.screenName}` })))),
        h('td', { class: 'num', text: u.followers.toLocaleString() }),
        h('td', { class: 'num', text: u.following.toLocaleString() }),
        h('td', { style: 'white-space:nowrap' }, fmtDate(u.createdAt),
          u.createdAt ? h('span', { class: 'days', text: `${Math.floor((Date.now() - u.createdAt) / 86400000).toLocaleString()}日` }) : null),
        h('td', null, badgeIcon(u)),
      ];
      lead.forEach((td) => { td.rowSpan = r.comments.length; });
      // 投稿日時と発言を揃えるため、1コメント1行にしてユーザー列は結合する
      const active = commentSorts.find((s) => s.key === sortKey);
      const comments = active ? [...r.comments].sort((a, b) => (active.value(a) - active.value(b)) * sortDir) : r.comments;
      return comments.map((c, i) => h('tr', null,
        i === 0 ? lead : null,
        h('td', { class: 'time' }, profile
          ? h('a', { href: `${profile}/status/${c.id}`, target: '_blank', rel: 'noopener noreferrer', text: fmtTime(c.createdAt) || '開く' })
          : fmtTime(c.createdAt)),
        h('td', null, h('p', { class: 'comment' }, commentBody(c),
          h('span', { class: 'stats' },
            stat(LIKE_PATH, 'いいね', c.likes.toLocaleString()),
            stat(VIEW_PATH, '表示', c.views != null ? c.views.toLocaleString() : '—'))))));
    }

    function paint() {
      const q = search.value.trim().toLowerCase();
      const col = [...cols, ...commentSorts].find((c) => c.key === sortKey);
      for (const { s, btn } of sortButtons) {
        const on = s.key === sortKey;
        btn.textContent = on ? `${s.label} ${sortDir < 0 ? '▼' : '▲'}` : s.label;
        btn.setAttribute('aria-pressed', String(on));
      }
      const rows = result.rows
        .filter((r) => !blueOnly.checked || r.user.blue)
        .filter((r) => !q || [r.user.screenName, r.user.name, ...r.comments.map((c) => c.text)].join('\n').toLowerCase().includes(q))
        .sort((a, b) => {
          const x = col.get(a);
          const y = col.get(b);
          return (x < y ? -1 : x > y ? 1 : 0) * sortDir;
        });
      tbody.replaceChildren(...rows.flatMap((r) => (open.has(r.user.id) ? [...row(r), detail(r)] : row(r))));
      shown.textContent = `${rows.length}人を表示`;
    }
    search.addEventListener('input', paint);
    blueOnly.addEventListener('change', paint);
    paint();
  }
})();
