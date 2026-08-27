# WebMCP Challenge starter

WebMCP Challenge向けの最小動作確認用リポジトリです。

人間向けの画面と、AIエージェント向けのWebMCPツールを同じページに置いています。現在はローカル状態だけを扱うメモアプリの雛形です。

## 起動

WebMCPはブラウザ上のページとして動かすため、ローカルHTTPサーバーで起動します。

```bash
cd /Users/moritaatsuya/Desktop/work/webmcp-challenge
python3 -m http.server 4173
```

Chromeで <http://localhost:4173> を開いてください。Chrome側で次を有効にして再起動しておきます。

```text
chrome://flags/#enable-webmcp-testing
```

Chrome DevToolsの `Application → WebMCP` で、次の2つのツールが表示されます。

- `getNotes`（読み取り）
- `addNote`（書き込み）

## 構成

- `index.html`: 人間向けのメモ画面
- `app.js`: 画面ロジックとWebMCPツール登録
- `styles.css`: 最小限のスタイル

## 次の候補

- 実際のハッカソン案に合わせて画面とツールを置き換える
- 読み取り系ツールと書き込み系ツールを分離する
- Chrome DevTools for agents / `chrome-devtools-mcp` でエージェントから操作する
- Challenge提出用に公開URL、リポジトリ、デモ動画を用意する

