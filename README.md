# Screen Blueprint Studio

> **Turn semantic screen blueprints into a shared workspace where humans and AI refine product behavior through reviewable WebMCP change sets.**

Screen Blueprint Studioは、意味のあるUIコンポーネントを組み合わせて画面を構築し、同じ構造化モデルからワイヤーフレーム、画面状態、イベント、API連携を管理するWebアプリです。npm packageおよび想定リポジトリ名は`screen-blueprint-studio`です。

自由描画型のデザインツールではありません。画面をコンポーネントツリーとして定義することで、表示と仕様の乖離を抑えます。人間は通常のUIで直接編集でき、AIエージェントはWebMCPを通じて現在の画面や選択状態を読み取り、安全な変更案を作成できます。

## 主な機能

- 複数画面の管理
- Page、Section、Container、入力、ボタン、Alert、Modalなどの意味的コンポーネント。ModalはPage外の独立frameとして管理
- Page／Section／Container／Modalごとのvertical、horizontal、gridレイアウト設定
- パレットからの追加、構造ツリー／キャンバスでの並び替え・セクション間移動に対応したdrag & drop
- コンポーネントパレット、構造ツリー、ワイヤーフレームキャンバス、仕様インスペクター
- 自由に命名できる画面状態と状態別override
- click／submitイベント、画面遷移、状態変更、Alert表示、API呼び出しのモデル化
- API operationと画面項目、成功／失敗状態の関連付け
- 人間による通常編集、確定操作のUndo
- `localStorage`への保存、破損データのrecovery UI、保存不能時のJSON退避
- runtime invariant validationとprototype-chain ID対策
- 10個の型付きWebMCPツール

## 人間とAIの共同編集

AIによる書き込みは確定モデルへ直接反映されません。WebMCPの`begin_change_set`だけがactive change setを開始し、その中へoperationを追加します。通常時の人間操作は直接確定し、active change set中の修正だけが同じchange setへ入ります。変更は同じキャンバスへpreviewされ、人間が内容を確認して承認または却下します。

```text
人間が画面やコンポーネントを選択
  ↓
AIがWebMCPで現在のページ状態を取得
  ↓
AIがchange setへ型付きoperationを追加
  ↓
同じUIでpreview
  ↓
人間が修正・承認・却下
```

確定済みの`document`とpreview用の`effectiveDocument`は分離されています。無効なoperation、古いrevision、壊れた参照、型不一致は共通のdomain validationで拒否されます。

## 技術スタック

- React 19
- TypeScript（strict mode）
- Vite 6
- Zustand 5
- nanoid
- dnd-kit
- 型付きJA/EN UI辞書
- CSS Modules
- WebMCP `document.modelContext`
- ブラウザ`localStorage`

## 基本操作

- パレット項目はクリックで選択中containerへ追加、ドラッグでtree/canvasの任意位置へ追加。Modalだけは選択位置に依存せずScreen直下の独立frameとして追加
- treeの`⠿` handle、またはcanvasでcomponentをhover／選択した時だけ現れるfloating handleで、同一container内の並び替えまたは別containerへの移動
- Inspectorの「レイアウト」でcontainerの方向、間隔、配置、折り返し、grid列数を編集
- componentを選択して`Delete`/`Backspace`で削除、`Escape`で選択解除
- 入力欄外で`Cmd+Z`/`Ctrl+Z`を押すと確定操作をUndo
- Screensタブで画面の追加、選択、名前・route編集、削除
- canvas上部の`+`から任意名の状態を追加し、選択中の非default状態は`⋯`から名前・説明を編集または削除
- 非default状態でcomponentを選択し、Inspectorの「状態別設定」で表示・有効状態・内容をoverride
- headerの`EN` / `JA`でUI言語を即時切替（選択はlocalStorageへ保存）

Page／Modal root、別screen、leaf、自分自身・子孫へのdropは拒否されます。Modal root自体はreparentできませんが、Page treeとModal treeの通常componentは相互に移動できます。active change set中のdragや編集は、人間によるoperationとしてproposalへ追加されます。
drop位置はdrag中だけ挿入line・outlineで示し、preview上へ説明文やplaceholderを常設しません。画面名は画面一覧・管理用の名称、root pageの「ページタイトル」はpreview内容です。treeとdrag表示にはtitle、label、textなど実際の画面仕様を使います。

## ローカル実行

Node.jsとnpmが利用できる環境で、リポジトリのルートから実行します。

```bash
npm install
npm run dev
```

Viteが表示したURL（通常は <http://localhost:5173>）をChromeで開きます。

その他のコマンド:

```bash
# TypeScript buildとproduction bundle
npm run build

# domain、persistence、store、WebMCPの回帰テスト
npm run test:regression

# build済みproduction bundleのローカルpreview
npm run preview
```

`npm run preview`を使う場合は、先に`npm run build`を実行してください。

## WebMCPをChromeで確認する

WebMCP testing対応Chromeで次のflagを有効にし、ブラウザを再起動します。

```text
chrome://flags/#enable-webmcp-testing
```

アプリを開き、Chrome DevToolsの`Application`内にあるWebMCP表示から登録ツールを確認します。WebMCPは実験的APIのため、ChromeのバージョンによってDevTools上の表示名や場所が変わる場合があります。

`document.modelContext`が利用できないブラウザでも登録処理は安全にskipされ、**人間向けUIはそのまま利用できます**。

## WebMCPツール

現在は次の10ツールを登録します。

| 分類 | ツール | 概要 |
| --- | --- | --- |
| Read | `get_current_screen_context` | 現在の画面、状態、選択、revision、change set contextを取得 |
| Read | `get_component` | ID指定または選択中のコンポーネント詳細を取得 |
| Read | `get_screen_diagnostics` | 画面の軽量な構造診断を取得 |
| Read | `get_pending_change_set` | active change setとoperationを取得 |
| Write | `begin_change_set` | review対象のchange setを開始 |
| Write | `change_screen_structure` | 画面の追加、更新、削除を提案 |
| Write | `change_component_structure` | コンポーネントの追加、移動、削除を提案 |
| Write | `update_component_spec` | コンポーネントの共通仕様、種類別設定を提案 |
| Write | `upsert_screen_state` | 非default状態の作成、更新、削除を提案 |
| Write | `connect_behavior` | イベント／API operationの接続または削除を提案 |

Readツールには`readOnlyHint`を付与しています。Writeツールはactive change set ID、確定revision、change set versionを検証し、成功したoperationだけをpreviewへ追加します。承認と却下は人間向けUIに限定しています。

## プロジェクト構成

```text
.
├── docs/
│   ├── HACKATHON_BRIEF.md
│   ├── MVP_TECHNICAL_DESIGN.md
│   └── PRODUCT_DIRECTION.md
├── scripts/
│   └── regression.mjs
├── src/
│   ├── app/             # Zustand store、app shell、keyboard editing、recovery/error UI
│   ├── dnd/             # dnd-kit context、drop validation、drop zones
│   ├── domain/          # model、commands、invariants、runtime validation
│   ├── features/        # canvas、palette、screen list、tree、inspector
│   ├── i18n/            # 型付きJA/EN UI辞書とlocale provider
│   ├── persistence/     # localStorage保存・復旧
│   ├── sample/          # 初期サンプルproject
│   ├── styles/
│   └── webmcp/          # tool definitionsとJSON Schema
├── index.html
├── package.json
└── vite.config.ts
```

## 設計ドキュメント

- [プロダクト方針](./docs/PRODUCT_DIRECTION.md)
- [MVP技術設計](./docs/MVP_TECHNICAL_DESIGN.md)
- [WebMCP Challenge概要・評価基準](./docs/HACKATHON_BRIEF.md)

## Acknowledgements

画面仕様を構造化し、状態・イベント・APIとの関係を扱う考え方について、[itwillrain/screen-spec](https://github.com/itwillrain/screen-spec)を参考にしました。本アプリはその着想を踏まえつつ、独自のデータモデル、UI、WebMCP共同編集フローとして新規実装しています。screen-specのソースコードやアセットは流用していません。

## License

このプロジェクトは[MIT License](./LICENSE)で公開します。
