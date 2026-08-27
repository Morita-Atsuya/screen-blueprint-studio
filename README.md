# Screen Spec Studio — WebMCP Challenge

WebMCP Challenge向けに、ワイヤーフレームと画面仕様を同じ構造化モデルから作成する共同編集Webアプリを開発するリポジトリです。

再利用可能なUIコンポーネントをCMSのように組み合わせ、画面項目、状態、イベント、API、権限、テスト観点を一体的に管理します。人間とAIエージェントは、同じキャンバス、選択、未保存ドラフト、変更案をWebMCP経由で共有します。

- 決定したプロダクト方針と設計引き継ぎ: [docs/PRODUCT_DIRECTION.md](./docs/PRODUCT_DIRECTION.md)
- Challenge概要、公式評価基準、提出要件: [docs/HACKATHON_BRIEF.md](./docs/HACKATHON_BRIEF.md)

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

## 現在地

- プロダクト方針はScreen Spec Studioで決定済み
- 現在のメモアプリはWebMCP接続確認用スターターであり、今後置き換える
- 次はデータモデル、コンポーネント、画面構成、WebMCPツールを設計する
- `screen-spec/` は参考調査用であり、提出アプリは原則として独立実装する
