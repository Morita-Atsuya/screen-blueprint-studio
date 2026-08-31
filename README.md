<img src="./brand/logo-lockup.svg" alt="Screen Blueprint Studio" width="324">

# Screen Blueprint Studio

> **Turn semantic screen blueprints into a shared workspace where humans and AI refine product behavior through reviewable WebMCP change sets.**

[Live demo](https://morita-atsuya.github.io/screen-blueprint-studio/)

Screen Blueprint Studioは、意味のあるUIコンポーネントを組み合わせて画面を構築し、同じ構造化モデルからワイヤーフレーム、画面状態、イベント、API連携を管理するWebアプリです。npm packageおよび想定リポジトリ名は`screen-blueprint-studio`です。

自由描画型のデザインツールではありません。画面をコンポーネントツリーとして定義することで、表示と仕様の乖離を抑えます。人間は通常のUIで直接編集でき、AIエージェントはWebMCPを通じて現在の画面や選択状態を読み取り、安全な変更セットを作成できます。

## 主な機能

- 複数画面の管理
- Page、Section、Container、入力、ボタン、Alert、Modalなどの意味的コンポーネント。ModalはPage外の独立frameとして管理
- Page／Section／Container／Modalごとのvertical、horizontal、gridレイアウト設定
- パレットからの追加、構造ツリー／キャンバスでの並び替え・セクション間移動に対応したdrag & drop
- Page／Modal root以外のcomponent subtreeを直後へatomicに複製。全状態overrideを引き継ぎ、event／API field bindingは複製しない
- Page／Modal root以外のcomponent subtreeをアプリ内clipboardへコピーし、選択したcontainer/rootの内側またはleaf直後へatomicに貼り付け。同一画面だけ状態overrideを引き継ぐ
- コンポーネントパレット、構造ツリー、ワイヤーフレームキャンバス、仕様インスペクター
- Inspectorで選択componentのevent／実行順actionと、同screenのAPI operation／request binding／結果state、`textInput`のvalidation ruleを追加・編集・削除・並べ替え
- 自由に命名できる画面状態と状態別override。Inspectorで基本値・明示override・実効値を分け、field単位またはcomponent単位で基本設定へ戻せる
- click／submitイベント、画面遷移、状態変更、Alert表示、API呼び出しのモデル化
- API operationと画面項目、成功／失敗状態の関連付け
- 人間による通常編集、確定操作のUndo／Redo
- 子孫・状態override・event／API参照などへ影響する削除だけを件数付きで確認し、削除直後はToastから安全にUndo
- `localStorage`への保存、破損データのrecovery UI、保存不能時のJSON退避
- runtime invariant validationとprototype-chain ID対策
- 未接続button、actionのないevent、結果stateのないAPI、未binding inputを候補として返す画面診断
- 10個の型付きWebMCPツール

初期sample projectは`COMPONENT_KIND_CATALOG`に定義された全component kindを最低1件含みます。regressionはsample、Palette、runtime validation、Canvas、Tree、Inspector、複製・Copy/Paste、削除・追加、WebMCP schemaのkind集合を正準catalogと照合し、kind追加時の横展開漏れを検出します。

## 人間とAIの共同編集

AIによる書き込みは確定モデルへ直接反映されません。WebMCPの`begin_change_set`だけがactive change setを開始し、その中へAI operationを追加します。active change setがない通常時だけ、人間操作は直接確定します。active change set中はreview lockとなり、選択、閲覧、Canvasのzoom/pan、Flow切替などは利用できますが、ProjectDocumentの編集、Undo／Redo、DnDはできません。先に変更セットを反映または破棄します。

```text
人間が画面やコンポーネントを選択
  ↓
AIがWebMCPで現在のページ状態を取得
  ↓
AIがchange setへ型付きoperationを追加
  ↓
同じUIでpreview
  ↓
人間が確認し、反映または破棄
  ↓
通常UIで人間が必要な修正を直接確定
  ↓
AIがcurrent modelと直近の破棄記録を再読し、次のchange setを作成
  ↓
人間がpreviewを確認して反映
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

- パレット項目をtree/canvasの任意位置へドラッグして追加。選択componentのコンテキストメニューからも追加でき、ModalはScreen直下の独立frameとして追加
- treeの`⠿` handle、またはcanvas上のPage／Modal root以外のcomponent面全体を掴み、同一container内の並び替えまたは別containerへ移動
- Inspectorの「レイアウト」でcontainerの方向、間隔、配置、折り返し、grid列数を編集
- componentを選択して`Delete`/`Backspace`で削除、`Escape`で選択解除
- Canvas／InspectorでPage／Modal root以外のcomponentを選択し、右クリックメニュー、Inspector、または`Cmd/Ctrl+D`からsubtreeを直後へ複製
- Canvas／Inspectorで`Cmd/Ctrl+C`またはCopyを使ってsubtreeをアプリ内clipboardへ保持し、有効な貼り付け先で`Cmd/Ctrl+V`またはPasteを実行。別画面へ貼り付ける場合は状態overrideを含めない
- 入力欄外で`Cmd+Z`/`Ctrl+Z`を押すとUndo、`Cmd/Ctrl+Shift+Z`または`Ctrl+Y`でRedo
- Screen／Inspectorのテキスト入力は編集中の内容をlocal draftとして保持し、単一行は`Enter`またはフォーカス移動、複数行はフォーカス移動で1操作として確定。`Escape`で未確定入力を取り消す
- Screensタブで画面の追加、選択、名前・route編集、削除
- canvas上部の`+`から任意名の状態を追加し、選択中の非default状態は`⋯`から名前・説明を編集または削除
- 非default状態でcomponentを選択し、Inspectorの「状態別設定」で表示・有効状態・内容をoverride
- Buttonや入力componentを選択し、Inspectorの「振る舞い」でeventと実行順action、API operationとrequest bindingを編集。field bindingの正準sourceは`ApiOperation.requestBindings`のみ。`textInput`ではvalidation rule（required／minLength／maxLength／pattern／email／custom）を追加・編集・削除・並べ替え
- headerの`EN` / `JA`でUI言語を即時切替（選択はlocalStorageへ保存）

Page／Modal root、別screen、leaf、自分自身・子孫へのdropは理由別に拒否されます。Modal root自体はreparentできませんが、Page treeとModal treeの通常componentは相互に移動できます。同じ位置へ戻すdropは正常なno-opとしてToast、history、change set operationを生成せず、対象外でdragを終えた場合やEscapeは通常cancelとして扱います。active change setが始まると進行中のdragは安全にcancelされ、反映または破棄まで新しいdragを開始できません。
drop位置はdrag中だけ挿入line・outlineで示し、無効な位置は別のchromeで識別できます。preview上へ説明文やplaceholderを常設しません。画面名は画面一覧・Page frameの識別に使うeditor metadataです。Page／Section／Container／Modalは構造とlayoutだけを持ち、表示する見出し・本文・補足はchildのTextとその表示スタイル、操作文言は各leaf componentで明示します。treeとdrag表示はleafのlabel／textなどの仕様値、または構造kindのeditor-only名を使います。

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

# domain、persistence、store、WebMCP、実browser表示の回帰テスト
npm run test:regression

# build済みproduction bundleのローカルpreview
npm run preview
```

`npm run preview`と`npm run test:regression`はbuild済みの`dist`を使うため、先に
`npm run build`を実行してください。回帰テストにはChromeまたはChromiumが必要です。
標準の場所にない場合は、実行ファイルの絶対pathを`CHROME_PATH`へ設定します。CIも
同じ順序でbuild後に、固定した`CHROME_PATH`のbrowser versionを確認してから実行します。
browser回帰のprocess-tree cleanupはmacOS/Linux向けで、Windowsは未対応です。

## WebMCPをChromeで確認する

WebMCP testing対応Chromeで次のflagを有効にし、ブラウザを再起動します。

```text
chrome://flags/#enable-webmcp-testing
```

アプリを開き、Chrome DevToolsの`Application`内にあるWebMCP表示から10ツールを確認します。登録は各`registerTool()` Promiseを順に待ち、途中失敗時は共通`AbortSignal`で既登録toolを解除してconsole errorを出します。WebMCPは実験的APIのため、ChromeのバージョンによってDevTools上の表示名や場所が変わる場合があります。

`document.modelContext`が利用できないブラウザでも登録処理は安全にskipされ、**人間向けUIはそのまま利用できます**。

提出前のnative manual smoke:

1. DevToolsで10ツールが登録され、consoleに登録成功が1回だけ出ることを確認する。
2. `get_current_screen_context`を空inputで実行し、effectiveなactive screen一式とconfirmed revisionを読む。
3. `begin_change_set`へsummaryを渡し、返却されたID、revision、versionを使って`update_component_spec`を1回実行する。
4. write成功後のversionで`get_pending_change_set`を読み、operation summary/diffと同じ変更のUI previewを確認する。
5. 人間向けUIからRejectまたはAcceptし、review lockが解除されることを確認する。

自動回帰はPromise登録stub、schema、handler、store、実Chrome上の通常UIを検証しますが、実験的なnative `document.modelContext`自体はCI Chromeで有効化していません。そのため上記native smokeを実行していない状態を成功扱いしません。

## WebMCPツール

現在は次の10ツールを登録します。

| 分類 | ツール | 概要 |
| --- | --- | --- |
| Read | `get_current_screen_context` | effectiveなactive screen一式、選択、confirmed revision、compact change set metadataを取得 |
| Read | `get_component` | ID指定または選択中のコンポーネント詳細を取得 |
| Read | `get_screen_diagnostics` | 画面仕様の不足候補をseverity/code付きで取得 |
| Read | `get_pending_change_set` | active change setのoperationとレビュー用summary/diffを取得 |
| Write | `begin_change_set` | review対象のchange setを開始 |
| Write | `change_screen_structure` | 画面の追加、更新、削除を変更セットへ追加 |
| Write | `change_component_structure` | コンポーネントの追加、複製、移動、削除を変更セットへ追加 |
| Write | `update_component_spec` | コンポーネントの共通仕様、種類別設定を変更セットへ追加 |
| Write | `upsert_screen_state` | 非default状態の作成、更新、削除を変更セットへ追加 |
| Write | `connect_behavior` | IDを保持したイベント／API operationの作成・更新・削除を変更セットへ追加 |

Readツールには`readOnlyHint`を付与しています。Writeツールはactive change set ID、確定revision、change set versionを検証し、成功したoperationだけをpreviewへ追加します。反映と破棄は人間向けUIに限定しています。

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
