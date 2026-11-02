// 実Chromiumに拡張を読み込み、x.comをモックして動作確認する
const path = require('path');
const { chromium } = require(process.env.PW_PATH);
const EXT = path.resolve(__dirname, '../extension');
const iso = (d) => new Date(d).toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (.*) GMT$/, '$1 $3 $2 $5 +0000 $4');

let seq = 1000n;
function tweet(id, conv, u, text, extra = {}) {
  return {
    __typename: 'Tweet', rest_id: String(id),
    views: extra.views != null ? { count: String(extra.views), state: 'EnabledWithCount' } : { state: 'Enabled' },
    core: { user_results: { result: u } },
    legacy: { conversation_id_str: conv, full_text: text, lang: extra.lang || 'ja', created_at: iso(Date.now()), favorite_count: extra.likes || 0, entities: { urls: extra.urls || [] } },
  };
}
const oldUser = (id, sn, o) => ({ __typename: 'User', rest_id: id, is_blue_verified: !!o.blue, verification: { verified_type: o.vt }, legacy: {
  screen_name: sn, name: o.name || sn, created_at: iso(o.created), followers_count: o.f, friends_count: o.g, statuses_count: o.s,
  description: o.bio ?? 'bio', default_profile_image: !!o.def, profile_image_url_https: 'https://pbs.twimg.com/a.jpg' } });
const newUser = (id, sn, o) => ({ __typename: 'User', rest_id: id, is_blue_verified: !!o.blue,
  core: { screen_name: sn, name: o.name || sn, created_at: iso(o.created) },
  legacy: { followers_count: o.f, friends_count: o.g, statuses_count: o.s, description: o.bio ?? 'bio', default_profile_image: !!o.def, profile_image_url_https: 'https://pbs.twimg.com/a.jpg' } });

const FOCAL = '2115765314646626447';
const b = (n) => (BigInt(FOCAL) + BigInt(n)).toString();
const day = 86400000;
const owner = oldUser('1', 'satorunet', { created: '2009-01-01', f: 20000, g: 500, s: 30000 });
const trusted = oldUser('2', 'veteran', { created: '2010-05-05', f: 150000, g: 300, s: 20000, vt: 'Business', name: '<img src=x onerror=window.__xss=1>' });
const botA = newUser('3', 'user83726155', { created: Date.now() - 10 * day, f: 3, g: 900, s: 4000, bio: '', def: true, blue: true });
const botB = newUser('4', 'hanako99182734', { created: Date.now() - 12 * day, f: 5, g: 800, s: 3000, bio: '', def: true });
const botC = newUser('5', 'taro77261538', { created: Date.now() - 11 * day, f: 8, g: 700, s: 3500, bio: '' });
const normal = oldUser('6', 'normal_jp', { created: '2016-03-03', f: 800, g: 600, s: 5000 });
const dup = 'この投稿は完全に間違っている。みんな騙されるな、真実を拡散して!';
const page1 = { data: { threaded_conversation_with_injections_v2: { instructions: [{ entries: [
  { content: { itemContent: { tweet_results: { result: tweet(FOCAL, FOCAL, owner, '今日の政策についての考察です。増税の議論を整理しました。') } } } },
  { content: { itemContent: { tweet_results: { result: tweet(b(1), FOCAL, trusted, '@satorunet 増税の議論の整理、参考になりました。', { likes: 1234, views: 56789 }) } } } },
  { content: { itemContent: { tweet_results: { result: { __typename: 'TweetWithVisibilityResults', tweet: tweet(b(2), FOCAL, botA, '@satorunet ' + dup) } } } } },
  { content: { itemContent: { tweet_results: { result: tweet(b(3), FOCAL, owner, '@satorunet 補足です') } } } },
] }] } } };
const page2 = { data: { threaded_conversation_with_injections_v2: { instructions: [{ entries: [
  { content: { itemContent: { tweet_results: { result: tweet(b(4), FOCAL, botB, '@satorunet ' + dup + ' https://t.co/x', { urls: [{}] }) } } } },
  { content: { itemContent: { tweet_results: { result: tweet(b(5), FOCAL, botC, '@satorunet それより隣国の問題はどうなんだ?バカじゃないの', { likes: 5, views: 999999 }) } } } },
  { content: { itemContent: { tweet_results: { result: tweet(b(6), FOCAL, normal, '@satorunet =HYPERLINK("x") 増税には反対です') } } } },
  { content: { itemContent: { tweet_results: { result: tweet(b(7), FOCAL, normal, '@satorunet 追加の意見です。' + 'あ'.repeat(200) + 'おわり', { likes: 50, views: 100 }) } } } },
] }] } } };

const HTML = `<!doctype html><html><body style="background:#000;height:6000px"><div id=t></div><script>
let n=0;
async function load(){ if(n>=2) return; n++; const r=await fetch('/i/api/graphql/abc/TweetDetail?variables='+n); await r.text(); }
load();
addEventListener('scroll',()=>{ if(scrollY>1000) load(); });
</script></body></html>`;

(async () => {
  const ctx = await chromium.launchPersistentContext('', {
    executablePath: process.env.CHROME, headless: true, acceptDownloads: true,
    args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  const errors = [];
  await ctx.route('https://x.com/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.includes('/graphql/')) {
      const p = u.searchParams.get('variables') === '1' ? page1 : page2;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(p) });
    }
    return route.fulfill({ status: 200, contentType: 'text/html', body: HTML });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`https://x.com/satorunet/status/${FOCAL}`);
  const fab = page.locator('#commenter-analyzer-root .fab');
  await fab.waitFor({ timeout: 8000 });
  await fab.click();
  await page.locator('#commenter-analyzer-root h2:has-text("5人 / 6件")').waitFor({ timeout: 30000 });

  const badges = await page.locator('#commenter-analyzer-root tbody tr').evaluateAll((trs) =>
    Object.fromEntries(trs.filter((tr) => tr.querySelector('.who')).map((tr) => [tr.querySelector('.who small').textContent, tr.querySelector('.badge').getAttribute('class')])));
  const allRows = await page.locator('#commenter-analyzer-root tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim())));
  const rows = allRows.filter((r) => r.length === 9);
  console.table(rows.map((r) => ({ psyop: r[0], cred: r[1], user: r[2], flw: r[3], flg: r[4], date: r[5], badge: r[6], time: r[7], text: r[8].slice(0, 30) })));

  await page.locator('#commenter-analyzer-root .score-btn').first().click();
  console.log('detail:', (await page.locator('#commenter-analyzer-root .detail').first().innerText()).replace(/\n+/g, ' | '));
  console.log('cards:', (await page.locator('#commenter-analyzer-root .cards').innerText()).replace(/\n+/g, ' '));
  await page.locator('#commenter-analyzer-root .sort-btn:has-text("いいね順")').click(); await page.screenshot({ path: process.env.SHOT }); await page.locator('#commenter-analyzer-root .sort-btn:has-text("いいね順")').click(); await page.locator('#commenter-analyzer-root th[data-key=psyop]').click();

  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#commenter-analyzer-root .btn:has-text("CSV")').click()]);
  const fs = require('fs');
  const csv = fs.readFileSync(await dl.path(), 'utf8');

  const firstUser = () => page.locator('#commenter-analyzer-root tbody .who small').first().textContent();
  const asserts = {
    'XSS not fired': (await page.evaluate(() => window.__xss)) === undefined,
    'no page errors': errors.length === 0,
    'owner excluded': !rows.some((r) => r[2].includes('@satorunet')),
    'new-format user parsed': rows.some((r) => r[2].includes('@user83726155') && r[3] === '3'),
    'bots outrank veteran': +rows[0][0].match(/\d+/)[0] >= 50 && +rows.find((r) => r[2].includes('@veteran'))[0].match(/-?\d+/)[0] <= -50,
    'normal user is negative': +rows.find((r) => r[2].includes('@normal_jp'))[0].match(/-?\d+/)[0] < 0,
    'duplicate detected': /ほぼ同文/.test(await page.locator('#commenter-analyzer-root .detail').first().innerText()) ,
    'csv formula neutralised': csv.includes(`"'=HYPERLINK`),
    'likes and views shown': /1,234 56,789/.test(rows.find((r) => r[2].includes('@veteran'))[8]),
    'missing views shown as dash': / 0 —/.test(rows.find((r) => r[2].includes('@normal_jp'))[8]),
    'csv has likes and views': csv.includes('"いいね数","表示数"') && csv.includes('"1234","56789"'),
    'blue badge': badges['@user83726155'] === 'badge badge-blue',
    'gold badge': badges['@veteran'] === 'badge badge-gold',
    'no badge is faint': badges['@normal_jp'] === 'badge badge-none',
    'stat icons': (await page.locator('#commenter-analyzer-root .stat svg').count()) === 12,
    'time is own column': rows.every((r) => /^\d+\/\d+ \d\d:\d\d$/.test(r[7]) && !/\d+\/\d+ \d\d:\d\d/.test(r[8])),
    'second comment gets own row': allRows.some((r) => r.length === 2 && /^\d+\/\d+ /.test(r[0]) && r[1].includes('追加の意見です')),
    'days under date': /^\d{4}-\d\d-\d\d 10日$/.test(rows.find((r) => r[2].includes('@user83726155'))[5]),
    'days use separators': /^2010-05-0\d \d{1,2},\d{3}日$/.test(rows.find((r) => r[2].includes('@veteran'))[5]),
    'renamed button and panel': (await page.locator('#commenter-analyzer-root .fab').textContent()) === 'Xコメント陽動チェッカー' && (await page.locator('#commenter-analyzer-root h2').innerText()).startsWith('Xコメント陽動チェッカー'),
    'csv bom': csv.charCodeAt(0) === 0xfeff,
    'no separate link': (await page.locator('#commenter-analyzer-root .why').count()) === 0,
    'tap again closes': await (async () => {
      await page.locator('#commenter-analyzer-root .score-btn').first().click();
      return (await page.locator('#commenter-analyzer-root .detail').count()) === 0;
    })(),
    'credibility tap opens and closes': await (async () => {
      const b = page.locator('#commenter-analyzer-root .cred-btn').first();
      await b.click();
      const d = page.locator('#commenter-analyzer-root .detail');
      const opened = (await d.count()) === 1 && (await d.innerText()).includes('社会信用度スコア');
      await page.locator('#commenter-analyzer-root .cred-btn').first().click();
      return opened && (await d.count()) === 0;
    })(),
    'long comment collapsed then expands in place': await (async () => {
      const rowsBefore = await page.locator('#commenter-analyzer-root tbody tr').count();
      const c = page.locator('#commenter-analyzer-root .comment', { hasText: '追加の意見' });
      const collapsed = !(await c.innerText()).includes('おわり') && (await c.innerText()).includes('…');
      await c.locator('.more').click();
      const opened = (await c.innerText()).includes('おわり') && (await c.locator('.more').innerText()) === '閉じる';
      await c.locator('.more').click();
      return collapsed && opened && !(await c.innerText()).includes('おわり') && rowsBefore === (await page.locator('#commenter-analyzer-root tbody tr').count());
    })(),
    'short comment has no toggle': (await page.locator('#commenter-analyzer-root .comment', { hasText: 'HYPERLINK' }).locator('.more').count()) === 0,
    'csv keeps full text': csv.includes('おわり'),
    'sort by likes': await (async () => {
      await page.locator('#commenter-analyzer-root .sort-btn:has-text("いいね順")').click();
      return (await firstUser()) === '@veteran';
    })(),
    'comments within a user follow likes': await (async () => {
      const t = await page.locator('#commenter-analyzer-root .comment').allInnerTexts();
      return t.findIndex((x) => x.includes('追加の意見')) < t.findIndex((x) => x.includes('HYPERLINK'));
    })(),
    'sort by views': await (async () => {
      await page.locator('#commenter-analyzer-root .sort-btn:has-text("表示順")').click();
      return (await firstUser()) === '@taro77261538';
    })(),
    'tap again reverses': await (async () => {
      const b = page.locator('#commenter-analyzer-root .sort-btn:has-text("表示順")');
      await b.click();
      return (await firstUser()) !== '@taro77261538' && (await b.innerText()).includes('▲');
    })(),
  };
  console.log(asserts);
  await ctx.close();
  process.exit(Object.values(asserts).every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
