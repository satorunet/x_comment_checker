// X GraphQL応答から投稿とユーザーを取り出す。応答の階層変更に強いよう、全体を走査する。
(() => {
  const XCA = (globalThis.XCA = globalThis.XCA || {});

  function normalizeUser(r) {
    if (!r || !r.rest_id) return null;
    const l = r.legacy || {};
    const c = r.core || {};
    const screenName = l.screen_name ?? c.screen_name;
    if (!screenName) return null;
    const avatar = l.profile_image_url_https ?? r.avatar?.image_url ?? '';
    return {
      id: r.rest_id,
      screenName,
      name: l.name ?? c.name ?? screenName,
      createdAt: Date.parse(l.created_at ?? c.created_at ?? r.created_at ?? '') || null,
      followers: l.followers_count ?? r.relationship_counts?.followers ?? 0,
      following: l.friends_count ?? r.relationship_counts?.following ?? 0,
      statuses: l.statuses_count ?? r.tweet_counts?.tweets ?? 0,
      blue: !!r.is_blue_verified,
      verifiedType: r.verification?.verified_type ?? l.verified_type ?? null,
      bio: l.description ?? r.profile_bio?.description ?? '',
      location: (typeof r.location === 'object' ? r.location?.location : l.location) ?? '',
      hasUrl: !!(l.url ?? r.profile_url),
      defaultAvatar: l.default_profile_image ?? /default_profile/.test(avatar),
      avatar,
    };
  }

  function normalizeTweet(node) {
    const user = normalizeUser(node.core.user_results.result);
    if (!user) return null;
    const l = node.legacy;
    return {
      id: node.rest_id,
      conversationId: l.conversation_id_str,
      inReplyTo: l.in_reply_to_status_id_str ?? null,
      text: node.note_tweet?.note_tweet_results?.result?.text ?? l.full_text ?? '',
      lang: l.lang ?? 'und',
      createdAt: Date.parse(l.created_at) || null,
      likes: l.favorite_count ?? 0,
      views: node.views?.count != null ? Number(node.views.count) : null, // 非公開・古い投稿は null
      hasUrl: (l.entities?.urls?.length ?? 0) > 0,
      user,
    };
  }

  XCA.extractTweets = function (json) {
    const out = [];
    const stack = [json];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (node.rest_id && node.legacy?.conversation_id_str && node.core?.user_results?.result) {
        const tweet = normalizeTweet(node);
        if (tweet) out.push(tweet);
      }
      for (const key in node) {
        const v = node[key];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return out;
  };

  // 焦点の投稿より後に同じ会話で投稿された、投稿者本人以外の発言を返す
  XCA.selectReplies = function (tweets, focal) {
    const focalId = BigInt(focal.id);
    return tweets.filter(
      (t) =>
        t.conversationId === focal.conversationId &&
        t.id !== focal.id &&
        t.user.id !== focal.user.id &&
        BigInt(t.id) > focalId
    );
  };
})();
