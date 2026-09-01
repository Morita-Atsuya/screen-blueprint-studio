# Screen Blueprint Studio ユーザーガイド

[English](./USER_GUIDE.md)

## 意味的な画像とリンク

装飾ではなく画面仕様の一部となる画像には **Image** を使います。portableな相対URLまたはHTTP(S)の絶対URL、内容を表す代替テキストを設定し、制約付きの表示方法、縦横比、プレースホルダーtokenを選択します。source未設定とnetwork読込失敗は、明示的なwireframe placeholderとして区別して表示されます。

**Link** は、アプリ内画面、外部HTTP(S) URL、論理リソースへの遷移を表します。表示ラベルとリンク先は独立して指定します。アプリ内画面は同じcontext、外部URLは同じcontextまたは新しいcontext、リソースはそれらに加えてdownloadを要求できます。ただし、browserや配信serverがdownload要求を無視する場合があります。resource IDはopaqueな論理識別子であり、project内のresource catalogへの参照ではありません。

危険なURL scheme、scheme-relative URL、制御文字、backslashで外部hostとして解釈され得る形式は拒否します。新しいcontextで開くLinkには`noopener noreferrer`を付与します。Canvasではanchorのfocusと意味論を維持し、wireframe編集中の実navigationだけを抑止します。

## Componentの配置

すべてのComponentはportableな配置modeを持ちます。**Flow** は親layoutに参加します。**Overlay** はlayout領域を占有せず、immediate logical parent内の9点anchorを使います。**フレーム端固定（Sticky edge）** はCSSのdocument stickyではありません。layout領域を占有せず、所属するPageまたはModal frameの上端／下端に留まります。**フレームviewport** は同じowning frame内の9点anchorを使い、frameのscroll contentとは分離して留まります。

Insetは`none`、`xs`、`sm`、`md`、`lg` tokenで指定し、aligned edgeから必ず内側へ離します。raw pixel、負のoffset、仕様上のz-indexは扱いません。中央axisのinsetは`none`固定です。見た目の重なり順はplacement layerとcanonical sibling orderで決まりますが、Tree階層、selection、behavior target、copy/paste、drag-and-dropはcanonical component identityとparent/index順を維持します。

## 制約付きComponentサイズ

root以外のComponentでは、配置セクションからportableなinline sizeを指定できます。**自動** は親layoutの既定動作、**内容に合わせる** は利用可能な幅を上限に内容の固有幅、**利用可能な幅を埋める** はinline方向の利用可能幅を使います。最小幅と最大幅には`xs`から`xl`までの順序付きtokenを使い、最小幅を最大幅より大きくすることはできません。

Gridは1〜12本の明示的な等幅trackを持ち、flow childは親のカラム数までspanできます。狭いframeでもtrackは自動折り畳みされず、横overflowを維持します。横方向flow childでは0〜3の伸長比と縮小の許可／防止を指定できます。正の伸長比には「利用可能な幅を埋める」と「縮小を許可」が必要で、flex basisは0です。縦方向とflow外のcontext値はneutral固定です。rootのサイズは固定され、サイズを無効にする構造変更やdrag-and-dropは補正せず拒否されます。

## 共有コンポーネント

同じ意味的subtreeを複数画面で同期したい場合は、**Component Definition**を使います。Definitionはstableなlocal node、Baseデザイン、型付き公開プロパティ、任意のVariantを所有します。画面側のDefinition **Instance**が持つのは、選択Variant、明示した公開プロパティ値、外側のplacementとsizingだけです。Definitionを編集すると、すべてのInstanceへ即時反映されます。

メイン表示の**定義**から、Definitionの作成、名前・説明の変更、複製、構造確認、対応node fieldの公開プロパティ化、Variant上書きの追加を行えます。Instanceの値は、Definition Base、選択Variant、明示したInstanceプロパティ、active Scenario上書きの固定順で解決されます。Variantが変更できるのは対応fieldだけで、node identityやtopologyは変更しません。

Paletteには利用可能なDefinitionが表示されます。Instance境界を選択すると、Variant、公開プロパティ、placement、sizingを編集できます。内部の解決済みnodeを選択すると、stableなInstanceとnode pathのidentityを確認し、Scenario targetとして利用し、元Definitionへ移動できます。解決済みnodeのBase fieldは直接編集できません。

inline subtreeからDefinitionを抽出したり、通常のInstanceをinline componentへ戻したりできます。どちらもUndo 1回分のatomic操作で、関係するScenario、Event、API targetをrewriteして振る舞いを維持します。画面InstanceまたはネストしたDefinition参照が残るDefinitionの削除は拒否され、定義画面に影響件数を表示します。Definitionのネストは循環しないgraphに限定され、展開数にも上限があります。

## コレクション

**Collection**は、制限付きのcanonical preview sliceから1つのComponent Definitionを繰り返します。項目Definition、preview object、stableなitem key用JSON Pointerを指定します。response items pathはAPI response body基準、item key、公開プロパティbinding、Variant rule、visibility ruleは各item基準です。値の欠損と明示的な`null`は区別されます。

各preview itemは、Definition Base、最終Variant 1つ、itemからbindした公開プロパティの順で完成したDefinitionへ解決されます。Variantは最初に一致したexact scalar case、rule fallback、item template Variantの順で1つだけ選ばれます。visibilityもexact scalar ruleで、一致時とfallbackの表示結果を明示します。Canvasはscreen-owned child componentを追加せずに解決済みitemを反復し、TreeはcanonicalなCollection境界を維持します。Event/API targetはCollection IDとstableなDefinition-local node pathを使います。

preview exampleはCanvasで使う選択済みsliceであり、API response contractの二重正準ではありません。上限は20 object、32 KiB、nest 8階層です。item keyは一意なstringまたはnumberでなければなりません。Collectionが参照中のDefinitionは削除できません。参照中のAPI operationを削除すると、preview sliceを保ったままCollectionのdata sourceが明示的に切断されます。
