# Screen Blueprint Studio プロダクト方針・引き継ぎ

最終更新: 2026-08-27（JST）

ステータス: **この方向でWebMCP Challenge向けアプリを作成する**

この文書は、企画検討の経緯、採用したプロダクトの狙い、WebMCPを使う必然性、MVP範囲、次の設計スレッドで決める事項をまとめた引き継ぎ資料である。Challenge全体の規約・評価基準は [HACKATHON_BRIEF.md](./HACKATHON_BRIEF.md) を参照する。

## 1. 決定事項

WebMCP Challengeでは、**再利用可能なUIコンポーネントを組み合わせてワイヤーフレームを作り、その構造から画面仕様書・状態・イベント・API連携・テスト観点を一体的に管理するWebアプリ**を作成する。

正式名称は **Screen Blueprint Studio** とする。

自由描画型のデザインツールやFigmaクローンは作らない。CMSやページビルダーのように、あらかじめ用意した意味付きコンポーネントを配置して画面を構築する。ワイヤーフレームは独立した成果物ではなく、構造化された画面仕様の視覚表現として扱う。

## 2. この案に至った問題意識

起点となった問題は次のとおり。

- 文章や表だけの画面仕様書は、対象画面を頭の中で再構築しないと読めない
- ワイヤーフレームやデザインと仕様書を別々に作ると、変更時に内容がずれる
- 項目、表示条件、イベント、API、権限、エラー、テスト観点が複数ツールへ分散する
- 仕様漏れを人間の注意力だけで防ぐのは難しい
- 仕様書作成そのものを目的にすると入力負担が大きく、更新されなくなる

したがって目指すのは「仕様書を書くためのフォーム」ではない。**画面を構造的に組み立て、振る舞いを定義すると、その副産物として読みやすく検証可能な仕様書が生成される体験**である。

## 3. 企画検討で重視した判断基準

初期にはデータマッピング、インシデント分析、消込など複数案を検討した。しかし、単にエージェントへ指示し、バックグラウンドで処理させるだけなら通常のMCPやAIアプリで十分であるという問題があった。

最終的に重視したのは次の条件である。

1. AIがいなくても、人間がWebアプリを直接使う価値がある
2. 人間が画面を触ること自体に意味がある
3. 人間とエージェントが同じ画面、選択、未保存ドラフト、変更セットを共有する
4. エージェントの変更が同じUIへ現れ、人間が修正・反映・破棄できる
5. 人間の修正や破棄を、エージェントが次の操作に利用する
6. 名前付き・型付きツールが、座標クリックより安全で意味のある操作になる

Screen Blueprint Studioでは、ワイヤーフレーム上の選択、編集中の仕様、表示中の状態、未反映の変更セットがブラウザ内に存在するため、この条件を満たせる。

## 4. `screen-spec`との関係

[itwillrain/screen-spec](https://github.com/itwillrain/screen-spec) を参考実装として扱う。

このリポジトリには、以下の考え方や機能がすでに存在する。

- YAMLベースの画面仕様
- 項目、レイアウト、状態、イベント、画面遷移
- APIと画面項目の対応
- 権限制御
- デザイン画像と画面要素の領域マッピング
- 仕様の完全性診断
- テスト項目生成
- Viewer、構造編集、YAML編集、差分表示

権利関係については相談済みで、参考にすることは了承を得ている。ただしChallenge向けアプリは、原則として既存リポジトリをforkせず、**考え方を参考にした独立した新規実装**とする。

注意点:

- ソースコードやアセットをそのまま流用する場合は、改めて範囲とライセンスを確認する
- 独自のデータモデル、UI、WebMCPツールとして設計する
- 提出リポジトリにはOSSライセンスを付与する
- 何を参考にしたかはREADMEで明示する

## 5. プロダクトの基本構造

### 5.1 CMS型の画面構築

利用者はコンポーネントパレットから部品を選び、画面へ配置する。

初期コンポーネント候補:

- Container: Page、Section、Container、Modal
- Layout properties: vertical、horizontal、grid、gap、distribution、alignment、wrap
- Navigation: Header、Sidebar、Tabs、Breadcrumbs
- Content: Text（heading／body／caption styles）、Image、Card、Table
- Form: Text Input、Textarea、Select、Checkbox、Radio、Date Input
- Action: Button、Link
- Feedback: Alert、Inline Error、Modal、Toast、Loading、Empty State

配置結果は自由なピクセル座標ではなく、順序と親子関係を持つツリーとして保存する。PageとModalはScreen直下の独立rootとし、ModalをPageの通常レイアウトへ混在させない。

```text
Page
├─ Header
├─ Section: 基本情報
│  ├─ TextInput: 氏名
│  ├─ EmailInput: メールアドレス
│  └─ Select: ロール
└─ Container (horizontal, end)
   ├─ Button: キャンセル
   └─ Button: 保存
```

### 5.2 コンポーネントが持つ仕様

各コンポーネントは見た目だけでなく、仕様情報を持つ。

入力項目の例:

- 項目ID、名称、型、必須・任意
- 初期値、入力制限、バリデーション
- エラーメッセージ
- 表示条件、活性条件、編集可能条件
- 権限・ロールごとの差異
- APIのリクエスト・レスポンス項目との対応

代表的な制約は型付きで保持し、モデルで表現できない複合条件や業務固有ルールは自然言語のcustom仕様として残せるようにする。任意コードとしては実行しない。

ボタンの例:

- 表示文言
- クリック時イベント
- 表示・活性条件
- 確認の有無
- 呼び出すAPI
- 成功・失敗時の状態遷移または画面遷移
- 二重送信防止

### 5.3 同じモデルから複数の表現を生成する

ひとつの画面仕様モデルから、次を同期して表示・生成する。

- ワイヤーフレーム
- 画面項目一覧
- 状態別プレビュー
- イベント・状態遷移図
- APIマッピング
- 権限差分
- バリデーション一覧
- テスト観点・受け入れ条件
- JSONまたはYAML

WFと仕様書を別々に同期するのではなく、**同じデータモデルの異なる投影**として扱う。

## 6. 想定UI

基本は3領域のワークスペースとする。

### コンポーネント／画面構造

- コンポーネントパレット
- ページ内のツリー
- 画面・状態の切り替え

### ワイヤーフレームキャンバス

- コンポーネントの配置、選択、並び替え
- セクションやコンテナ間の移動
- 状態別プレビュー
- 仕様漏れ、AI変更、変更差分のハイライト

### 仕様インスペクター／変更レビュー

- 選択中コンポーネントの仕様編集
- イベント、API、権限、バリデーション
- エージェントの変更セット
- 反映、破棄、修正、Undo

MVPでは自由配置ではなく、パレットからの追加、同一親内の並び替え、container間移動をtree/canvas共通のdrag & dropとして提供する。クリック追加と矢印移動もキーボードfallbackとして維持する。

## 7. WebMCPを使う必然性

通常のMCPでも、保存済みのJSONやYAMLを読み書きできる。しかし、Screen Blueprint Studioで重要なのは次のページ内状態である。

- 現在開いている画面と状態
- キャンバス上で選択しているコンポーネント
- 未保存の編集内容
- 反映前のエージェント変更セット
- 人間がchange set内で修正した内容

Computer Useは画面上の位置をクリックできるが、要素の仕様上の意味やIDを推測する必要がある。WebMCPでは、同じクライアント状態と検証ロジックを使い、`fieldId`、`eventId`、`stateId`などを引数にした型付き操作として公開できる。

### WebMCPツール候補

読み取り:

```text
get_current_screen_context
get_component
get_screen_diagnostics
get_pending_change_set
```

変更セット操作:

```text
begin_change_set
change_screen_structure
change_component_structure
update_component_spec
upsert_screen_state
connect_behavior
```

後続候補となる診断・生成:

```text
audit_screen_completeness
generate_acceptance_criteria
generate_test_cases
```

実装時は巨大な `edit_screen(instruction: string)` ひとつに集約しない。人間向けUIの操作単位と対応する、意味のある中粒度ツールにする。

## 8. 人間とエージェントの共同作業ループ

代表的なデモシナリオ:

1. 人間がユーザー編集画面をコンポーネントから組み立てる
2. 保存ボタンを選択する
3. 「保存中とAPI失敗時の仕様を追加し、漏れを確認して」とエージェントへ依頼する
4. エージェントが現在の画面、選択、未保存ドラフトを取得する
5. `saving`、`saveError`、二重送信防止、APIエラー表示、テスト観点を変更セットへ追加する
6. 変更箇所がWFと仕様パネルの両方でハイライトされる
7. 人間が「モーダルではなくフォーム上部のインラインエラーにする」と修正する
8. エージェントが修正内容を利用して状態・イベント・テスト項目を更新する
9. 人間が変更セットを反映し、仕様書を出力する

一回の指示で完成させるのではなく、**人間の視覚判断とエージェントの網羅性・一括更新を交互に使う**ことが重要である。

## 9. 対象ユーザーと価値

主な対象:

- Webサービスのプロダクトマネージャー
- UI/UXデザイナー
- フロントエンド・バックエンドエンジニア
- QA、テスト設計担当者
- 受託開発、オフショア開発、複数組織間で画面仕様を受け渡すチーム
- 監査・品質保証・規制対応により仕様の追跡性が必要な組織

提供価値:

- WFと仕様書の乖離を減らす
- 仕様漏れを実装・テスト前に検出する
- 画面を見ながら職種間でレビューできる
- API、権限、状態、テストの追跡性を高める
- 仕様書更新を独立作業にせず、画面編集の副産物にする

## 10. 海外向けの位置付け

海外にもSoftware Requirements Specification、UI Requirements、Interface Design Descriptionなどの文化は存在する。ただしWeb系のプロダクト開発では、情報がPRD、Figma、Jira、OpenAPI、Storybook、テストへ分散することが多い。

そのため海外向けには「日本式の画面設計書作成ツール」ではなく、次のように説明する。

> Compose screens from semantic UI components, then derive functional specifications, states, API bindings, permissions, and test cases from the same source of truth.

市場上の位置付け:

- Figma: 見た目とインタラクションをデザインする
- Storybook: 主に実装されたコンポーネントと状態を記録・検証する
- PRD/Jira: 目的、要求、ストーリー、受け入れ条件を管理する
- Screen Blueprint Studio: 実装前の画面構造と振る舞いを、視覚的かつ検証可能な仕様として定義する

海外では「詳細な仕様書を追加で書く」ことは負担と見なされやすい。したがって、訴求の中心は文書作成ではなく、**visual modeling first, documentation as a byproduct** とする。

## 11. Challenge向けMVP

### 必須

- コンポーネントパレット
- 複数画面の作成、選択、名称変更、削除
- 画面IDを使ったイベント・遷移の関連付け
- 選択画面の構造化キャンバス
- コンポーネント追加、選択、並び替え、削除
- 選択要素の仕様インスペクター
- 通常、保存中、エラーなどの状態切り替え
- エージェント変更の視覚的な区別
- 変更セットの反映、破棄、Undo
- 10個の型付きWebMCPツール
- 同じ状態に対する人間操作とエージェント操作
- サンプルプロジェクトと3分以内のデモシナリオ
- 公開URL、英語説明、OSSライセンス

### 余裕があれば

- 仕様の不足診断
- 画面遷移図
- APIマッピング画面
- 権限別プレビュー
- 仕様書のMarkdown/PDF出力
- JSON/YAML import/export
- コンポーネントテンプレート
- 変更履歴

### 対象外

- Figma相当の自由描画
- ピクセル単位のデザイン調整
- リアルタイム複数人共同編集
- 本番コードの自動生成
- GitHubやFigmaとの本格的な双方向同期
- 大規模な認証・組織管理
- エージェントだけによる完全自律作成

## 12. 審査基準への対応

| 評価項目 | このプロダクトで示す内容 |
| --- | --- |
| WebMCP Leverage | 選択中の要素、未保存仕様、状態、未反映の変更セット、人間による修正を型付きツールで共有し、人間との往復に利用する |
| Execution | 手動でも画面を構築でき、AI変更、レビュー、仕様出力まで一貫した体験を完成させる |
| Potential Impact | デザインと仕様の乖離、仕様漏れ、職種間の認識差という具体的問題を解決する |
| Creativity & Ambition | 汎用AIワイヤーフレームではなく、デザイン・振る舞い・API・テストを同一モデルに統合する |

最大の失敗パターンは、WebMCPツールが単なるYAML編集APIになることである。デモでは必ず、ページ上の現在選択、未反映の変更セット、人間の修正をエージェントが再利用する場面を見せる。

## 13. 実装方針

- Challenge用リポジトリでゼロから独立実装する
- React、TypeScript、Vite、Zustandによるクライアント中心のMVPを実装済み
- データモデルと状態管理を先に設計し、キャンバスと仕様書を同じモデルから描画する
- 人間向け操作とWebMCPツールで同じ更新関数・検証処理を呼ぶ
- エージェントの変更はchange setとしてレビューし、人間だけが反映または破棄する
- デモに不要な自由度より、状態・エラー・差分・Undoの完成度を優先する

## 14. 次の設計スレッドで決めること

優先順に次を設計する。

1. MVPの代表ユーザーと代表シナリオ
2. 画面仕様の最小データモデル
3. 初期コンポーネント一覧と各props
4. 状態、イベント、API、権限の表現方法
5. キャンバス、ツリー、インスペクターの画面構成
6. change set、反映、破棄、Undoの状態遷移
7. WebMCPツールの一覧、schema、読み書き境界
8. 3分デモで使うサンプル画面と不足仕様
9. 技術スタックと実装順序
10. 提出名、英語の一文説明、OSSライセンス

## 15. 参照資料

- [OpenAI WebMCP Challenge](https://openai.com/webmcp-challenge/)
- [Devpost Official Rules](https://webmcp.devpost.com/rules)
- [WebMCP Explainer](https://github.com/webmachinelearning/webmcp)
- [screen-spec](https://github.com/itwillrain/screen-spec)
- [ISO/IEC/IEEE 29148 Requirements Engineering](https://www.iso.org/standard/72089.html)
- [NASA Software Requirements Specification guidance](https://swehb.nasa.gov/spaces/SWEHBVB/pages/32604425/SRS+-+Software+Requirements+Specification)
- [Storybook: What's a Story?](https://storybook.js.org/docs/get-started/whats-a-story)
- [GOV.UK Design System Components](https://design-system.service.gov.uk/components/)
