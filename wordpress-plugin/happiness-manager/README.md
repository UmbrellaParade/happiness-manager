# Happiness Manager WordPress Plugin

WordPressの管理画面で、目標、4観点、64分解、日誌、AI相談を使えるプラグインです。

## できること

- WordPressログインユーザーごとにHappiness Managerの状態を保存
- サイト側の固定ページからスマホで日誌を直接入力
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

プラグインを有効化すると、サイト側に `Happiness Manager` 固定ページが自動作成されます。

スマホでそのページを開くと、WordPress管理画面に入らずに日誌を直接書いて保存できます。ログアウト中はログインボタンが表示され、ログイン後に同じページへ戻ります。

作成された固定ページを削除した場合、プラグインは勝手に復活させません。もう一度必要になったら、管理画面の「スマホ用ページを作成」ボタンから作成できます。

自分で固定ページや投稿に置く場合は、ログインユーザー向けに次のショートコードを使えます。

```text
[happiness_manager view="journal" mobile="1"]
```

`view` は `goals`、`board`、`journal`、`coach`、`backup` を指定できます。未指定の場合は日誌から開きます。

## AI設定

管理画面の「Happiness Manager」内にある「AI設定」で、OpenAI APIキーとモデル名を設定します。

初期モデルは `gpt-5-mini` です。必要に応じて管理画面から変更できます。

APIキーはWordPress側に保存され、ブラウザ側のJavaScriptには送られません。

## 保存について

メインの状態データはWordPressのユーザーメタに保存されます。日誌データは、バックアップ性を高めるために非公開の `Happiness Journal` 投稿としても同期されます。

さらに安心したい場合は、アプリ内のJSON書き出しも定期的に使ってください。

## 更新について

このプラグインはGitHub Releasesの `happiness-manager-wordpress-plugin.zip` を更新元として確認します。

新しいReleaseが公開されると、WordPress管理画面のプラグイン更新に表示されます。以後はプラグインを削除して入れ直さず、通常のWordPress更新操作で入れ替えられます。
