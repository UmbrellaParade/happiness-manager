# Happiness Manager

家族で使うための、目的・目標・行動・日誌の実践ノートです。

## できること

- メンバーごとの目標管理
- 目的、達成基準、期限、理由、最初の一手の整理
- 私・無形、私・有形、社会・他者・無形、社会・他者・有形の4観点整理
- 4観点の欄に箇条書きの「・」行を追加
- 長く書いた入力欄をページ全体の縦スクロールで確認
- 長期目標、直近の目標、次の目標を日付つきで逆算整理
- 目標を8テーマ、各8行動に分解する編集ビューと、オープンウィンドウ64形式の一枚ビュー
- 長期、直近、次の目標ごとに64分解を保存
- 64分解の各項目にサブ項目メモと下位64を追加
- 達成した目標や64分解を過去目標として保存
- 64分解から選んだ行動のルーティンチェック
- 気分、体力、負荷、集中の簡易チェック
- 日誌と振り返り
- AI相談で使う保存情報を、項目ごとに追加・編集・削除
- WordPressメディアURLなどの画像URLを保存情報として記録
- JSONでのバックアップと復元

## データの保存

入力内容は、利用している端末のブラウザに保存されます。GitHubや外部サーバーへ自動送信されません。

複数端末で同じ内容を使いたい場合は、アプリ内の「書き出し」でJSONを保存し、別端末で「読み込み」を使ってください。

## 公開

GitHub Pagesで静的サイトとして公開する想定です。

## WordPress版

WordPressに日誌や目標を保存したい場合は、`wordpress-plugin/happiness-manager` にプラグイン版があります。

WordPress版では、日誌をWordPressの非公開投稿としても同期し、OpenAI APIを使ったAI目標コーチも利用できます。

ブラウザだけで試す場合は、WordPress Playgroundのデモを使えます。

[WordPress Playgroundで試す](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/UmbrellaParade/happiness-manager/main/playground/blueprint-v0.1.18.json)
