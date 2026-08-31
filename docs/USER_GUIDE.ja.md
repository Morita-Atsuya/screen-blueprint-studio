# Screen Blueprint Studio ユーザーガイド

[English](./USER_GUIDE.md)

## 意味的な画像とリンク

装飾ではなく画面仕様の一部となる画像には **Image** を使います。portableな相対URLまたはHTTP(S)の絶対URL、内容を表す代替テキストを設定し、制約付きの表示方法、縦横比、プレースホルダーtokenを選択します。source未設定とnetwork読込失敗は、明示的なwireframe placeholderとして区別して表示されます。

**Link** は、アプリ内画面、外部HTTP(S) URL、論理リソースへの遷移を表します。表示ラベルとリンク先は独立して指定します。アプリ内画面は同じcontext、外部URLは同じcontextまたは新しいcontext、リソースはそれらに加えてdownloadを要求できます。ただし、browserや配信serverがdownload要求を無視する場合があります。resource IDはopaqueな論理識別子であり、project内のresource catalogへの参照ではありません。

危険なURL scheme、scheme-relative URL、制御文字、backslashで外部hostとして解釈され得る形式は拒否します。新しいcontextで開くLinkには`noopener noreferrer`を付与します。Canvasではanchorのfocusと意味論を維持し、wireframe編集中の実navigationだけを抑止します。
