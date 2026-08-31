# Screen Blueprint Studio ユーザーガイド

[English](./USER_GUIDE.md)

## 意味的な画像とリンク

装飾ではなく画面仕様の一部となる画像には **Image** を使います。portableな相対URLまたはHTTP(S)の絶対URL、内容を表す代替テキストを設定し、制約付きの表示方法、縦横比、プレースホルダーtokenを選択します。source未設定とnetwork読込失敗は、明示的なwireframe placeholderとして区別して表示されます。

**Link** は、アプリ内画面、外部HTTP(S) URL、論理リソースへの遷移を表します。表示ラベルとリンク先は独立して指定します。アプリ内画面は同じcontext、外部URLは同じcontextまたは新しいcontext、リソースはそれらに加えてdownloadを要求できます。ただし、browserや配信serverがdownload要求を無視する場合があります。resource IDはopaqueな論理識別子であり、project内のresource catalogへの参照ではありません。

危険なURL scheme、scheme-relative URL、制御文字、backslashで外部hostとして解釈され得る形式は拒否します。新しいcontextで開くLinkには`noopener noreferrer`を付与します。Canvasではanchorのfocusと意味論を維持し、wireframe編集中の実navigationだけを抑止します。

## Componentの配置

すべてのComponentはportableな配置modeを持ちます。**Flow** は親layoutに参加します。**Overlay** はlayout領域を占有せず、immediate logical parent内の9点anchorを使います。**フレーム端固定（Sticky edge）** はCSSのdocument stickyではありません。layout領域を占有せず、所属するPageまたはModal frameの上端／下端に留まります。**フレームviewport** は同じowning frame内の9点anchorを使い、frameのscroll contentとは分離して留まります。

Insetは`none`、`xs`、`sm`、`md`、`lg` tokenで指定し、aligned edgeから必ず内側へ離します。raw pixel、負のoffset、仕様上のz-indexは扱いません。中央axisのinsetは`none`固定です。見た目の重なり順はplacement layerとcanonical sibling orderで決まりますが、Tree階層、selection、behavior target、copy/paste、drag-and-dropはcanonical component identityとparent/index順を維持します。
