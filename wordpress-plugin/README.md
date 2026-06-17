# WordPress Plugin

`happiness-manager/` がWordPress用プラグイン本体です。

開発中の初版なので、まずはテスト用WordPressで動作確認してから本番サイトへ入れてください。

手動アップロードで入れる場合は、GitHub Releasesの `happiness-manager-wordpress-plugin.zip` を使ってください。ZIP内の先頭フォルダが `happiness-manager/` になるようにしています。

プラグインを有効化すると、サイト側に `Happiness Manager` 固定ページが自動作成されます。スマホではそのページを開くだけで、WordPress管理画面に入らず日誌を直接保存できます。

固定ページを削除した場合、プラグインは自動で復活させません。必要になった時だけ、管理画面の「スマホ用ページを作成」から再作成できます。

目標、4観点、日誌などの長文入力欄は、入力した分だけ縦に伸びます。欄の中だけでスクロールせず、ページ全体を縦スクロールして内容を確認できます。

手動でページを作る場合は、次のショートコードを置きます。

```text
[happiness_manager view="journal" mobile="1"]
```

ブラウザ内の一時WordPressで試す場合は、WordPress Playgroundを使えます。

https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/UmbrellaParade/happiness-manager/main/playground/blueprint-v0.1.45.json
