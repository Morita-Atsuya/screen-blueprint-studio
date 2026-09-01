# Screen Blueprint Studio プロダクトロードマップ

[English](./ROADMAP.md)

最終更新: 2026年9月1日

Screen Blueprint Studioは、意味のあるUIコンポーネントから、ワイヤーフレーム、画面状態、振る舞い、API binding、人間とAIによるレビュー可能な変更を共有するsource of truthを構築します。画面を自由描画ではなく構造化された仕様としてモデル化し、ひとつのportableなモデルを通じて視覚編集と振る舞いの整合性を保ち、AIが作成した変更の決定権を人間に残します。エディタは仕様に含まれるraw CSS、任意のHTML、JavaScript式を描画・実行しません。

## このリリースで利用可能

- 画面構造、ワイヤーフレームcanvas、仕様Inspectorで構成する3ペインworkspace。
- PageとModalをrootとする複数画面、意味のあるcomponent、再利用可能なlayout primitive、制約付き配置、portableなsize token。
- 型付きpublic propertyとvariantを持ち、検証済みの再利用可能なinstanceを複数画面へ配置できるShared Components。
- 意味のあるselectionと仕様編集を維持しながら、item駆動で繰り返す画面内容を扱うCollection modeling。
- component単位で表示、活性状態、内容、値をoverrideできる画面状態。
- 状態変更、API operation呼び出し、別画面への遷移を実行できる、順序付きの`click`／`submit` behavior。
- request field bindingと成功／エラー時の画面状態を持つAPI operation。
- portable URL、アプリ内画面、外部URL、論理resourceを扱う、安全で意味のあるImage／Link仕様。
- 人間による直接編集、Undo／Redo、local保存とrecovery、subtreeの複製とCopy/Paste、検証付きdrag-and-drop。
- 現在の画面、selection、effective documentをAI agentと共有する型付きWebMCP tool。Agentの書き込みは、人間が反映または破棄するまでレビュー可能なchange setに保持されます。

## 今後の追加予定

今後の追加では、Studioをcode editorに変えることなく、portabilityとbehavior modelingを拡張します。

- Project全体を環境間で移動し、version control上でreviewできる **portable JSON/YAML Import/Export**。
- 参照、validation、WebMCP操作を支援するtyped standard caseを備えた **open-world specification model**。標準のconvenienceとして、`component`、`item`、`route`、`query`、`literal` ValueSource、`load`／`change` trigger、back／external navigation／resource／scroll action、HTTP status別API outcomeを提供します。
- Standard typeがまだないHTML／UI component、trigger、action、condition、value sourceを扱う **custom specification fallback**。Custom entryは`name`、`description`、`input`、`output`、`example`、`implementation notes`を保持してStudio上に表示し、unknown enum valueとして拒否せずround-tripします。これは記述的な仕様であり、HTMLやJavaScriptとして実行しません。
- 画面状態、collection item、navigation、API outcomeをより明確に確認し、編集contextとpreview contextを分離する **操作previewの改善**。

各機能の設計に伴ってroadmapのscopeを調整する場合がありますが、portability、open-world fallbackを持つtyped standard case、人間によるreviewという原則は製品境界として維持します。
