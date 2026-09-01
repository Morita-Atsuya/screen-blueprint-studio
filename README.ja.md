<img src="./brand/logo-lockup.svg" alt="Screen Blueprint Studio" width="324">

# Screen Blueprint Studio

[English](./README.md)

画面構成、状態、再利用するUI、動作をひとつの視覚的な設計図にまとめ、プロダクト、デザイン、開発、QA、AIの担当者が同じ内容を理解できるようにします。

[ライブデモを試す](https://morita-atsuya.github.io/screen-blueprint-studio/)

## このアプリが解決すること

ワイヤーフレームは見た目を示し、画面状態、遷移、APIの動作は別の文章で管理されることが少なくありません。製品が変化すると、それらの内容にずれが生まれます。

Screen Blueprint Studioは、目で確認できるワイヤーフレームと構造化された仕様を一緒に管理します。自由に線を描く代わりに、名前、レイアウト、識別子、状態、動作が明確なコンポーネントを組み合わせて画面を作ります。確認しやすいキャンバスを保ちながら、実装の相談や自動化ツールにも使える正確なモデルを維持できます。

## できること

- **画面全体の流れを設計する。** 複数の画面を作成し、通常状態と名前付きの状態を設定し、画面遷移をフロー表示で確認できます。
- **意味のあるコンポーネントで組み立てる。** Palette、Tree、Canvas、Inspectorを使い、Page、Container、Text、Text Input、Select、Button、Image、Link、Collection、独立したModalフレームを配置できます。
- **ピクセルの微調整に頼らずレイアウトを指定する。** 縦、横、12トラックのグリッドと、制約付きの配置、幅、span、grow、shrink設定を利用できます。
- **UIを安全に再利用する。** 安定した内部node、型付き公開プロパティ、Variantを持つShared Component Definitionを作成できます。Definitionの変更はすべてのInstanceへ反映されます。
- **データに基づく一覧を表す。** CollectionでDefinitionを繰り返し、上限付きpreview data、安定したitem key、itemから公開プロパティへのbinding、完全一致によるVariant選択と表示ルールを設定できます。
- **画面と動作を結び付ける。** click／submit event、順序付きaction、画面状態、navigation、API request bindingを記録できます。Collection itemまたは固定値を、API fieldやnavigationのroute／query parameterへ渡せます。
- **変更を確認しながら編集する。** 人間が確定した編集にはUndo／Redoを使えます。削除の影響確認、壊れたbrowser dataの復旧、AIが提案したchange setのpreviewと反映／破棄にも対応します。

## 人とAIが共有するひとつの作業環境

人はdrag and drop、画面状態、Canvas、Tree、Inspectorを使って視覚的に操作します。AI agentは11個のWebMCP toolを使い、現在の画面や選択箇所を読み取り、画面、component、state、behavior、shared componentの変更を、名前と型を持つ操作として提案します。

人とAIは同じlive page modelを利用します。AIの提案はアプリ内のchange setとして表示され、人が結果をpreviewしてから反映または破棄します。この確認手順は、別のexportや承認systemではなく、製品独自の共同作業modelです。

## クイックスタート

[ライブデモ](https://morita-atsuya.github.io/screen-blueprint-studio/)を開き、画面を選んでCanvasまたはTree上のcomponentを選択します。Paletteから構造へ項目をdragし、Inspectorで仕様と動作を編集し、Canvas上部で状態を切り替えます。

ローカルで実行する場合:

```bash
npm install
npm run dev
```

コマンド、browser regression、WebMCP対応Chromeの設定、contribution時の確認事項は[開発ガイド](./docs/DEVELOPMENT.ja.md)を参照してください。

## 公開ドキュメント

- [User guide](./docs/USER_GUIDE.md) / [ユーザーガイド](./docs/USER_GUIDE.ja.md)
- [Portable specification v3](./docs/PORTABLE_SPEC.md) / [ポータブル仕様 v3](./docs/PORTABLE_SPEC.ja.md)
- [Development guide](./docs/DEVELOPMENT.md) / [開発ガイド](./docs/DEVELOPMENT.ja.md)
- [Product roadmap](./docs/ROADMAP.md) / [プロダクトロードマップ](./docs/ROADMAP.ja.md)
- [公開JSON Schema](./public/schemas/screen-blueprint-project-v3.schema.json)
- [Canonical v3 example](./public/examples/screen-blueprint-project-v3.json)

## 現在の制約

プロジェクトは現在browserの`localStorage`に保存され、製品UIにはJSON／YAMLの読み込み・書き出し機能がまだありません。エディタが扱えるcomponentとbehaviorは定義済みの種類に限られ、Canvasは操作可能なprototype playerではなく編集画面です。WebMCPには対応する実験版Chromeが必要ですが、人向けの編集UIはWebMCPなしでも利用できます。

project file、より幅広い仕様表現、専用review modeの予定は[プロダクトロードマップ](./docs/ROADMAP.ja.md)を参照してください。

## ライセンス

Screen Blueprint Studioは[MIT License](./LICENSE)で公開しています。
