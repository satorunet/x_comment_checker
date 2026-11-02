# Xコメント認知戦チェッカー

Xのポストに付いた返信を集めて、返信者のフォロワー数、登録日、バッジ、発言を一覧にする Chrome 拡張機能です。信用度と認知戦度の目安スコアを、根拠つきで表示します。

配布ページ: https://satoru.net/app/commenter-analyzer/

## 入れ方

1. このリポジトリをダウンロードします。
2. `chrome://extensions` を開き、「デベロッパーモード」をオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」で `extension` フォルダを選びます。
4. 開いている X のタブを再読み込みします。

Chrome 111 以降で動作します。

## 仕組み

| ファイル | 役割 |
|---|---|
| `extension/src/hook.js` | X が読み込む API 応答を複製して渡します（MAIN ワールド） |
| `extension/src/parser.js` | 応答から投稿とユーザーを取り出します |
| `extension/src/scoring.js` | スコアと根拠を計算します |
| `extension/src/content.js` | ボタン、自動スクロール、一覧画面を担当します |

追加の API リクエストや外部への送信はありません。

## スコアについて

配点は作者が決めた基準で、統計的に検証したものではありません。高いスコアは工作やなりすましの証拠ではなく、大きなマイナスも信頼を保証しません。スコアだけを根拠に、特定の人を名指ししないでください。

## テスト

Playwright を使い、x.com を模擬した環境で実際の Chromium に拡張機能を読み込んで確認します。

```sh
CHROME=/path/to/chrome PW_PATH=/path/to/node_modules/playwright SHOT=/tmp/shot.png node tests/e2e.cjs
```

## 注意

X の仕様が変わると動かなくなることがあります。自動スクロールでの収集は X の利用規約に触れる可能性があるので、ご自身の判断でお使いください。個人の制作物で、X Corp. とは関係ありません。

## ライセンス

[MIT License](LICENSE)
