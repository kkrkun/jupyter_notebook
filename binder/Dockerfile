# 1. Jupyter環境が含まれたベースイメージを指定
#    (例: jupyter/base-notebook)
FROM jupyter/base-notebook:latest

# 2. ユーザーをrootに切り替えてパッケージをインストール
USER root

# 3. パッケージリストを更新し、sshpassをインストール
#    - apt-get update: パッケージリストを最新にする
#    - apt-get install -y sshpass: sshpassをインストール (-yで確認を自動化)
#    - 後片付け: 不要なファイルを削除し、イメージサイズを小さく保つ
RUN apt-get update && \
    apt-get install -y sshpass && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# 4. セキュリティのため、元の非rootユーザーに戻す
#    (jupyter/*-notebookイメージのデフォルトユーザーはjovyan)
USER $NB_UID
