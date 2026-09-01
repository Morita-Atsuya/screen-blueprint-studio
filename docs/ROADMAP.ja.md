# Screen Blueprint Studio プロダクトロードマップ

[English](./ROADMAP.md)

最終更新: 2026年9月1日

Screen Blueprint Studioは、意味のあるUIコンポーネントから、ワイヤーフレーム、画面状態、振る舞い、API binding、人間とAIによるレビュー可能な変更を共有するsource of truthを構築します。このロードマップでは、現在利用できる製品能力、現在のmilestoneで進行中の項目、次に計画している拡張を分けて示します。

## プロダクト原則

- 画面を自由描画ではなく、意味と構造を持つ仕様としてモデル化します。
- ひとつのportableなモデルを通じて、視覚編集、振る舞い、文書の整合性を保ちます。
- AIが作成した変更には明示的なpreview、反映、破棄の手順を設け、人間が決定権を持ちます。
- 隠れた実装詳細ではなく、制約付きの型を持つ選択肢を優先します。仕様ではraw CSSや任意のJavaScript式を公開しません。

## 現在利用できる機能

- 画面構造、ワイヤーフレームcanvas、仕様Inspectorで構成する3ペインworkspace。
- PageとModalをrootとする複数画面、意味のあるcomponent、再利用可能なlayout primitive、制約付き配置、portableなsize token。
- component単位で表示、活性状態、内容、値をoverrideできる画面状態。
- 状態変更、API operation呼び出し、別画面への遷移を実行できる、順序付きの`click`／`submit` behavior。
- request field bindingと成功／エラー時の画面状態を持つAPI operation。
- portable URL、アプリ内画面、外部URL、論理resourceを扱う、安全で意味のあるImage／Link仕様。
- 人間による直接編集、Undo／Redo、local保存とrecovery、subtreeの複製とCopy/Paste、検証付きdrag-and-drop。
- 現在の画面、selection、effective documentをAI agentと共有する型付きWebMCP tool。Agentの書き込みは、人間が反映または破棄するまでレビュー可能なchange setに保持されます。

## 現在のmilestone

| 製品能力 | Status | 目指す成果 |
| --- | --- | --- |
| Shared Components | **In progress** | 再利用可能なcomponentを一度定義し、型付きpublic propertyとvariantを公開して、検証済みinstanceを複数画面へ配置できるようにします。 |
| Collection | **In progress** | 意味のあるselectionと仕様編集を維持しながら、item駆動で繰り返す画面内容をモデル化するvertical sliceを提供します。 |

実装が統合・releaseされるまで、これらの行は意図的に **In progress** とします。最終統合時には、ロードマップのほかの部分を変更せず、各行を個別に「現在利用できる機能」へ移すか、このmilestoneに残せます。

## 次に計画している拡張

次のproduct incrementでは、Studioをcode editorに変えることなく、portabilityとbehavior modelingを拡張します。

- Project全体を環境間で移動し、version control上でreviewできる **portable JSON/YAML Import/Export**。
- Data-driven propertyとbindingに使える、`component`、`item`、`route`、`query`、`literal` sourceを持つ汎用typed **ValueSource** model。
- 既存の`click`／`submit`に加える **`load`／`change` trigger**。
- 状態変更、API呼び出し、アプリ内遷移に加える **back、external navigation、resource、scroll action**。
- Response classまたは個別status codeごとに異なる画面状態を選べる **HTTP status別API outcome**。
- Hard-codedな特例ではなく、再利用可能なcomponent definitionから構成する **Status Badge、Pagination、Notification pattern**。
- 編集modeと実行modeを明確に分けたまま、trigger、action、collection item、navigation、API outcomeを試せる **操作previewの改善**。

各機能の設計に伴ってroadmapのscopeを調整する場合がありますが、portability、typed model、人間によるreviewという上記の原則は製品境界として維持します。
