# Screen Blueprint Studio 開発ガイド

[English](./DEVELOPMENT.md) · [製品概要](../README.ja.md) · [ポータブル仕様](./PORTABLE_SPEC.ja.md)

## 必要な環境とセットアップ

Node.js 22とnpmを使用します。browser regressionにはChromeまたはChromiumも必要です。

```bash
npm install
npm run dev
```

Viteが表示するURL（通常は <http://localhost:5173>）を開きます。

## コマンド

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | Vite development serverを起動 |
| `npm run build` | TypeScriptの型を確認し、production bundleを作成 |
| `npm run test:foundation` | canonical v3、resolver、invariant、Definition、Collection、WebMCPの基礎契約を確認 |
| `npm run test:ui-regression` | domain、store、persistence、UI契約、mounted DOMの回帰を確認 |
| `npm run test:browser-regression` | ChromeまたはChromiumでproduction DOMの回帰を確認 |
| `npm run test:regression` | 3つのregression suiteをすべて実行 |
| `npm run preview` | 作成済みの`dist` production bundleをローカル配信 |

完全なregressionまたはbrowser regressionは`dist`を配信するため、先にbuildします。

```bash
npm run build
npm run test:regression
```

Chromeが標準の場所にない場合は、実行ファイルを`CHROME_PATH`へ設定します。browser runnerは分離したlocal serverとbrowser profileを起動し、production DOMを操作して、macOS／Linuxではprocess treeを終了します。このprocess-tree cleanupはWindowsには対応していません。

## Architectureとプロジェクト構成

このアプリはReactとTypeScriptによるclient-side editorです。workspace stateをZustand、画面表示をCSS Modules、構造のdrag and dropをdnd-kitが担当します。

確定済みのcanonical documentとeditor workspace stateは分離されています。人間の編集は確定documentとworkspace revisionを更新します。AIの書き込みはactive change setへ集められ、preview用のeffective documentへ反映されます。change setを適用すると確定documentをatomicに置き換え、破棄した場合は確定documentを変更しません。

```text
.
├── public/
│   ├── examples/         # Canonical v3 example
│   └── schemas/          # 公開canonical v3 JSON Schema
├── scripts/              # Foundation、UI、Chrome regression runner
├── src/
│   ├── app/              # Store、app shell、review lock、recovery、shortcut
│   ├── config/           # Build-time feature flag
│   ├── dnd/              # Drag context、drop zone、placement validation
│   ├── domain/           # Model、command、invariant、resolver、transaction
│   ├── features/         # Canvas、Tree、Inspector、Palette、Flow、Definitions
│   ├── i18n/             # 型付き英語・日本語UI message
│   ├── persistence/      # localStorageのworkspace cacheとrecovery
│   ├── sample/           # TaskFlow sample project
│   ├── styles/           # 共通style
│   └── webmcp/           # Tool定義、schema、parse、registration
├── package.json
└── vite.config.ts
```

canonical document modelとidentity ruleは[ポータブル仕様ガイド](./PORTABLE_SPEC.ja.md)を参照してください。

## 開発専用のsample reset

`Reset to sample`は開発補助です。`VITE_ENABLE_SAMPLE_RESET`が厳密に`true`でない限り、通常のdevelopment、production build、GitHub Pagesでは表示されません。

```bash
VITE_ENABLE_SAMPLE_RESET=true npm run dev
```

同じcontrolを含むproduction build:

```bash
VITE_ENABLE_SAMPLE_RESET=true npm run build
```

`.env.local`へ値を設定することもできます。未設定、空文字、`false`、`1`ではcontrolを表示しません。壊れた保存dataを復旧する操作は常に利用でき、このflagには依存しません。

## ChromeでのWebMCP manual verification

WebMCPは実験的な機能です。対応するChrome buildで次のflagを有効にします。

```text
chrome://flags/#enable-webmcp-testing
```

Chromeを再起動してアプリを開き、Chrome DevToolsでWebMCPを確認します。現行releaseは11個のtoolを登録します。

| Tool | 役割 |
| --- | --- |
| `get_current_screen_context` | effectiveなactive screen、selection、revision、proposal metadataを読む |
| `get_component` | componentまたはcanonicalなresolved targetを読む |
| `get_pending_change_set` | active proposalとreview diffを読む |
| `begin_change_set` | AI proposalを開始 |
| `change_screen_structure` | screenを追加、更新、削除 |
| `change_component_structure` | componentを追加、移動、複製、削除 |
| `update_component_spec` | componentの内容、配置、size、種類別設定を更新 |
| `upsert_screen_state` | 名前付きscreen stateを作成、更新、削除 |
| `connect_behavior` | EventとAPI operationを作成、更新、削除 |
| `manage_component_definition` | Definition、公開property、Variantを管理 |
| `manage_definition_instance` | Instanceの追加・更新、shared componentの抽出・detach |

Manual checkの例:

1. 11個のtoolが一度だけ登録され、console errorがないことを確認します。
2. `get_current_screen_context`を実行し、表示中のactive screenとselectionが返ることを確認します。
3. `begin_change_set`でproposalを開始します。
4. 戻り値のchange-set ID、confirmed revision、change-set versionを使い、型付きwriteを1件実行します。
5. `get_pending_change_set`のsummary／field diffとアプリ上のpreviewを比較します。
6. 人向けUIでproposalを反映または破棄し、review lockが解除されることを確認します。

Registrationは各`registerTool()`の完了を待ちます。途中で失敗した場合は、共通のabort signalで登録済みtoolを解除してerrorを報告します。`document.modelContext`がないbrowserではregistrationをskipし、人向けeditorはそのまま利用できます。

## Contribution時の確認

実装中は変更箇所に合う最小のtestを使い、安定後にcomplete regressionを実行します。文書だけの変更は、生成物や実行可能exampleを変更しない限り、linkと内容の整合確認だけで構いません。

Canonical v3契約は、意図的に複数のsurfaceへ表現されています。変更時は次を同期します。

- `src/domain/`のTypeScript modelとcanonical constant
- Runtime parse、semantic invariant、command、clone、resolver
- WebMCP input schema、parser、projection、tool description
- `public/schemas/screen-blueprint-project-v3.schema.json`
- `public/examples/screen-blueprint-project-v3.json`
- TaskFlow sample、Inspector、Canvas、Tree、change-set presentation
- 英語・日本語のUI messageと公開文書
- Foundation、UI、browser regression

Validationを弱めたり、未対応fieldを黙って捨てたりしてdriftを解消しないでください。canonical changeは、すべての対応surfaceでround-tripするか、明示的なvalidation errorで失敗する必要があります。copy、extract、detach、reference rewriteではstable IDとJSON Pointer pathを維持します。

Contribution前の確認:

```bash
git diff --check
npm run build
npm run test:regression
```
