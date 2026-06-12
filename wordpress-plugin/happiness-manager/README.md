# Happiness Manager WordPress Plugin

WordPressの管理画面で、目標、4観点、64分解、日誌、AI相談を使えるプラグインです。

## できること

- WordPressログインユーザーごとにHappiness Managerの状態を保存
- 日誌をWordPressの非公開投稿 `Happiness Journal` として同期
- 4観点に箇条書きの「・」を追加
- 64分解の編集ビューとオープンウィンドウ64の一枚ビュー
- OpenAI APIを使った目標づくり相談
- JSONの書き出し、読み込み

## インストール

1. `wordpress-plugin/happiness-manager` フォルダをZIP化します。
2. WordPress管理画面の「プラグイン」からZIPをアップロードします。
3. プラグインを有効化します。
4. 管理画面左メニューの「Happiness Manager」を開きます。

固定ページや投稿で使う場合は、ログインユーザー向けに次のショートコードを置けます。

```text
[happiness_manager]
```

## AI設定

管理画面の「Happiness Manager」内にある「AI設定」で、OpenAI APIキーとモデル名を設定します。

初期モデルは `gpt-5-mini` です。必要に応じて管理画面から変更できます。

APIキーはWordPress側に保存され、ブラウザ側のJavaScriptには送られません。

## 保存について

メインの状態データはWordPressのユーザーメタに保存されます。日誌データは、バックアップ性を高めるために非公開の `Happiness Journal` 投稿としても同期されます。

さらに安心したい場合は、アプリ内のJSON書き出しも定期的に使ってください。
