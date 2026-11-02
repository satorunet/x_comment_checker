// スコアは公開情報からの機械的な目安。各加点の根拠を必ず一緒に返す。
(() => {
  const XCA = (globalThis.XCA = globalThis.XCA || {});
  const DAY = 86400000;
  const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

  const PATTERNS = {
    whatabout: /それより|そんなことより|それを言うなら|じゃあ.{0,20}[はも]どう|はどうなん|[のほ]う?が問題|what about/i,
    attack: /バカ|馬鹿|アホ|頭悪|無能|クズ|老害|黙れ|消えろ|恥を知れ|工作員|売国|反日|パヨク|ネトウヨ|\bidiot\b|\bmoron\b|\bshill\b/i,
    incite: /拡散(希望|して|しろ)|許すな|騙されるな|目を覚ませ|マスコミが報じない|メディアが隠す|テレビが報じない|wake up|share before/i,
  };
  const NO_LANG = new Set(['und', 'zxx', 'qme', 'qam', 'qct', 'qht', 'qst', 'art']);

  const cleanText = (s) =>
    (s || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/^(\s*@\w+)+/, '')
      .trim();
  const compact = (s) => cleanText(s).replace(/@\w+/g, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

  function bigrams(s) {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  }
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let hit = 0;
    for (const x of a) if (b.has(x)) hit++;
    return hit / (a.size + b.size - hit);
  }

  function credibility(u, now) {
    const years = u.createdAt ? (now - u.createdAt) / (365.25 * DAY) : 0;
    const ageDays = Math.max(years * 365.25, 1);
    const perDay = u.statuses / ageDays;
    const ratio = u.followers / Math.max(u.following, 1);
    const org = u.verifiedType === 'Business' || u.verifiedType === 'Government';
    const parts = [
      { label: 'アカウント歴', points: clamp(years * 6, 0, 30), max: 30 },
      { label: 'フォロワー規模', points: clamp((Math.log10(u.followers + 1) / 5) * 30, 0, 30), max: 30 },
      { label: 'フォロワー/フォロー比', points: clamp(ratio * 15, 0, 15), max: 15 },
      {
        label: 'プロフィール充実度',
        points: (u.bio ? 4 : 0) + (u.defaultAvatar ? 0 : 3) + (u.location || u.hasUrl ? 3 : 0),
        max: 10,
      },
      { label: '投稿ペースの自然さ', points: u.statuses < 10 ? 2 : perDay <= 30 ? 10 : perDay <= 100 ? 5 : 0, max: 10 },
      { label: org ? '組織認証' : '認証バッジ', points: org ? 5 : u.blue ? 3 : 0, max: 5 },
    ];
    return { score: Math.round(parts.reduce((s, p) => s + p.points, 0)), parts };
  }

  function accountSignals(u, now) {
    const s = [];
    const add = (label, points) => s.push({ label, points });
    if (u.createdAt) {
      const days = (now - u.createdAt) / DAY;
      if (days < 30) add('登録30日未満', 25);
      else if (days < 180) add('登録半年未満', 15);
      else if (days < 365) add('登録1年未満', 8);
      if (u.blue && days < 365 && u.followers < 500) add('新規・小規模なのに有料バッジ', 10);
      const perDay = u.statuses / Math.max(days, 1);
      if (perDay > 100) add(`投稿ペース異常（1日約${Math.round(perDay)}件）`, 20);
      else if (perDay > 50) add(`投稿ペース高（1日約${Math.round(perDay)}件）`, 12);
      else if (u.statuses >= 100 && perDay >= 0.1 && perDay <= 30) add('自然な投稿ペース', -5);
      if (days >= 10 * 365.25) add('登録10年以上', -20);
      else if (days >= 5 * 365.25) add('登録5年以上', -10);
    }
    if (u.followers < 10) add('フォロワー10人未満', 12);
    else if (u.followers < 100) add('フォロワー100人未満', 6);
    if (u.following >= 100 && u.following / Math.max(u.followers, 1) >= 10) add('フォロー過多（フォロワーの10倍以上）', 10);
    if (/^[A-Za-z_]+\d{6,}$/.test(u.screenName)) add('自動生成風のユーザー名', 8);
    if (u.defaultAvatar) add('初期アイコン', 8);
    if (!u.bio) add('自己紹介なし', 4);
    if (u.followers >= 100000) add('フォロワー10万人以上', -20);
    else if (u.followers >= 10000) add('フォロワー1万人以上', -10);
    else if (u.followers >= 1000) add('フォロワー1000人以上', -5);
    if (u.followers >= 100 && u.followers >= u.following) add('フォロワーがフォロー以上', -5);
    if (u.bio && !u.defaultAvatar && (u.location || u.hasUrl)) add('プロフィールが充実', -5);
    if (u.verifiedType === 'Business' || u.verifiedType === 'Government') add('組織認証', -15);
    return s;
  }

  function findDuplicates(replies) {
    const items = replies
      .map((t) => ({ t, c: compact(t.text) }))
      .filter((x) => x.c.length >= 15)
      .map((x) => ({ ...x, g: bigrams(x.c) }));
    const parent = items.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].t.user.id === items[j].t.user.id) continue;
        if (jaccard(items[i].g, items[j].g) >= 0.75) parent[find(i)] = find(j);
      }
    }
    const groups = new Map();
    items.forEach((x, i) => {
      const r = find(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(x.t);
    });
    return [...groups.values()].filter((g) => new Set(g.map((t) => t.user.id)).size >= 2);
  }

  function isoWeek(ms) {
    return Math.floor(ms / (7 * DAY));
  }

  XCA.analyze = function (focal, replies, now = Date.now()) {
    const clusters = findDuplicates(replies);
    const dupUsers = new Map();
    for (const group of clusters) {
      const size = new Set(group.map((t) => t.user.id)).size;
      for (const t of group) dupUsers.set(t.user.id, Math.max(dupUsers.get(t.user.id) || 0, size));
    }

    const byUser = new Map();
    for (const t of replies) {
      if (!byUser.has(t.user.id)) byUser.set(t.user.id, { user: t.user, comments: [] });
      byUser.get(t.user.id).comments.push(t);
    }

    const recent = (u) => u.createdAt && now - u.createdAt < 2 * 365.25 * DAY;
    const weekCount = new Map();
    for (const { user } of byUser.values()) {
      if (recent(user)) {
        const w = isoWeek(user.createdAt);
        weekCount.set(w, (weekCount.get(w) || 0) + 1);
      }
    }

    const focalGrams = bigrams(compact(focal.text));
    const rows = [...byUser.values()].map(({ user, comments }) => {
      comments.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
      const signals = accountSignals(user, now);
      const add = (label, points) => signals.push({ label, points });
      const texts = comments.map((c) => cleanText(c.text));

      if (dupUsers.has(user.id)) add(`他${dupUsers.get(user.id) - 1}アカウントとほぼ同文`, 30);
      if (comments.length >= 3) add(`同スレッドに${comments.length}回投稿`, 10);
      if (texts.some((x) => PATTERNS.whatabout.test(x))) add('話題転換の表現', 15);
      if (texts.some((x) => PATTERNS.attack.test(x))) add('人格攻撃・レッテル表現', 10);
      if (texts.some((x) => PATTERNS.incite.test(x))) add('扇動・拡散呼びかけ', 10);
      const harmful = texts.some((x) => PATTERNS.whatabout.test(x) || PATTERNS.attack.test(x) || PATTERNS.incite.test(x));
      if (!harmful && !dupUsers.has(user.id) && focalGrams.size >= 4) {
        const onTopic = comments.some((c) => {
          const g = compact(c.text);
          return g.length >= 8 && jaccard(bigrams(g), focalGrams) >= 0.05;
        });
        if (onTopic) add('元投稿の話題に沿った発言', -10);
      }
      if (focalGrams.size >= 4) {
        const offTopic = comments.some((c) => {
          const g = compact(c.text);
          return g.length >= 30 && jaccard(bigrams(g), focalGrams) < 0.01;
        });
        if (offTopic) add('元投稿と語彙の重なりがほぼない長文', 8);
      }
      if (comments.some((c) => c.hasUrl)) add('外部リンクを投稿', 6);
      if (!NO_LANG.has(focal.lang) && comments.some((c) => !NO_LANG.has(c.lang) && c.lang !== focal.lang)) {
        add('元投稿と異なる言語', 6);
      }
      if (recent(user) && weekCount.get(isoWeek(user.createdAt)) >= 3) add('同じ週に登録した返信者が3人以上', 8);

      signals.sort((a, b) => b.points - a.points);
      const psyop = clamp(signals.reduce((sum, x) => sum + x.points, 0), -100, 100);
      return { user, comments, credibility: credibility(user, now), psyop: { score: psyop, signals } };
    });
    rows.sort((a, b) => b.psyop.score - a.psyop.score);

    const n = rows.length;
    const avg = (f) => (n ? rows.reduce((s, r) => s + f(r), 0) / n : 0);
    const share = (f) => (n ? rows.filter(f).length / n : 0);
    const highShare = share((r) => r.psyop.score >= 50);
    const dupShare = share((r) => dupUsers.has(r.user.id));
    const avgPsyop = avg((r) => r.psyop.score);
    return {
      rows,
      clusters,
      summary: {
        users: n,
        comments: replies.length,
        avgCredibility: Math.round(avg((r) => r.credibility.score)),
        avgPsyop: Math.round(avgPsyop),
        threadIndex: Math.round(clamp(avgPsyop * 0.5 + highShare * 30 + dupShare * 20, -100, 100)),
        high: rows.filter((r) => r.psyop.score >= 50).length,
        newShare: share((r) => r.user.createdAt && now - r.user.createdAt < 180 * DAY),
        blueShare: share((r) => r.user.blue),
      },
    };
  };

  XCA.psyopLevel = (s) =>
    s >= 75 ? '疑い 非常に高' : s >= 50 ? '疑い 高' : s >= 25 ? '疑い 中' : s > -25 ? '中立' : s > -50 ? '信頼 中' : '信頼 高';
})();
