# WordPress Plugin

`happiness-manager/` がWordPress用プラグイン本体です。

開発中の初版なので、まずはテスト用WordPressで動作確認してから本番サイトへ入れてください。

プラグインを有効化すると、サイト側に `Happiness Manager` 固定ページが自動作成されます。スマホではそのページを開くだけで、WordPress管理画面に入らず日誌を直接保存できます。

手動でページを作る場合は、次のショートコードを置きます。

```text
[happiness_manager view="journal" mobile="1"]
```

ブラウザ内の一時WordPressで試す場合は、WordPress Playgroundを使えます。

https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/UmbrellaParade/happiness-manager/main/playground/blueprint-v0.1.2.json
