# Screen Blueprint Studio ユーザーガイド

[English](./USER_GUIDE.md) · [製品概要](../README.ja.md) · [ポータブル仕様](./PORTABLE_SPEC.ja.md) · [ロードマップ](./ROADMAP.ja.md)

## 作業画面を理解する

エディタには4つの主な操作領域があります。

- **Palette**には意味を持つcomponentと、利用可能な共通コンポーネントが表示されます。
- **Tree**には、独立したModal rootとCollection境界を含むcanonicalな画面階層が表示されます。
- **Canvas**には、現在のScreenとScenarioが編集可能なwireframeとして表示されます。
- **Inspector**では、選択したScreen component、共通コンポーネント内の要素、state、Event、APIの仕様を編集します。

Screen一覧では、Screenの追加、名前変更、選択、削除を行います。表示tabを使うと、Screen editor、navigation Flow、**共通コンポーネント**を切り替えられます。Canvas上部のstate controlでは、loading、empty、saving、success、errorなどの名前付きScenarioを作成・選択できます。

Paletteの項目をTreeまたはCanvasへdragします。既存のroot以外のcomponentは、並べ替えたり、対応するContainer、Page、Modal間で移動したりできます。無効なparent、descendant、sizing contextは黙って補正せず、理由を示して拒否されます。

人が確定したproject編集にはUndoとRedoを利用できます。Text fieldは入力中の内容をlocal draftとして保持し、用途に応じてEnterまたはfocus移動で1つの操作として確定します。Escapeで未確定のtext draftを取り消せます。

## 意味のあるComponentで画面を作る

現行releaseはPage、Container、Text、Text Input、Select、Button、Image、Link、Collection、Modalに対応します。PageはScreen rootです。ModalはScreenが所有する独立frameです。Container、Page、Modalではvertical、horizontal、grid layoutを選べます。

構造componentのdescriptionは、TreeとCanvasでgroupを識別するeditor metadataです。画面に表示する見出しや文章はText componentへ記録します。ButtonとLinkでは、表示labelをbehaviorやdestinationとは分けて管理します。

### ImageとLink

装飾ではなく画面仕様の一部となる画像には**Image**を使います。Componentのdescriptionで画像の用途を示し、内容を表すalt text、制約付きfit、aspect ratio、placeholder styleを設定します。通常のInspectorでは、ワイヤーフレーム作成者にruntime画像URLの手入力を求めません。既存のimport documentや解決済みのCollection／Definition dataがportableな相対URLまたはHTTP(S) sourceを持つ場合はpreviewに使い、それ以外はlow-fidelityな画像placeholderをCanvasへ表示します。読込失敗時も同じplaceholderへ切り替わります。

**Link**は、アプリ内Screen、外部HTTP(S) URL、論理resourceへのnavigationを表します。アプリ内Screenは同じcontext、外部URLは同じcontextまたは新しいcontextで開けます。Resource linkはdownloadを要求できますが、browserやserverが無視する場合があります。Resource IDはopaqueな識別子であり、project-level asset catalogへの参照ではありません。

危険なURL scheme、scheme-relative URL、制御文字、backslashでhostとして解釈され得る形式は拒否します。新しいcontextで開くLinkには`noopener noreferrer`を付与します。CanvasではLinkのfocusを維持し、wireframe編集中の実navigationだけを抑止します。

## Placementとsizingを設定する

すべてのcomponentは制約付きのplacement modeを持ちます。

- **Flow**は親layoutに参加します。
- **Overlay**はlayout flowから外れ、immediate logical parent内の9点anchorを使います。
- **Sticky edge**はlayout flowから外れ、所属するPageまたはModal frameの上端／下端に留まります。CSSのdocument-stickyではありません。
- **Frame viewport**は所属frameの9点anchorを使い、scrollするframe contentとは分離して留まります。

Insetは`none`、`xs`、`sm`、`md`、`lg` tokenで指定し、aligned edgeから必ず内側へ離します。raw pixel、負のoffset、仕様上のz-indexは扱いません。見た目の重なり順はplacement layerとcanonical sibling orderで決まります。Tree order、selection、behavior target、copy/paste、drag and dropはstableなcanonical identityを使い続けます。

Root以外のcomponentではinline sizingも指定できます。**Auto**は親layoutの既定動作、**Fit content**は利用可能な幅を上限に内容の固有幅、**Fill**はinline方向の利用可能幅を使います。最小幅と最大幅には`xs`から`xl`までの順序付きtokenを使い、最小幅を最大幅より大きくすることはできません。

Gridは1〜12本の明示的な等幅trackを持ち、各flow childは親のtrack数までspanできます。狭いframeでもtrackは自動で折り畳まれず、横overflowを維持します。Horizontal-flow childでは0〜3のgrow ratioとshrinkの許可／防止を指定できます。正のgrow ratioにはFillとAllow shrinkが必要です。Verticalまたはflow外のcontextではgrowとshrinkをneutralに保ちます。Root sizingは固定です。

## Shared Componentを再利用する

同じ意味を持つsubtreeを複数Screenで同期したい場合は、**共通コンポーネント**を使います。共通コンポーネントはstableなlocal要素、base design、typedな公開項目、任意の表示パターンを持ちます。Screen上の各利用箇所は、選択した表示パターン、明示した公開項目の値、外側のplacementとsizingを持ちます。共通コンポーネントを編集すると、すべての利用箇所へ即時反映されます。

**共通コンポーネント**表示では、再利用するデザインを独立したvisual previewで確認できます。previewまたは構造一覧で要素を選択し、右Inspectorで名前・説明・複製、基本項目、layout/placement/sizing、公開項目、表示パターンの上書きを編集します。Base/表示パターンとBase値/利用例の切替はpreview表示だけを変更します。利用箇所の値は次の順で解決されます。

1. 共通コンポーネントのBase
2. 選択された最終表示パターン
3. 利用箇所で明示した公開項目の値
4. active Scenario override

表示パターンが変更できるのは対応fieldだけで、要素のidentityやtopologyは変えません。

Paletteには利用可能な共通コンポーネントが表示されます。利用箇所の境界を選択すると、表示パターン、公開項目、placement、sizingを編集できます。内部の解決済み要素を選択すると、stableな利用箇所と要素pathのtargetを確認し、behaviorまたはScenario overrideを設定し、元の共通コンポーネントを開けます。解決済み要素のbase fieldは直接編集できません。

Inline subtreeから共通コンポーネントを作成したり、通常の利用箇所をinline componentへ戻したりできます。どちらもUndo 1回分のatomic操作で、関係するScenario、Event、API targetをrewriteします。Screenまたはnest内に利用箇所がある共通コンポーネントは削除できず、Inspectorに影響が示されます。共通コンポーネントのnestは循環せず、展開上限を守る必要があります。nest先が所有する要素は、その元の共通コンポーネントを開くまでread-onlyです。

## Collectionで一覧を記述する

**Collection**は、制限付きのpreview sliceから1つの共通コンポーネントを繰り返します。項目の共通コンポーネント、preview object、stableなitem key用JSON Pointerを設定します。Response items pathはAPI response body基準です。Item key、公開項目のbinding、表示パターンrule、visibility rule、behavior item valueは各item基準です。値の欠損と明示的な`null`は区別されます。

各preview itemは、共通コンポーネントのBase、最終表示パターン1つ、itemからbindした公開項目の順で完成します。表示パターンは最初に一致したexact scalar case、rule fallback、item-templateの表示パターンの順で選ばれます。Visibilityもexact scalar ruleで、一致時とfallbackの結果を明示します。

CanvasはScreen-owned componentのcopyを追加せずに解決済みitemを繰り返します。TreeにはcanonicalなCollection境界を1つだけ表示します。どのpreview itemでも内部要素をclickすると、Collection IDとstableな共通コンポーネント内pathで識別される共通template targetを選択します。Inspectorには全itemへ適用されることが表示され、EventとAPI behaviorを確認できます。Preview item順序やruntime DOM IDはtargetとして保存しません。

Preview dataの上限は20 object、32 KiB、nest 8階層です。Item keyは一意なstringまたはnumberへ解決される必要があります。Collectionが利用中の共通コンポーネントは削除できません。参照中のAPI operationを削除すると、preview sliceを保ったままCollection data sourceを明示的に切断します。

## Event、navigation、APIを接続する

対応するcomponentまたはresolved targetを選択し、Inspectorの**動作**を開きます。Eventはclickまたはsubmit triggerと、順序付きactionを持ちます。ActionはScenarioの設定／解除、API operationの呼び出し、別Screenへのnavigationを行います。

Navigationには名前付きroute／query parameterを設定できます。各parameterはliteral scalarを使えます。TriggerがCollection item nodeの場合は、RFC 6901 JSON Pointerで現在のitemも参照できます。

API operationはmethod、path、request binding、任意のsuccess／error Scenarioを記録します。Request bindingは、`path.taskId`や`body.title`のような既存target pathへ次の値を接続します。

- 同じScreen上のText InputまたはSelect target
- literal JSON scalar
- JSON Pointerで参照した現在のCollection item

Item valueは、Event targetによって1つのCollection contextが決まる場合だけ有効です。Pointerの欠損、scalarが必要な箇所でのobject、type mismatch、複数Collection contextの混在は、default値へ置き換えずvalidation errorとして表示します。

Text Inputでは、required、最小／最大長、pattern、email形式、記述式custom requirementの順序付きvalidation ruleも設定できます。

## WebMCPでAIと作業する

人は視覚的なworkspaceを使い、AI agentは名前と型を持つ11個のWebMCP toolを使います。どちらも同じlive Screen、selection、resolved component、state、Event、APIを読み取ります。

AIのwriteはchange setを開始します。Operationはeffective previewとChanges panelへ表示され、確定projectはまだ変わりません。Review中はdocumentを変更するcontrol、drag and drop、Undo、Redoがlockされますが、selection、inspection、Canvasのpan／zoom、Flowは利用できます。Proposalを反映すると確定history 1件になり、破棄するとprojectは変更されません。

WebMCPには対応する実験版Chromeが必要です。`document.modelContext`がないbrowserではtool registrationをskipし、人向けeditorはすべて利用できます。設定とtool一覧は[開発ガイド](./DEVELOPMENT.ja.md)を参照してください。

## 保存と現在の制約

Workspaceはbrowserの`localStorage`へcacheされます。確定document、revision、active context、作業中のchange setを含みます。不正な保存dataは黙って初期化せず、recovery画面を開きます。Storage writeに失敗した場合は状態を表示し、JSON recovery downloadを利用できます。

現行製品には通常のJSON／YAML import／export UIがありません。Recovery downloadは一般的なproject-file workflowではありません。Fileによる共有、より幅広いcustom specification、編集を伴わないreview modeは[ロードマップ](./ROADMAP.ja.md)で予定しています。
