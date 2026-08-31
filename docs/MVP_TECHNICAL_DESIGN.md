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
2. エージェントが現在のeffective画面一式、選択、revisionをWebMCPで取得できる
3. エージェントの変更は直接確定せず、同じ画面上のchange setとして表示される
4. 人間が変更セットを確認し、反映または破棄できる
5. エージェントがcurrent modelと直近の破棄記録を再読し、次の変更セットへ反映できる

WebMCPは状態管理そのものではなく、アプリ内の読み取り・更新操作をエージェントへ公開する境界である。人間向けUIとWebMCPツールは、同じcommand層と検証処理を使用する。

## 2. MVPの境界

### 2.1 対象

- 1プロジェクト、複数画面
- 画面の作成、選択、名称変更、削除
- イベントによる画面間の遷移関係
- Eventの`navigate` actionから生成する読み取り専用の画面遷移フロー
- 1ブラウザタブ内のローカル編集
- 構造化されたコンポーネントツリー
- コンポーネントの追加、選択、上下移動、親変更、削除
- 選択コンポーネントの基本仕様編集
- 通常、保存中、成功、エラーを含む画面状態
- クリックまたは送信イベント
- API操作と成功・失敗状態の関連付け
- 同時に1件のAI change set
- change setの確認、反映、破棄
- 確定操作のUndo／Redo
- `localStorage`への保存
- 9個のWebMCPツール

### 2.2 対象外

- 複数ユーザーのリアルタイム共同編集
- ブランチ、マージ、競合解消
- サーバー、認証、組織管理
- 自由描画、リサイズ、ピクセル座標
- 自由座標を保存する編集可能な画面遷移diagram
- 権限・ロール別preview
- 受け入れ条件・テスト観点の生成
- 汎用的な条件式ビルダー
- 本番コード生成
- Markdown、PDF出力
- Figma、GitHub、外部APIとの同期
- AIによるchange setの反映・破棄

## 3. 設計原則

### 3.1 画面仕様を唯一のsource of truthにする

ワイヤーフレームと仕様パネルに別々のデータを持たせない。どちらも`ProjectDocument`の投影として描画する。

### 3.2 座標ではなく意味を保存する

コンポーネントは`parentId`と`childIds`で意味的に構造化する。配置は意味的kindと混在させず、childを持てるcomponent自身の共通layout属性で表現する。

### 3.3 すべての更新をcommandにする

ReactコンポーネントやWebMCPツールからモデルを直接変更しない。検証済みの`DomainCommand`を`CommandService`へ渡す。

### 3.4 人間操作とAI操作で確定方法だけを変える

- 通常時の人間操作: commandを直ちに確定モデルへ適用する
- AI操作: WebMCPで開始したactive change setへcommandを追加する
- active change set中の人間操作: ProjectDocument変更を拒否し、反映または破棄を先に求める

同じcommandと検証処理を使い、更新ロジックを二重実装しない。

### 3.5 AI更新は常にレビューする

MVPではエージェントの変更を必ずchange setとして確認する。AIが確定モデルを直接更新する経路は公開しない。

WebMCPには反映、破棄ツールを公開しない。反映・破棄は人間向けUIだけから実行する。

### 3.6 派生データを保存しない

次はモデルから都度算出する。

- ワイヤーフレーム表示
- コンポーネントツリー
- 選択状態を適用したpreview
- change setの差分
- Eventの`navigate` actionから生成する画面遷移フロー

## 4. 状態の分離

アプリ状態は4層に分ける。

| 層 | 内容 | 永続化 |
| --- | --- | --- |
| Document | 画面仕様の確定モデル | `localStorage` |
| Collaboration | active change set | 現在レビュー中のchange setのみ |
| History | Undo／Redo用の確定transaction | 現在のセッションのみ |
| UI | 選択、開いているタブ、表示中の画面状態 | 一部のみ |

```ts
interface AppState {
  document: ProjectDocument;
  collaboration: CollaborationState;
  history: HistoryState;
  ui: UiState;
}
```

`document`とchange setを適用した表示用モデルを区別する。

```ts
effectiveDocument =
  activeChangeSet === null
    ? document
    : applyCommands(activeChangeSet.baseDocument, activeChangeSet.operations);
```

キャンバス、ツリー、インスペクターは常に`effectiveDocument`を読む。これによりAIの変更セットを確定前にアプリ全体でpreviewできる。

画面遷移フローも同じく`effectiveDocument`を読み、各ScreenのEventに含まれる`navigate` actionをScreen node間のedgeとして投影する。フローは仕様レビューと既存画面へのnavigationを目的とした読み取り専用表示であり、node座標、edge形状、独立したdiagram metadataは保存しない。配置は`project.screenIds`の順序から決定的に生成し、編集はScreen表示へ戻って既存Event UIから行う。

## 5. 画面仕様モデル

### 5.1 エンティティ構成

MVPは正規化した参照モデルを採用する。順序は親コンポーネントの`childIds`で保持する。

```ts
type EntityId = string;

interface ProjectDocument {
  schemaVersion: 2;
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
  screenIds: EntityId[];
}

interface Screen {
  id: EntityId;
  name: string;
  route: string;
  rootComponentId: EntityId;
  modalComponentIds: EntityId[];
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
  | "container"
  | "text"
  | "textInput"
  | "select"
  | "button"
  | "modal";

interface ScreenComponent {
  id: EntityId;
  screenId: EntityId;
  parentId: EntityId | null;
  childIds: EntityId[];
  kind: ComponentKind;
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
  | ({ kind: "page" } & ComponentLayout)
  | ({ kind: "container" } & ComponentLayout)
  | {
      kind: "text";
      text: string;
      style: "heading1" | "heading2" | "heading3" | "body" | "caption";
    }
  | TextInputConfig
  | SelectConfig
  | ButtonConfig
  | ModalConfig;

interface ComponentLayout {
  layout: "vertical" | "horizontal" | "grid";
  gap: "none" | "sm" | "md" | "lg";
  columns: 1 | 2 | 3 | 4;
  justify: "start" | "center" | "end" | "between";
  align: "start" | "center" | "end" | "stretch";
  wrap: boolean;
}

interface TextInputConfig {
  kind: "textInput";
  fieldKey: string;
  label: string;
  inputType: "text" | "email" | "password";
  required: boolean;
  placeholder: string;
  defaultValue: string;
  validationRules: ValidationRule[];
}

interface SelectConfig {
  kind: "select";
  fieldKey: string;
  label: string;
  required: boolean;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
}

interface ButtonConfig {
  kind: "button";
  label: string;
  variant: "primary" | "secondary" | "danger";
  eventId: EntityId | null;
  confirmationMessage: string | null;
  preventDoubleSubmit: boolean;
}

type ModalConfig = { kind: "modal" } & ComponentLayout;
```

`page`、`container`、`modal`だけが`ComponentLayout`を持つ。これらの構造componentは構造と配置だけを担い、表示文字列を自身のconfigへ持たない。意味的なグループ名はContainerの`CommonComponentSpec.description`へ保存し、TreeとCanvasのeditor-only識別に使うが、preview contentへは自動描画しない。見出し、本文、補足、状態別feedbackはchildの`text`と`style`で表現し、必要に応じてContainerと組み合わせる。`style`はHTML tagではなく、画面仕様上のvisual／semantic roleであり、Canvas内部で適切なsemantic elementへmapする。操作固有文言は`button`、`textInput`、`select`等のleafで表現する。将来`list`等の構造kindを追加する場合も同じ原則を適用する。

schema version 2では、機能差のなかった旧`section` kindを`container`へ統合した。version 1の保存データは読込時に、component ID、親子関係、共通仕様、layout、revisionを保持したまま決定的に変換する。active change setのbase documentと未確定operation内のcomponent snapshot/configも同じ境界で変換し、変換後の全体を現行runtime validationで検証してから再保存する。壊れた旧データは補正せずRecoveryへ送る。

`vertical`は縦積み、`horizontal`は横並び、`grid`は指定列数で配置し、Inspector、Canvas、DnDが同じ値を参照する。`page`は`rootComponentId`、各`modal`は`modalComponentIds`で参照され、いずれも`parentId: null`の独立rootとなる。Modalのchildrenは通常componentと同じtree操作に対応するが、Modal root自体はPageや他のcontainerへreparentしない。CanvasではPage artboard外の独立frameとして常時編集でき、状態別のvisible overrideはframeのeditor chromeで示す。

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

`validationRules`は`textInput`のInspectorから追加・編集・削除・並べ替えできる。編集dialogはlocal draftをSave時に1 commandとして確定し、Cancelで破棄する。ruleの`id`は内部生成のみでUIへ自由入力させない。typeごとに必要なfieldだけ表示し（length系は`value`、`pattern`は正規表現、`custom`は`description`、全typeで`message`）、`message`と`value`/`description`は空文字を許容しない。`required`・`email`・`minLength`・`maxLength`は同一component内で重複を拒否し、`minLength.value`は`maxLength.value`以下でなければならず、`pattern`の値や`custom`の`description`が他のruleと重複する場合も拒否する。`pattern`は有効な正規表現として解釈できる文字列に限る。これらの制約はdomain invariant（`validateComponentConfig`）で一元的に検証され、Inspector UIとWebMCP write経路の両方へ同じ基準で適用される。並べ替えた配列順は読み取り専用のBehavior投影にもそのまま反映される。

`custom`はInspectorで他のruleと同じくfull CRUD対象だが、WebMCPで読み書きできる一方、ワイヤーフレームpreviewでは自動評価しない。「手動確認が必要な仕様」と明示する。

### 5.4 画面状態

状態は自由な名前と説明、必要なコンポーネント差分だけを持つ。状態名は予約語やenumではなく、用途を人間とエージェントが共有する表示値である。

```ts
interface ScreenState {
  id: EntityId;
  screenId: EntityId;
  name: string;
  description: string;
  componentOverrides: Record<EntityId, ComponentOverride>;
}

interface ComponentOverride {
  visible?: boolean;
  enabled?: boolean;
  text?: string;
  message?: string;
  value?: string;
}
```

`Screen.defaultStateId`が指す状態にはoverrideを持たせず、コンポーネント本体の値を使用する。それ以外の状態では指定された値のみ上書きし、Canvas、Tree、WebMCP readはdomain selectorが返すeffective componentだけを表示へ使用する。Inspectorはcomponent本体へ保存する「基本設定」と選択中stateの明示overrideを分離し、各override fieldについて基本値とselector由来の実効値を表示する。field単位の解除は他fieldを保持し、component単位の解除はTreeと同じreset commandを使用する。Selectの`defaultValue`は空文字またはoptions内の値、状態別`value`はoptions内の値に限定する。options変更で既存のbase値またはoverrideが無効になるcommandは暗黙補正せず拒否する。Defaultの識別と保護は名前ではなくID参照で行う。人間はcanvas上部のstate barから任意名の状態を追加・選択・編集・削除でき、選択componentのInspectorでcomponent kindに許可されたoverrideを設定または基本設定へ戻せる。

### 5.5 イベント

```ts
type EventTrigger =
  | { type: "click"; componentId: EntityId }
  | { type: "submit"; componentId: EntityId };

type EventAction =
  | { type: "setState"; stateId: EntityId }
  | { type: "callApi"; apiOperationId: EntityId }
  | { type: "navigate"; destinationScreenId: EntityId };

interface ScreenEvent {
  id: EntityId;
  screenId: EntityId;
  name: string;
  trigger: EventTrigger;
  actions: EventAction[];
}
```

actionは配列順に実行される仕様としてInspectorへ表示し、`setState`は同screenのstate、`navigate`は任意screen、`callApi`は同screenの既存operationから選択して、eventとactionを追加・編集・削除・並べ替えできる。状態別feedbackはContainerとTextのvisibility／text overrideで表現し、eventから対象stateへ切り替える。編集dialogはlocal draftをSave時に1 commandとして確定する。`trigger.componentId`をcomponentとeventの正準な関連として扱い、Buttonの`eventId`は任意のprimary annotationに限定する。同じeventを両方が指しても一覧へ重複表示せず、event削除時はButton側の参照も解除する。API operationの編集は別機能とする。MVPでは実際の外部APIを呼び出さない。ワイヤーフレーム上のpreviewでは`setState`と`navigate`を実行できる。

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

MVPではAPI仕様を記述するが、ネットワークリクエストは実行しない。`ApiOperation.requestBindings`をfield bindingの唯一の正準sourceとし、同screenのTextInput／Selectを送信元componentとしてtarget pathへ関連付ける。選択componentのInspectorから同screenのoperationを追加・編集・削除でき、method・path・name、順序付きrequest binding、nullableなsuccess/error stateをlocal draftから1 commandで確定する。operation削除時は参照する`callApi` actionへの影響を表示し、同一commandで参照を除去する。

## 6. モデルの不変条件

すべてのcommand適用前後で次を検証する。

1. `Project.screenIds`が重複せず、存在するscreenだけを参照する
2. screenの`route`がproject内で一意
3. 各screenに`page`型rootが1つ、`modal`型rootが0個以上存在する
4. Page／Modal rootの`parentId`は`null`で、Screenのroot ID配列から一意に参照される
5. Page／Modal以外のcomponentには同じscreen内のparentがあり、Modalを通常treeへ入れない
6. 各componentはPage treeまたはいずれか1つのModal treeからexactly once到達可能
7. parentの`childIds`とchildの`parentId`が双方向に一致し、循環・重複・孤立がない
8. leaf componentの`childIds`は空
9. containerが受け入れ可能なkindだけを子に持つ
10. `fieldKey`はscreen内で一意
11. component、state、event、APIの参照先が存在する。`navigate`だけは別screenを参照できる
12. `defaultStateId`が同じscreenのstateを参照し、`stateIds`にも含まれる
13. 削除対象を参照するstate override、event、bindingも同一transactionで除去する
14. container削除は配下のsubtree全体を削除し、依存参照も同一transactionで除去する
15. projectには常に1画面以上存在する
16. component configはkindごとの必須field、型、enumだけを持ち、未知fieldを許可しない
17. state overrideは対象component kindで有効なfieldだけを持ち、Selectの値を含めて有効範囲を検証する
18. default stateのcomponent overridesは常に空とする
19. API request bindingは同じscreenのTextInput／Selectだけを参照し、componentと空白除去後のtarget pathはoperation内でそれぞれ一意かつ空でない
20. component common spec、event trigger/action、API operationは種類ごとの正確なruntime shapeを持ち、未知fieldを持たない
21. UIのactive screen/state/selectionはeffective documentに存在し、同じscreenへ所属する
22. schema versionは`1`、revisionは非負のsafe integerとし、上限を越える更新を拒否する
23. project、screen、component、state、event、API metadataはexact shapeを持ち、ID配列の重複とrecord key/entity ID不一致を許可しない
24. entity IDはprototype chain上の名前を許可せず、全map参照・追加・削除をown-property helper経由で行う
25. component、state、event、APIはowning screenに実在かつ所属し、screen rootも同一screenへ所属する

不変条件違反はUIとWebMCPの両方で同じ`DomainError`として返す。無視、部分適用、暗黙補正は行わない。

## 7. Command設計

### 7.1 共通形式

```ts
interface ChangeSetOperation<T extends DomainCommand = DomainCommand> {
  id: EntityId;
  source: "agent";
  issuedAt: string;
  command: T;
}

type DomainCommand =
  | AddScreenCommand
  | UpdateScreenCommand
  | RemoveScreenCommand
  | AddComponentCommand
  | DuplicateComponentCommand
  | PasteComponentCommand
  | MoveComponentCommand
  | RemoveComponentCommand
  | UpdateComponentSpecCommand
  | CreateScreenStateCommand
  | UpdateScreenStateCommand
  | ConnectEventCommand
  | BindApiOperationCommand;
```

新しいactive change setへ追加できるのは`source: "agent"`だけとする。未リリース中の旧保存データにhuman operationがある場合はAI operationとして扱わず、読み込み時はRecoveryを要求する。commandは成功時に全体適用、失敗時に無変更とする。

screen追加時はroot pageとdefault stateを同一commandで作成する。screen削除時は配下のcomponent、state、event、APIをまとめて削除する。他screenの`navigate`から参照されているscreenは、参照を外すまで削除できない。選択中screenを削除したUIは、残った先頭screenへ選択をreconcileする。

`duplicateComponent`はPage／Modal root以外の対象subtreeを1 commandでdeep copyし、全component IDをcommand内の対応表で新規IDへ置換して元component直後へ挿入する。全ScreenStateの対象overrideは新IDへ複製する一方、eventと`ApiOperation.requestBindings`は複製せず、Buttonのevent参照は外す。入力の`fieldKey`は一意なcopy suffixへ再採番する。

Copyはdocumentやhistoryを変更せず、対象subtreeとコピー時点の状態overrideだけを型付きのアプリ内clipboardへ保持する。`pasteComponent`はそのsnapshot、貼り付け先、ID対応表を持つ1 commandで、duplicateと同じsubtree copy処理を使用する。container／Page／Modal選択時は子の末尾、leaf選択時は同一parent内の直後へ挿入する。同一画面ではsnapshotの状態overrideを複製し、別画面では状態間の対応を推測せずoverrideを省略して通知する。clipboardは同じproject ID内だけで有効で、sourceの後続編集・削除やchange setの反映／破棄を越えてsnapshotを利用できるが、reloadとsample resetでは破棄する。

### 7.2 更新単位

`update_component_spec`は任意JSON Patchを受け取らない。編集可能なfieldを列挙したpatchを使う。

```ts
interface UpdateComponentSpecCommand {
  type: "updateComponentSpec";
  componentId: EntityId;
  patch: {
    common?: Partial<CommonComponentSpec>;
    config?: PartialEditableComponentConfig;
  };
}
```

これにより、ID、親子参照、kindなどの構造情報を仕様更新ツールから破壊できない。

## 8. Change set、反映、破棄、Undo／Redo

### 8.1 Change set

MVPでは同時に1件だけactive change setを持つ。

```ts
interface ChangeSet {
  id: EntityId;
  summary: string;
  baseRevision: number;
  version: number;
  baseDocument: ProjectDocument;
  operations: ChangeSetOperation[];
  createdAt: string;
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
       ├─ 人間はpreview・差分を確認
       ├─ 人間のdocument編集とUndo／Redoをlock
       ├─ 人間が反映 ──────────> 確定モデル + history
       └─ 人間が破棄 ──────────> 確定モデル
```

active change set中はreview lockとし、人間によるProjectDocument変更を中央store入口で拒否する。Inspector、Screen／state／Event／API／Validation編集、追加・削除・複製・Paste、DnD、Undo／RedoもUIで無効化し、確定document、base document、operations、version、history、永続化payloadを変更しない。選択、Treeの開閉、Canvasのzoom/pan/fit、Flow／Changes閲覧、locale、pane resize、アプリ内Copyは継続できる。UI上部にlock理由と反映／破棄導線を表示する。

change setの`version`はAI operation追加ごとに1増加し、`operations.length`と一致する。WebMCPのwrite toolは`expectedRevision`と`expectedChangeSetVersion`を受け取り、次を検証する。

- `expectedRevision === activeChangeSet.baseRevision === document.revision`
- `expectedChangeSetVersion === activeChangeSet.version`

これにより、別タブで確定モデルが更新された場合と、tool呼び出しの間に別のAI operationが追加された場合の両方でstale writeを拒否できる。

### 8.3 反映

反映時は次を1transactionで行う。

1. `baseRevision`と現在の確定モデルrevisionが一致することを確認する
2. 全operationsをbase documentへ再適用する
3. モデル全体の不変条件を検証する
4. revisionを1増やす
5. before/after snapshotをhistoryへ積む
6. active change setを破棄する

### 8.4 破棄

破棄時は確定モデルを変更せず、active change setを破棄する。修正要望はエージェント側のチャットで伝える。

### 8.5 Undo／Redo

```ts
interface HistoryEntry {
  id: EntityId;
  label: string;
  source: "human" | "accepted-change-set";
  before: ProjectDocument;
  after: ProjectDocument;
}
```

- 人間の通常commandは1操作につき1entry
- controlled text fieldは打鍵中にモデルを変更せずlocal draftを保持し、単一行のEnterまたはblur、複数行のblurで1command・1entryとして確定する。IME変換中のEnterは確定triggerにしない
- active change set開始前から開いているfield／dialogのlocal draftは自動確定・破棄せず保持し、保存を無効化してCancelを許可する。破棄後は保存を再開でき、反映後は変更されたrevisionに対するstale draftとして閉じて開き直すまで保存しない
- 外部document更新と競合した未確定draftは上書きせず保持し、再確定またはEscape取消をユーザーが選べる。reload時はまず同期的なcommand確定を試し、validationで確定できないdraftだけをsessionStorageへ退避して同じfieldへ復元する
- change set反映は全operationsで1entry
- Undoは`before`を復元し、revisionを新しく採番する
- RedoはUndoしたentryの`after`を復元し、同様にrevisionを新しく採番する
- 通常commandまたはchange set反映で確定モデルが分岐した場合はredo stackを破棄する。change set破棄は確定モデルを変えないためredo stackを維持する
- active change set中はUndo／Redoを無効化する

モデル規模が小さいMVPではsnapshot方式を採用し、逆command生成の複雑さを避ける。undo historyとredo stackはそれぞれ最大50件とし、どちらもreload後には復元しない。

## 9. TaskFlow sampleと共同作業デモ

初期sampleはチーム向けタスク管理`TaskFlow`とする。`Task List`は具体的なtask、Create／Edit／Retry、Default／Loading／Empty／Errorを持ち、Createは独立Modalの入力をPOST operationへ接続する。`Edit Task`はtitle、description、assignee、status、validation、保存・キャンセル、Saving／Success／Error／Confirm exit、独立した破棄確認Modal、Update Task APIを持つ。sampleは仕様モデルであり実通信は行わない。

Priorityは初期sampleに含めない。デモでは最初のchange setでStatus直後へ`fieldKey: priority`のSelectを追加し、既存入力と同じくSaving stateで無効化する。人間がAccept後に通常UIでoptions/defaultを修正し、エージェントは`get_current_screen_context`を再読して生成IDと人間の修正を取得する。次のchange setで既存Update Task APIのIDを保持した`updateApi`により`body.priority` bindingを追加する。これによりselection、effective document、review lock、生成ID、optimistic version、review diff、人間の修正再利用を一つのstoryで示す。

既存localStorage documentはsample更新で自動置換しない。開発時に`VITE_ENABLE_SAMPLE_RESET=true`を明示したbuildだけがheader resetを描画し、確認後にTaskFlowを保存する。active change set中はresetを無効化する。通常起動とGitHub Pagesではheader resetを描画しないが、破損データ向けRecoveryとApp error fallbackのsample復旧は常に維持する。

## 10. UI設計

### 10.1 全体

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Project / Screen     State selector     WebMCP status / Undo/Redo │
├──────────────────┬──────────────────────────────┬───────────────────┤
│ Screens          │ Wireframe canvas             │ Inspector         │
│                  │                              │ Change set        │
│ Palette / Tree   │ effectiveDocument preview    │                   │
│ Structure        │                              │                   │
├──────────────────┴──────────────────────────────┴───────────────────┤
│ Change set bar: summary / changed count / 破棄 / 反映               │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 左ペイン

- `Screens`: 画面一覧、作成、選択、名称・route変更、削除
- `Components`: kind別パレット。tree/canvasの任意位置へのdrag追加
- `Structure`: component tree。leafはlabel／text等から、構造componentはlocalized kindまたはScreen内のframe順からeditor-only表示名を導出し、選択、dragによる並び替え・親変更、削除。選択componentのcontext menuから子または直後へ追加できる
- `Canvas`: idle時はartboardと仕様上の表示内容だけを描画し、componentのsemantic labelとoutlineはhover／選択／focus時だけflow外のeditor overlayとして表示する。Page／Modal root以外のcomponent面全体をpointerまたはkeyboardで掴み、treeと同じcommandで並び替え・親変更する。pointerは5px移動後にdrag開始し、click selectionと誤dragを分離する。drop中だけ挿入lineまたはoutlineを表示する
- 追加不可の場合は無効理由を表示

### 10.3 中央ペイン

- 選択中stateを適用したワイヤーフレーム
- component選択
- drag中だけ表示する挿入line・outline
- AI変更箇所にaccent outline
- 空状態、loading、errorを実際の見た目でpreview

### 10.4 右ペイン

- `Inspector`: 選択componentの共通仕様、構造componentのlayout、leaf固有の内容を編集。関連するevent／順序付きactionと、同screenのAPI operation／binding／結果stateを編集し、`textInput`のvalidation ruleを追加・編集・削除・並べ替え。非default状態では基本仕様と分離した状態別設定を表示
- `Changes`: operation一覧とbefore/after

component kindごとに専用フォームを表示し、任意JSON編集は提供しない。画面管理上のscreen nameはPage frameのeditor-only labelとして使い、previewへ表示する文字列はText childと表示スタイルとして編集する。

UI static copyは型付きJA/EN辞書へ集約し、headerで即時切替する。localeは専用localStorage keyへbest-effortで保存し、利用不能でもnavigator languageによる初期化と画面操作を継続する。sample documentのユーザーcontentは英語へ統一し、UI localeによる自動翻訳対象にはしない。

### 10.5 Change set bar

active change setがある場合だけ固定表示する。

- change set summary
- AI操作数
- `破棄`ボタン
- `反映`ボタン

反映・破棄は人間向けUIだけに置く。

AI writeは必ずWebMCP change setへ追加し、確定には人間向けUIでの反映を必要とする。

## 11. WebMCPツール

すべてimperative APIの`document.modelContext.registerTool()`で登録する。`Promise<undefined>`を順にawaitし、全件成功後だけ成功logを出す。途中失敗時は共通`AbortSignal`をabortして既登録toolを解除し、console errorを出すが人間向けReact UIの起動は継続する。read toolには`annotations: { readOnlyHint: true }`を指定する。

### 11.1 読み取り

| Tool | 目的 | 主な返却値 |
| --- | --- | --- |
| `get_current_screen_context` | project概要と現在の作業対象を取得 | effective active screenのcomponent/state/event/API一式、revision、selection、compact change set metadata |
| `get_component` | ID指定または選択中componentの仕様を取得 | component、state override、関連event/API |
| `get_pending_change_set` | 未反映の変更セットを取得 | raw AI operations、review用operation summaries/diff、base revision。base document本体は返さない |

### 11.2 Change set開始

| Tool | 目的 | 主な入力 |
| --- | --- | --- |
| `begin_change_set` | AI変更をまとめる作業単位を開始 | `summary` |

active change setがすでに存在する場合は新規作成せず、既存IDを含む明示的エラーを返す。

### 11.3 更新

| Tool | 目的 | 主な入力 |
| --- | --- | --- |
| `change_screen_structure` | screenの追加、更新、削除 | `changeSetId`, `operation`, operation別のtyped fields |
| `change_component_structure` | componentの追加、複製、移動、subtree削除 | `changeSetId`, `operation`, operation別のtyped fields |
| `update_component_spec` | componentの編集可能仕様を更新 | `changeSetId`, `componentId`, typed `patch` |
| `upsert_screen_state` | 状態の追加、更新、削除 | `changeSetId`, `operation`, state fields |
| `connect_behavior` | event/API操作の追加、ID保持更新、削除 | `changeSetId`, `operation`, eventまたはAPI fields |

AIによる更新toolは次を共通要件とする。

1. active change setのIDが必須
2. `expectedRevision`と`expectedChangeSetVersion`が一致しない場合は失敗
3. command適用後に不変条件を検証
4. 成功時はoperation ID、確定revision、change set versionを返す
5. 確定モデルを変更せず、UIを即座にpreview更新する

`change_component_structure`は巨大な汎用編集toolではなく、component treeだけを対象にしたdiscriminated operationである。

- `add`: `parentId`, `kind`, `config`, `position`。Modalは`parentId: null`、それ以外はcontainer parentを必須とする
- `duplicate`: `componentId`。Page／Modal root以外のsubtreeを同一parent内の直後へatomicに複製する
- `move`: `componentId`, `newParentId`, `position`
- `remove`: `componentId`

`remove`は対象subtreeとその依存参照をまとめて削除する。Page rootは削除できず、Modal rootはそのsubtreeごと削除できる。

`change_screen_structure`もscreen管理だけを対象にする。

- `add`: `name`, `route`
- `update`: `screenId`, optional `name`, optional `route`
- `remove`: `screenId`

### 11.4 公開しない操作

- アプリ内clipboardのCopy／Paste（OS clipboardや外部JSONを扱わない人間向け操作）
- change setの反映
- change setの破棄
- Undo／Redo
- local dataの全消去
- 任意JSON Patch
- 任意コード実行

## 12. アプリケーション構成

採用技術:

- Vite
- React
- TypeScript strict mode
- Zustand
- Node.js regression harness、Linkedom DOM fixture、実Chrome/CDP regression
- CSS Modulesと共通設計token

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
  | "INVALID_ARGUMENT"
  | "INVARIANT_VIOLATION"
  | "REVISION_CONFLICT"
  | "LOCKED_FIELD"
  | "CHANGE_SET_REQUIRED"
  | "CHANGE_SET_ALREADY_ACTIVE";
```

UIはtoastと該当フォームのinline errorで表示する。WebMCPは`code`、`message`、`details`を含む失敗結果を返す。成功形へのfallbackや部分成功は行わない。`expectedRevision`／`expectedChangeSetVersion`の欠落・型・範囲エラーは`INVALID_ARGUMENT`、有効な整数と現在値の不一致だけは`REVISION_CONFLICT`とし、後者の場合だけ最新contextを取得して再試行する。

## 13. 永続化

- key: `screen-blueprint-studio:v1`
- 確定`ProjectDocument`と最後のUI選択を保存
- active change setも保存し、refresh後にレビューを継続可能にする
- undo historyとredo stackはセッション内だけに保持
- 読み込み時にschema versionと不変条件を検証
- 不正データの場合は自動初期化せず、復旧またはsample再読み込みを選べるエラー画面を表示
- 確定documentが正常でactive change setだけが不正または再生不能な場合は、確定documentを通常起動し、pending change setだけを破棄して永続noticeで通知する
- active change setに旧`source: human` operationが含まれる場合は黙って破棄またはAI扱いせず、raw JSONを保持したRecovery画面で明示対応を求める
- 書き込み失敗時は永続警告bannerを表示し、確定documentとpreview中のeffective documentをJSONで退避できる
- change set破棄の保存に失敗した場合は古いactive payloadを削除し、rejected IDとの照合でも再復元を防ぐ
- recovery中はJSON退避とsample初期化以外のwriteを拒否し、WebMCP readにはrecovery状態だけを公開する

保存は確定transactionまたはchange set更新後に同期実行する。MVPのデータ量ではdebounceを必要としない。

## 14. アクセシビリティとレスポンシブ

- 主要操作をbutton、form control、tree semanticsで提供
- dnd-kitのpointer、touch、keyboard sensorを提供し、Tree drag handleとCanvasのfocus可能なcomponent面にaccessible nameを設定
- component配置はdomainの共通classifierで`moved`／`no-op`／`invalid(reason)`へ分類する。drop slotから同一parent内の最終indexを正規化してから判定し、no-opではrevision、history、change set version、Toastを変更しない。invalidはroot、self/descendant、children不可、kind制約、別Screen、stale、位置不正、その他domain制約へ型付きで分ける
- DnD状態は視覚的なline・outlineに加え、選択localeのscreen reader announcementで通知する。moved／no-op／cancelはDnD live region、invalid確定時は理由別error Toastを使い、同じ失敗を二重announceしない
- キーボードで選択、context menu追加、DnD、削除、選択解除、Undo／Redoが可能
- 選択を色だけで示さない
- change setのAI変更を色とlabelの両方で示す
- 画面幅1024px以上を主要対象とする
- 狭い画面では左右ペインをtabへ折りたたむ
- WebMCP非対応ブラウザでも人間向け機能はすべて利用可能

## 15. テスト方針

### 15.1 Domain unit tests

- 全commandの正常系、異常系
- screen追加・削除、最後の1画面の削除拒否、選択screenのreconcile
- 別screenへのnavigate参照と参照中screenの削除拒否
- component treeの循環・不整合防止
- subtree削除時の参照cleanup
- state override適用
- validation ruleの重複・矛盾（required/email/min/maxLengthの重複、min>max、空pattern/custom description、不正な正規表現等）の拒否
- custom validation ruleの保存と非実行
- change set反映、破棄、revision conflict
- Undo／Redo、revision単調増加、確定分岐時のredo破棄

### 15.2 Store integration tests

- active change setがない通常時の人間commandは即時確定される
- AI commandはactive change set内で確定モデルを変えずpreviewだけを変える
- active change set中の人間編集は中央guardで拒否され、document、change set、history、storageが不変
- active change set中も選択、閲覧、zoom/pan、Flow、locale、pane resize等のUI-only操作は利用できる
- acceptで1transactionとして確定される
- rejectで確定モデルが変わらない
- 永続化後に同じeffective documentを復元する

### 15.3 UI tests

- パレットから追加し、canvasとtreeへ同時反映
- component選択とinspector編集
- state切り替え
- change set差分、反映、破棄

### 15.4 WebMCP handler tests

CIではnative APIそのものではなく、Promise registration stub、tool handler、store、実Chrome上の通常UIをテストする。

- schemaに対応した引数処理
- read-only toolの返却
- AI writeでのactive change set必須
- stale revision拒否
- tool実行後のstoreとUI相当状態

WebMCP testing対応Chromeでは最後に、実API登録、context read、change set開始、write 1件、UI preview、Human Accept/Rejectを手動確認する。native smoke未実施を自動test成功として扱わない。

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
3. active change set中のreview lock
4. 反映、破棄、通常時のUndo／Redo
5. refresh後のactive change set復元

完了条件: AI相当のcommand列をpreviewし、人間が確認後に一括反映または破棄できる。

### Phase 4: WebMCP

1. TypeScript型定義とfeature detection
2. 3 read tools
3. `begin_change_set`
4. 5 write tools
5. WebMCP状態表示とtool handler tests

完了条件: エージェントが選択中componentを読み、状態・API失敗仕様を変更セットへ追加し、UIへ未反映差分として表示できる。

### Phase 5: 提出品質

1. sampleと3分デモシナリオを確定
2. onboarding、empty/error/WebMCP unsupported states
3. responsive、keyboard、視覚差分
4. README、英語説明、ライセンス
5. 公開URL、デモ動画

完了条件: 初見ユーザーが手動編集からAI変更セットの反映まで迷わず完了できる。

## 17. MVP受け入れ条件

1. AIなしで複数screenの作成・選択、component追加・移動・削除・仕様編集、状態の作成・編集・削除、component overrideと状態previewができる
2. canvas、tree、inspectorが同じモデルを表示する
3. 破損した親子参照や存在しないIDを保存できない
4. AI write toolは確定モデルを直接変更せず、screenとcomponent構造の追加・更新・移動・削除と既存stateの修正をactive change set上で行える
5. active change set中はreview lockを表示し、人間のProjectDocument変更を全入口で拒否できる
6. 人間だけがchange setを反映・破棄できる
7. active change setにはAI operationだけが入り、旧human operationを明示的にinvalidとして扱える
8. 反映したchange set全体を1回のUndoで戻し、Redoで再適用できる
9. WebMCP非対応でも人間向けアプリが動作する
10. WebMCP testing対応Chromeのmanual smokeで9個のtool登録、read、write、UI previewを確認できる
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
