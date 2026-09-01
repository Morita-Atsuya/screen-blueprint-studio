# ポータブル仕様 v3

[English](../en/PORTABLE_SPEC.md) · [製品概要](../../README.ja.md) · [公開JSON Schema](../../public/schemas/screen-blueprint-project-v3.schema.json) · [Canonical example](../../public/examples/screen-blueprint-project-v3.json)

## 目的

Screen Blueprint Studioは画面の設計図をcanonical v3 documentとして保存します。これはプロジェクトの基準となる構造化表現であり、Canvas、Tree、Inspector、Flow表示、WebMCPの情報はこのdocumentから作られます。

ここで**canonical**とは、wireframeとbehaviorを別々に正しいものとして持たず、ひとつの表現をプロジェクトの基準にすることです。**typed**とは、対応するcomponent、target、action、valueが検証可能な明示形を持つことです。**portable**とは、browserのDOM node、座標、実行時だけのstateではなく、stable ID、local reference、JSON互換value、制約付きlayout tokenで表すことです。

## Canonical documentとworkspace state

Canonical documentはrevisionを含まない確定済みprojectです。top-levelは次の構成です。

```text
$schema
kind
schemaVersion
project
componentDefinitions
screens
components
screenScenarios
events
apiOperations
```

Editor revision、active screen、active Scenario、selection、Undo history、active change setは意図的に含めません。

アプリは、これらの運用上の値をworkspace envelopeへ分離し、browserの`localStorage`へ保存します。envelopeには確定document、optimistic revision、active UI context、作業中のAI change setが含まれます。effective preview documentはchange setを確定documentへ適用して導出する表示であり、2つ目の保存projectではありません。

## 公開契約

- Schema version: `3`
- Kind: `screen-blueprint-project`
- Schema URL: <https://morita-atsuya.github.io/screen-blueprint-studio/schemas/screen-blueprint-project-v3.schema.json>
- Repository schema: [`public/schemas/screen-blueprint-project-v3.schema.json`](../../public/schemas/screen-blueprint-project-v3.schema.json)
- Repository example: [`public/examples/screen-blueprint-project-v3.json`](../../public/examples/screen-blueprint-project-v3.json)

公開Schemaとexampleは開発者向けの契約資料です。現行releaseの製品UIには、JSON／YAML project fileの読み込み・書き出し機能が**ありません**。fileによる共有とvalidation付きimport／exportは[ロードマップ](./ROADMAP.md)で予定しています。

## 主要概念

### Project、Screen、Scenario

Projectはstable IDでScreenの順序を管理します。各Screenは名前、route、base description、1つのPage root、任意の独立Modal root、名前付きScenario、Eventを持ちます。

Scenarioはloading、empty、saving、success、errorなどの状態を表します。canonical component targetで指定したfield単位のoverrideを持ちます。base screenがdefaultであり、Scenarioには明示した差分だけを保存します。

### Screen component、placement、sizing

Screenが所有するcomponentは、inline nodeまたはShared Component Instanceです。Inline nodeはparent／child treeを作り、Page、Container、Text、Text Input、Select、Button、Image、Link、Collection、Modalという対応済みの意味的kindを使います。

Placementはflow、overlay、sticky edge、frame viewportという制約付きmodeを使います。Sizingはinline size、最小・最大幅、12-track grid span、grow ratio、shrink behaviorをportableな値で指定します。rootのplacementとsizingは固定です。無効なparent、layout、placement、sizingの組み合わせは、黙って補正せず拒否します。

### Shared Component DefinitionとInstance

Definitionはproject全体で利用し、次を所有します。

- stableなDefinition ID
- stableなDefinition-local node IDと1つのroot node
- 再利用するsubtree
- typed public property
- Variant propertyと完成済みVariant

Screen上のInstanceはscreen componentとしてのstable IDと、Definitionを指すlocal JSON Pointer `$ref`を持ちます。保存するのは明示したpublic-property value、選択Variant、screenが所有する外側のplacement／sizingだけです。

VariantがDefinition nodeのtopologyを変えることはありません。対応fieldだけをoverrideできます。解決順は次のとおりです。

1. Definition base field
2. 選択された最終Variant
3. 明示したInstance public-property value
4. active Scenario override

Definitionのnest referenceは循環しないdirected graphでなければならず、展開上限も守る必要があります。

### Collection

Collectionは、preview itemごとにscreen component subtreeを作らず、1つのDefinitionを繰り返します。次を保存します。

- 任意のAPI operation referenceとresponse `itemsPath`
- 最大20件に制限したpreview object
- scalar結果が一意になるRFC 6901 item-key JSON Pointer
- Definition reference、base Variant、明示propertyを持つitem template
- itemまたはliteralからpublic propertyへのbinding
- 順序付きのexact-scalar Variant caseと明示fallback
- 一致時とfallbackの結果を明示した任意のexact-scalar visibility rule

Preview itemはeditor用の選択sliceであり、2つ目のAPI response schemaではありません。描画時のDOM IDやpreview順序は、永続化するbehavior targetには使いません。

### Targetとidentity

Component、Scenario override、Event、API bindingは次の3形式のtargetを使います。

- `inline`: screen-owned inline component ID
- `definitionNode`: Instance IDとstableなDefinition-local `nodePath`
- `collectionItemNode`: Collection IDとstableなDefinition-local `nodePath`

最後の形式は「すべてのCollection itemに共通するitem template内のこのnode」を意味します。一時的なpreview item keyをCanvas描画に利用する場合も、canonical targetには保存しません。そのため、表示内容のrenameやreorderでtarget identityが変わりません。

Definition referenceは`#/componentDefinitions/shared~1header`のようなlocal JSON Pointer fragmentを使います。pointer tokenでは`~`を`~0`、`/`を`~1`へescapeします。

### Event、action、API operation

EventはScreenに所属し、`click`または`submit` triggerと、順序付きactionを持ちます。対応actionはScenarioの設定／解除、API operationの呼び出し、別Screenへのnavigationです。

Navigationの名前付きroute／query parameterには、次の値を設定できます。

- `{ "type": "item", "path": "/id" }`: RFC 6901 pointerで現在のCollection itemを参照
- `{ "type": "literal", "value": "task-list" }`: JSON scalarの固定値

API operationはmethod、path、request binding、任意のsuccess／error Scenarioを記録します。Request bindingは、既存の構造化target pathへinput component target、現在のCollection item value、literal scalarを接続します。

Item sourceは、Event targetによって1つのCollection item contextが決まる場合だけ有効です。API item bindingのcallerも同じCollection contextでなければなりません。pointerの欠損、scalarが必要な箇所でのobject／array、type mismatch、cross-Screen reference、cross-Collection contextは、default値へ置き換えずvalidation errorにします。

## Validationとround-trip方針

Runtimeは構造と意味の両方を検証します。

- 対応するobject fieldとvalue type
- entity ownershipとreferenceの存在
- parent／child topologyとroot制約
- Definition DAGと展開上限
- public propertyとVariantの互換性
- Collection上限、pointer syntax、item-key uniqueness、scalar rule
- Event、navigation、API、Scenario、target context
- placementとsizing rule
- prototype-chainに対して安全なentity ID

値の欠損と明示的な`null`は区別します。Copy、duplicate、extract、detach、deleteでは、依存するIDとtargetをatomicにrewriteするか、操作を拒否します。未対応または不正なdataを黙って削除しません。

現行v3 modelは意図的にguidedであり、記載したstandard kindとbehaviorだけを受け付けます。他のcomponentやbehaviorを非実行のcustom specificationとして保持する機能は、[ロードマップ](./ROADMAP.md)で予定しています。
