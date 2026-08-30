# Screen Blueprint Studio MVP 技術設計

最終更新: 2026-08-27（JST）

ステータス: **MVP実装の基準設計**

関連資料:

- [PRODUCT_DIRECTION.md](./PRODUCT_DIRECTION.md)
- [HACKATHON_BRIEF.md](./HACKATHON_BRIEF.md)
- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [WebMCP repository](https://github.com/webmachinelearning/webmcp)

## 1. 目的

Screen Blueprint Studioは、意味付きUIコンポーネントから画面を組み立て、同じ構造化モデルからワイヤーフレーム、状態、イベント、API連携を表示するクライアント中心のWebアプリである。

MVPでは次の体験を完成させる。

1. 人間がAIなしでも画面仕様を作成、編集できる
2. エージェントが現在の画面、選択、未保存状態をWebMCPで取得できる
3. エージェントの変更は直接確定せず、同じ画面上のchange setとして表示される
4. 人間が変更案を確認、修正、承認、却下できる
5. エージェントがchange set内の人間の修正を読み、次の変更へ反映できる

WebMCPは状態管理そのものではなく、アプリ内の読み取り・更新操作をエージェントへ公開する境界である。人間向けUIとWebMCPツールは、同じcommand層と検証処理を使用する。

## 2. MVPの境界

### 2.1 対象

- 1プロジェクト、複数画面
- 画面の作成、選択、名称変更、削除
- イベントによる画面間の遷移関係
- 1ブラウザタブ内のローカル編集
- 構造化されたコンポーネントツリー
- コンポーネントの追加、選択、上下移動、親変更、削除
- 選択コンポーネントの基本仕様編集
- 通常、保存中、成功、エラーを含む画面状態
- クリックまたは送信イベント
- API操作と成功・失敗状態の関連付け
- 同時に1件のAI change set
- change setの確認、手動修正、承認、却下
- 確定操作のUndo
- `localStorage`への保存
- 10個のWebMCPツール

### 2.2 対象外

- 複数ユーザーのリアルタイム共同編集
- ブランチ、マージ、競合解消
- サーバー、認証、組織管理
- 自由描画、リサイズ、ピクセル座標
- 画面遷移図の可視化
- 権限・ロール別preview
- 仕様不足の診断、受け入れ条件・テスト観点の生成
- 汎用的な条件式ビルダー
- 本番コード生成
- Markdown、PDF出力
- Figma、GitHub、外部APIとの同期
- AIによるchange setの承認・却下

## 3. 設計原則

### 3.1 画面仕様を唯一のsource of truthにする

ワイヤーフレームと仕様パネルに別々のデータを持たせない。どちらも`ProjectDocument`の投影として描画する。

### 3.2 座標ではなく意味を保存する

コンポーネントは`parentId`と`childIds`で構造化する。レイアウトは`stack`、`columns`、`actionArea`などの意味付きコンポーネントで表現する。

### 3.3 すべての更新をcommandにする

ReactコンポーネントやWebMCPツールからモデルを直接変更しない。検証済みの`DomainCommand`を`CommandService`へ渡す。

### 3.4 人間操作とAI操作で確定方法だけを変える

- 通常時の人間操作: commandを直ちに確定モデルへ適用する
- AI操作（review mode）: commandをactive change setへ追加する
- change set表示中の人間操作: change setのpreviewへ追加する

同じcommandと検証処理を使い、更新ロジックを二重実装しない。

### 3.5 AI更新は常にレビューする

MVPではエージェントの変更を必ずchange setとして確認する。AIが確定モデルを直接更新する経路は公開しない。

WebMCPには承認、却下ツールを公開しない。承認・却下は人間向けUIだけから実行する。

### 3.6 派生データを保存しない

次はモデルから都度算出する。

- ワイヤーフレーム表示
- コンポーネントツリー
- 選択状態を適用したpreview
- change setの差分

## 4. 状態の分離

アプリ状態は4層に分ける。

| 層 | 内容 | 永続化 |
| --- | --- | --- |
| Document | 画面仕様の確定モデル | `localStorage` |
| Collaboration | active change set | 現在レビュー中のchange setのみ |
| History | Undo用の確定transaction | 現在のセッションのみ |
| UI | 選択、開いているタブ、表示中の画面状態 | 一部のみ |

```ts
interface AppState {
  document: ProjectDocument;
  collaboration: CollaborationState;
  history: HistoryState;
  ui: UiState;
}

type AgentWritePolicy = "review";
```

`AgentWritePolicy`は`get_current_screen_context`でも返す。

`document`とchange setを適用した表示用モデルを区別する。

```ts
effectiveDocument =
  activeChangeSet === null
    ? document
    : applyCommands(activeChangeSet.baseDocument, activeChangeSet.operations);
```

キャンバス、ツリー、インスペクターは常に`effectiveDocument`を読む。これによりAIの変更案を確定前にアプリ全体でpreviewできる。

## 5. 画面仕様モデル

### 5.1 エンティティ構成

MVPは正規化した参照モデルを採用する。順序は親コンポーネントの`childIds`で保持する。

```ts
type EntityId = string;

interface ProjectDocument {
  schemaVersion: 1;
  revision: number;
  project: Project;
  screens: Record<EntityId, Screen>;
  components: Record<EntityId, ScreenComponent>;
  screenStates: Record<EntityId, ScreenState>;
  events: Record<EntityId, ScreenEvent>;
  apiOperations: Record<EntityId, ApiOperation>;
}

interface Project {
  id: EntityId;
  name: string;
  entryScreenId: EntityId;
  screenIds: EntityId[];
}

interface Screen {
  id: EntityId;
  name: string;
  route: string;
  rootComponentId: EntityId;
  defaultStateId: EntityId;
  stateIds: EntityId[];
  eventIds: EntityId[];
}
```

`revision`は確定transactionごとに1増加する。change set内の個々の操作では増加しない。

### 5.2 コンポーネント

```ts
type ComponentKind =
  | "page"
  | "section"
  | "stack"
  | "columns"
  | "actionArea"
  | "heading"
  | "text"
  | "textInput"
  | "select"
  | "button"
  | "alert"
  | "modal";

interface ScreenComponent {
  id: EntityId;
  screenId: EntityId;
  parentId: EntityId | null;
  childIds: EntityId[];
  kind: ComponentKind;
  name: string;
  common: CommonComponentSpec;
  config: ComponentConfig;
}

interface CommonComponentSpec {
  description: string;
  visible: boolean;
  enabled: boolean;
}
```

`config`は`kind`を判別キーにしたdiscriminated unionとする。

```ts
type ComponentConfig =
  | { kind: "page"; title: string }
  | { kind: "section"; title: string }
  | { kind: "stack"; gap: "sm" | "md" | "lg" }
  | { kind: "columns"; columns: 2 | 3 }
  | { kind: "actionArea"; align: "start" | "end" | "between" }
  | { kind: "heading"; text: string; level: 1 | 2 | 3 }
  | { kind: "text"; text: string }
  | TextInputConfig
  | SelectConfig
  | ButtonConfig
  | AlertConfig
  | ModalConfig;

interface TextInputConfig {
  kind: "textInput";
  fieldKey: string;
  label: string;
  inputType: "text" | "email" | "password";
  required: boolean;
  placeholder: string;
  defaultValue: string;
  validationRules: ValidationRule[];
  requestBinding: FieldBinding | null;
}

interface SelectConfig {
  kind: "select";
  fieldKey: string;
  label: string;
  required: boolean;
  options: Array<{ value: string; label: string }>;
  requestBinding: FieldBinding | null;
}

interface ButtonConfig {
  kind: "button";
  label: string;
  variant: "primary" | "secondary" | "danger";
  eventId: EntityId | null;
  confirmationMessage: string | null;
  preventDoubleSubmit: boolean;
}

interface AlertConfig {
  kind: "alert";
  tone: "info" | "success" | "warning" | "error";
  message: string;
}

interface ModalConfig {
  kind: "modal";
  title: string;
}
```

`modal`はcontainerとして扱い、defaultでは非表示、対象stateのoverrideで表示する。自由配置やdialog制御は行わない。これにより、エラー表示をmodalからinline alertへ変更する共同編集シナリオを同じモデル上で表現できる。

### 5.3 バリデーション

代表的な入力制約は明示的なunionにする。型付きルールで表現できない複合条件や業務固有ルールは、自然言語の`custom`ルールとして保存する。任意のJavaScriptや実行可能な式は保存しない。

```ts
type ValidationRule =
  | { id: EntityId; type: "required"; message: string }
  | { id: EntityId; type: "minLength"; value: number; message: string }
  | { id: EntityId; type: "maxLength"; value: number; message: string }
  | { id: EntityId; type: "pattern"; value: string; message: string }
  | { id: EntityId; type: "email"; message: string }
  | { id: EntityId; type: "custom"; description: string; message: string };
```

`custom`は仕様書、インスペクター、WebMCPで読み書きできるが、ワイヤーフレームpreviewでは自動評価しない。「手動確認が必要な仕様」と明示する。

### 5.4 画面状態

状態は画面全体の名前と、必要なコンポーネント差分だけを持つ。

```ts
type ScreenStateKind = "default" | "loading" | "success" | "error" | "custom";

interface ScreenState {
  id: EntityId;
  screenId: EntityId;
  name: string;
  kind: ScreenStateKind;
  description: string;
  componentOverrides: Record<EntityId, ComponentOverride>;
}

interface ComponentOverride {
  visible?: boolean;
  enabled?: boolean;
  text?: string;
  value?: string;
}
```

default状態にはoverrideを持たせず、コンポーネント本体の値を使用する。default以外では指定された値のみ上書きする。

### 5.5 イベント

```ts
type EventTrigger =
  | { type: "click"; componentId: EntityId }
  | { type: "submit"; componentId: EntityId };

type EventAction =
  | { type: "setState"; stateId: EntityId }
  | { type: "callApi"; apiOperationId: EntityId }
  | { type: "showAlert"; componentId: EntityId }
  | { type: "navigate"; destinationScreenId: EntityId };

interface ScreenEvent {
  id: EntityId;
  screenId: EntityId;
  name: string;
  trigger: EventTrigger;
  actions: EventAction[];
}
```

actionは配列順に実行される仕様として表示するが、MVPでは実際の外部APIを呼び出さない。ワイヤーフレーム上のpreviewでは`setState`と`navigate`を実行できる。

### 5.6 API操作

```ts
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiOperation {
  id: EntityId;
  name: string;
  method: HttpMethod;
  path: string;
  requestBindings: FieldBinding[];
  successStateId: EntityId | null;
  errorStateId: EntityId | null;
}

interface FieldBinding {
  componentId: EntityId;
  targetPath: string;
}
```

MVPではAPI仕様を記述するが、ネットワークリクエストは実行しない。デモの焦点を画面仕様の共同編集へ保ち、外部サービス依存を避けるためである。

## 6. モデルの不変条件

すべてのcommand適用前後で次を検証する。

1. `Project.screenIds`が重複せず、存在するscreenだけを参照する
2. `entryScreenId`が`screenIds`内のscreenを参照する
3. screenの`route`がproject内で一意
4. 各screenに`page`型のrootが1つだけ存在する
5. rootの`parentId`は`null`
6. root以外のcomponentには同じscreen内のparentがある
7. parentの`childIds`とchildの`parentId`が双方向に一致する
8. コンポーネントツリーに循環がない
9. leaf componentの`childIds`は空
10. containerが受け入れ可能なkindだけを子に持つ
11. `fieldKey`はscreen内で一意
12. component、state、event、APIの参照先が存在する。`navigate`だけは別screenを参照できる
13. default stateは1つだけで、`defaultStateId`がそのstateを参照し、`stateIds`にも含まれる
14. 削除対象を参照するstate override、event、bindingも同一transactionで除去する
15. container削除は配下のsubtree全体を削除し、依存参照も同一transactionで除去する
16. projectには常に1画面以上存在する
17. component configはkindごとの必須field、型、enumだけを持ち、未知fieldを許可しない
18. state overrideは対象component kindで有効なfieldだけを持ち、値型を検証する
19. default stateのcomponent overridesは常に空とする
20. textInput/selectのrequest bindingは存在する同一screen内componentだけを参照する
21. component common spec、event trigger/action、API operationは種類ごとの正確なruntime shapeを持ち、未知fieldを持たない
22. UIのactive screen/state/selectionはeffective documentに存在し、同じscreenへ所属する
23. schema versionは`1`、revisionは非負のsafe integerとし、上限を越える更新を拒否する
24. project、screen、component、state、event、API metadataはexact shapeを持ち、ID配列の重複とrecord key/entity ID不一致を許可しない
25. entity IDはprototype chain上の名前を許可せず、全map参照・追加・削除をown-property helper経由で行う
26. component、state、event、APIはowning screenに実在かつ所属し、screen rootも同一screenへ所属する

不変条件違反はUIとWebMCPの両方で同じ`DomainError`として返す。無視、部分適用、暗黙補正は行わない。

## 7. Command設計

### 7.1 共通形式

```ts
interface CommandEnvelope<T extends DomainCommand = DomainCommand> {
  id: EntityId;
  source: "human" | "agent";
  issuedAt: string;
  baseRevision: number;
  command: T;
}

type DomainCommand =
  | AddScreenCommand
  | UpdateScreenCommand
  | RemoveScreenCommand
  | SetEntryScreenCommand
  | AddComponentCommand
  | MoveComponentCommand
  | RemoveComponentCommand
  | UpdateComponentSpecCommand
  | CreateScreenStateCommand
  | UpdateScreenStateCommand
  | ConnectEventCommand
  | BindApiOperationCommand;
```

commandは成功時に全体適用、失敗時に無変更とする。

screen追加時はroot pageとdefault stateを同一commandで作成する。screen削除時は配下のcomponent、state、event、APIをまとめて削除する。他screenの`navigate`から参照されているscreenは、参照を外すまで削除できない。entry screenを削除する場合は、同一transactionで別のentry screenを指定する。

### 7.2 更新単位

`update_component_spec`は任意JSON Patchを受け取らない。編集可能なfieldを列挙したpatchを使う。

```ts
interface UpdateComponentSpecCommand {
  type: "updateComponentSpec";
  componentId: EntityId;
  patch: {
    name?: string;
    description?: string;
    visible?: boolean;
    enabled?: boolean;
    config?: PartialEditableComponentConfig;
  };
}
```

これにより、ID、親子参照、kindなどの構造情報を仕様更新ツールから破壊できない。

## 8. Change set、承認、却下、Undo

### 8.1 Change set

MVPでは同時に1件だけactive change setを持つ。

```ts
interface ChangeSet {
  id: EntityId;
  summary: string;
  status: "active";
  baseRevision: number;
  version: number;
  baseDocument: ProjectDocument;
  operations: CommandEnvelope[];
  createdAt: string;
  updatedAt: string;
}

interface CollaborationState {
  activeChangeSet: ChangeSet | null;
}
```

### 8.2 状態遷移

```text
確定モデル
  ├─ 人間が編集 ────────────────> 確定モデル + history
  └─ AIがbegin_change_set
       ↓
     active change set
       ├─ AIがcommand追加
       ├─ 人間がpreviewを修正
       ├─ 人間が承認 ──────────> 確定モデル + history
       └─ 人間が却下 ──────────> 確定モデル
```

active change set中は、人間によるキャンバス・インスペクター編集もchange setへ追加する。確定モデルを裏で変更しない。UI上部に「提案を編集中」と明示する。

change setの`version`はAI・人間を問わずoperation追加ごとに1増加する。WebMCPのwrite toolは`expectedRevision`と`expectedChangeSetVersion`を受け取り、次を検証する。

- `expectedRevision === activeChangeSet.baseRevision === document.revision`
- `expectedChangeSetVersion === activeChangeSet.version`

これにより、別タブで確定モデルが更新された場合と、tool呼び出しの間に人間がchange setを修正した場合の両方でstale writeを拒否できる。

### 8.3 承認

承認時は次を1transactionで行う。

1. `baseRevision`と現在の確定モデルrevisionが一致することを確認する
2. 全operationsをbase documentへ再適用する
3. モデル全体の不変条件を検証する
4. revisionを1増やす
5. before/after snapshotをhistoryへ積む
6. active change setを破棄する

### 8.4 却下

却下時は確定モデルを変更せず、active change setを破棄する。修正要望はエージェント側のチャットで伝える。

### 8.5 Undo

```ts
interface HistoryEntry {
  id: EntityId;
  label: string;
  source: "human" | "accepted-change-set" | "auto-applied-agent";
  before: ProjectDocument;
  after: ProjectDocument;
}
```

- 人間の通常commandは1操作につき1entry
- change set承認は全operationsで1entry
- auto-apply modeのAI commandは1操作につき1entry
- Undoは`before`を復元し、revisionを新しく採番する
- active change set中はUndoを無効化する
- RedoはMVP対象外

モデル規模が小さいMVPではsnapshot方式を採用し、逆command生成の複雑さを避ける。historyは最大50件とする。

## 9. 後続機能: 診断

診断はMVPのWebMCP共同編集ループが完成した後に追加する。実装する場合は純粋関数`diagnoseScreen(document, screenId)`とする。

```ts
interface Diagnostic {
  id: string;
  ruleId: string;
  severity: "error" | "warning" | "info";
  entityType: "screen" | "component" | "state" | "event" | "apiOperation";
  entityId: EntityId;
  path?: string;
  message: string;
  suggestion: string;
}
```

`id`は`ruleId + entityId + path`から決定的に生成し、再描画後も同じ問題を追跡できるようにする。

### 9.1 診断ルール候補

| Rule ID | Severity | 条件 |
| --- | --- | --- |
| `input-label-required` | error | 入力部品のlabelが空 |
| `field-key-required` | error | 入力部品のfieldKeyが空 |
| `field-key-unique` | error | fieldKeyが重複 |
| `required-rule-message` | warning | 必須項目にエラーメッセージがない |
| `button-event-required` | warning | primary buttonにeventがない |
| `api-path-required` | error | API操作のpathが空 |
| `api-result-states-required` | warning | API操作に成功・失敗stateの片方がない |
| `loading-state-recommended` | warning | APIイベントがあるがloading stateがない |
| `double-submit-prevention` | warning | API実行buttonで二重送信防止が無効 |
| `error-feedback-required` | warning | error stateにalertまたはinline errorがない |
| `orphan-state` | info | どのeventからも到達しないstate |
| `empty-container` | info | page以外のcontainerが空 |

将来の診断パネルで項目を選ぶと、対象コンポーネントまたは仕様欄を選択・フォーカスする。

## 10. UI設計

### 10.1 全体

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Project / Screen       State selector       WebMCP status / Undo   │
│ Agent changes: Review                                                │
├──────────────────┬──────────────────────────────┬───────────────────┤
│ Screens          │ Wireframe canvas             │ Inspector         │
│                  │                              │ Change set        │
│ Palette / Tree   │ effectiveDocument preview    │                   │
│ Structure        │                              │                   │
├──────────────────┴──────────────────────────────┴───────────────────┤
│ Change set bar: summary / changed count / Reject / Accept           │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 左ペイン

- `Screens`: 画面一覧、entry表示、作成、選択、名称変更、削除
- `Components`: kind別パレット。選択中containerへのクリック追加と任意位置へのdrag追加
- `Structure`: component tree。選択、dragによる並び替え・親変更、矢印移動、削除
- `Canvas`: preview上のhandleからtreeと同じcommandで並び替え・親変更
- 追加不可の場合は無効理由を表示

### 10.3 中央ペイン

- 選択中stateを適用したワイヤーフレーム
- component選択
- containerの追加先表示
- AI変更箇所にaccent outline
- 人間がchange set内で修正した箇所には別のmarker
- 空状態、loading、errorを実際の見た目でpreview

### 10.4 右ペイン

- `Inspector`: 選択componentの編集可能仕様。内部metadataの`name`は表示せず、page titleなどkind固有の内容を編集
- `Changes`: operation一覧とbefore/after

component kindごとに専用フォームを表示し、任意JSON編集は提供しない。画面管理上のscreen nameとpreview内容であるpage titleは別fieldとして扱う。

### 10.5 Change set bar

active change setがある場合だけ固定表示する。

- 提案summary
- AI操作数、人間修正数
- `Reject`ボタン
- `Accept changes`ボタン

承認・却下は人間向けUIだけに置く。

MVPではエージェント変更を常に`Review`として扱う。

## 11. WebMCPツール

すべてimperative APIの`document.modelContext.registerTool()`で登録する。read toolには`annotations: { readOnlyHint: true }`を指定する。

### 11.1 読み取り

| Tool | 目的 | 主な返却値 |
| --- | --- | --- |
| `get_current_screen_context` | project概要と現在の作業対象を取得 | project、screen一覧、active screen、revision、agent write policy、selected component/state、active change set |
| `get_component` | ID指定または選択中componentの仕様を取得 | component、state override、関連event/API |
| `get_screen_diagnostics` | fieldKeyなどの軽量な構造診断を取得 | screen ID、diagnostics |
| `get_pending_change_set` | 未承認変更と人間修正を取得 | summary、operations、diff、base revision |

### 11.2 Change set開始

| Tool | 目的 | 主な入力 |
| --- | --- | --- |
| `begin_change_set` | AI変更をまとめる作業単位を開始 | `summary` |

active change setがすでに存在する場合は新規作成せず、既存IDを含む明示的エラーを返す。
auto-apply modeの場合はchange setを開始せず、現在のmodeを含む明示的エラーを返す。

### 11.3 更新

| Tool | 目的 | 主な入力 |
| --- | --- | --- |
| `change_screen_structure` | screenの追加、更新、削除、entry指定 | `changeSetId`, `operation`, operation別のtyped fields |
| `change_component_structure` | componentの追加、移動、subtree削除 | `changeSetId`, `operation`, operation別のtyped fields |
| `update_component_spec` | componentの編集可能仕様を更新 | `changeSetId`, `componentId`, typed `patch` |
| `upsert_screen_state` | 状態の追加、更新、削除 | `changeSetId`, `operation`, state fields |
| `connect_behavior` | event/API操作の追加、削除 | `changeSetId`, `operation`, eventまたはAPI fields |

AIによる更新toolは次を共通要件とする。

1. active change setのIDが必須
2. `expectedRevision`と`expectedChangeSetVersion`が一致しない場合は失敗
3. command適用後に不変条件を検証
4. 成功時はoperation ID、確定revision、change set versionを返す
5. 確定モデルを変更せず、UIを即座にpreview更新する

`change_component_structure`は巨大な汎用編集toolではなく、component treeだけを対象にしたdiscriminated operationである。

- `add`: `parentId`, `kind`, `name`, `position`
- `move`: `componentId`, `newParentId`, `position`
- `remove`: `componentId`

`remove`は対象subtreeとその依存参照をまとめて削除する。root componentは削除できない。

`change_screen_structure`もscreen管理だけを対象にする。

- `add`: `name`, `route`, optional `makeEntry`
- `update`: `screenId`, optional `name`, optional `route`
- `remove`: `screenId`, optional `nextEntryScreenId`
- `setEntry`: `screenId`

### 11.4 公開しない操作

- change setの承認
- change setの却下
- Undo
- local dataの全消去
- 任意JSON Patch
- 任意コード実行

## 12. アプリケーション構成

採用技術:

- Vite
- React
- TypeScript strict mode
- Zustand
- Vitest
- React Testing Library
- CSS Modulesまたは単一の設計token付きCSS

ZustandはReact外のWebMCP execute関数から最新状態を同期取得しやすくするために使用する。domain処理はstoreから独立した純粋関数として実装する。

```text
src/
├─ app/
│  ├─ App.tsx
│  └─ appStore.ts
├─ domain/
│  ├─ model.ts
│  ├─ commands.ts
│  ├─ applyCommand.ts
│  ├─ invariants.ts
│  ├─ changeSet.ts
│  └─ errors.ts
├─ features/
│  ├─ palette/
│  ├─ structure-tree/
│  ├─ canvas/
│  ├─ inspector/
│  └─ change-review/
├─ webmcp/
│  ├─ registerTools.ts
│  ├─ schemas.ts
│  └─ toolHandlers.ts
├─ persistence/
│  └─ localStorage.ts
├─ sample/
│  └─ sampleProject.ts
├─ styles/
│  └─ global.css
└─ main.tsx
```

### 12.1 依存方向

```text
React features ─┐
                ├─> appStore / CommandService ─> domain
WebMCP tools ───┘

persistence <── appStore
sample ───────> domain model
```

`domain`はReact、Zustand、WebMCP、DOMに依存しない。

### 12.2 エラー

```ts
type DomainErrorCode =
  | "NOT_FOUND"
  | "INVALID_PARENT"
  | "INVALID_REFERENCE"
  | "INVARIANT_VIOLATION"
  | "REVISION_CONFLICT"
  | "LOCKED_FIELD"
  | "CHANGE_SET_REQUIRED"
  | "CHANGE_SET_ALREADY_ACTIVE";
```

UIはtoastと該当フォームのinline errorで表示する。WebMCPは`code`、`message`、`details`を含む失敗結果を返す。成功形へのfallbackや部分成功は行わない。

## 13. 永続化

- key: `screen-blueprint-studio:v1`
- 確定`ProjectDocument`と最後のUI選択を保存
- active change setも保存し、refresh後にレビューを継続可能にする
- historyはセッション内だけに保持
- 読み込み時にschema versionと不変条件を検証
- 不正データの場合は自動初期化せず、復旧またはsample再読み込みを選べるエラー画面を表示
- 書き込み失敗時は永続警告bannerを表示し、確定documentとpreview中のeffective documentをJSONで退避できる
- change set却下の保存に失敗した場合は古いactive payloadを削除し、rejected IDとの照合でも再復元を防ぐ
- recovery中はJSON退避とsample初期化以外のwriteを拒否し、WebMCP readにはrecovery状態だけを公開する

保存は確定transactionまたはchange set更新後に同期実行する。MVPのデータ量ではdebounceを必要としない。

## 14. アクセシビリティとレスポンシブ

- 主要操作をbutton、form control、tree semanticsで提供
- dnd-kitのpointer、touch、keyboard sensorとdrag handleのaccessible nameを提供
- キーボードで選択、クリック追加、上下移動、削除、選択解除、Undoが可能
- 選択を色だけで示さない
- change setのAI変更と人間修正を色とlabelの両方で示す
- 画面幅1024px以上を主要対象とする
- 狭い画面では左右ペインをtabへ折りたたむ
- WebMCP非対応ブラウザでも人間向け機能はすべて利用可能

## 15. テスト方針

### 15.1 Domain unit tests

- 全commandの正常系、異常系
- screen追加・削除とentry screen制約
- 別screenへのnavigate参照と参照中screenの削除拒否
- component treeの循環・不整合防止
- subtree削除時の参照cleanup
- state override適用
- custom validation ruleの保存と非実行
- change set承認、却下、revision conflict
- Undo

### 15.2 Store integration tests

- 人間commandは即時確定される
- review modeのAI commandは確定モデルを変えずpreviewだけを変える
- auto-apply modeのAI commandは即時確定され、historyへ積まれる
- active change set中の人間編集はpreviewへ入る
- acceptで1transactionとして確定される
- rejectで確定モデルが変わらない
- 永続化後に同じeffective documentを復元する

### 15.3 UI tests

- パレットから追加し、canvasとtreeへ同時反映
- component選択とinspector編集
- state切り替え
- change set差分、承認、却下

### 15.4 WebMCP handler tests

ブラウザAPIそのものではなくtool handlerを直接テストする。

- schemaに対応した引数処理
- read-only toolの返却
- review modeでのchange set必須
- auto-apply modeでの即時確定
- stale revision拒否
- tool実行後のstoreとUI相当状態

Chromeでは最後に実API登録、DevTools表示、エージェント実行を手動確認する。

## 16. 実装順序

### Phase 1: 基盤と縦切り

1. Vite + React + TypeScriptへ置き換える
2. `ProjectDocument`、screen、component union、sampleを定義する
3. screenとcomponentのadd/select/update commandとstoreを実装する
4. screen一覧、palette、tree、canvas、inspectorを同じモデルから表示する

完了条件: 人間が複数画面を作成・切り替え、各画面へ部品を追加して仕様を編集すると全投影が同期する。

### Phase 2: 状態・イベント・API

1. screen stateとoverride preview
2. event、画面間navigate、API operation
3. loading、errorを含むsample

完了条件: 保存操作のloading、success、errorとAPI関連付けをモデル化し、状態別にpreviewできる。

### Phase 3: Change set

1. active change setとeffective document
2. operation差分表示
3. change set内の人間修正
4. 承認、却下、Undo
5. refresh後のactive change set復元

完了条件: AI相当のcommand列をpreviewし、人間が修正後に一括承認または却下できる。

### Phase 4: WebMCP

1. TypeScript型定義とfeature detection
2. 4 read tools
3. `begin_change_set`
4. 5 write tools
5. WebMCP状態表示とtool handler tests

完了条件: エージェントが選択中componentを読み、状態・API失敗仕様を提案し、UIへ未承認差分として表示できる。

### Phase 5: 提出品質

1. sampleと3分デモシナリオを確定
2. onboarding、empty/error/WebMCP unsupported states
3. responsive、keyboard、視覚差分
4. README、英語説明、ライセンス
5. 公開URL、デモ動画

完了条件: 初見ユーザーが手動編集からAI提案の承認まで迷わず完了できる。

## 17. MVP受け入れ条件

1. AIなしで複数screenの作成・選択・関連付けと、component追加、移動、削除、仕様編集、状態previewができる
2. canvas、tree、inspectorが同じモデルを表示する
3. 破損した親子参照や存在しないIDを保存できない
4. review modeのAI write toolは確定モデルを直接変更せず、screenとcomponent構造の追加・更新・移動・削除と既存stateの修正をchange set上で行える
5. AI変更とchange set内の人間修正を視覚的に区別できる
6. 人間だけがchange setを承認・却下できる
7. active change setに対する人間修正をエージェントがread toolで取得できる
8. 承認したchange set全体を1回のUndoで戻せる
9. WebMCP非対応でも人間向けアプリが動作する
10. 10個のtoolがDevToolsで確認でき、型付き入力で実行できる
11. refresh後も確定モデルとactive change setを復元できる
12. invalidなWebMCP writeは確定モデルとchange setを変更せず、構造化エラーを返す

## 18. 実装開始時に確定する小項目

次は設計を阻害しないため、該当Phaseで決める。

- 製品の正式名称
- sampleにする具体的な業務画面
- color、typography、icon
- inspectorのfield配置
- change set diffの文言
- 公開先
- OSSライセンス

これらはデータモデル、command境界、change set方式には影響しない。
