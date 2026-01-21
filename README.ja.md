<div align="center">

# 🧠 CordMind
### Discord AI Manager

**自然言語で Discord サーバーを安全に管理・運用する AI アシスタント**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-43853d?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Status](https://img.shields.io/badge/Status-Alpha-ff7a59?style=for-the-badge)](https://github.com/)

[English](README.md) | **日本語**

</div>

---

## 📖 概要
**CordMind** は、Discord サーバーの管理業務（チャンネル作成、権限設定、ロール管理など）をチャット形式で依頼できる Bot です。
「`#general` を `#lobby` に変えて」「モデレーター用のチャンネルを作って」といった自然言語の指示を、安全な Discord API 操作に変換します。

---

## 🚀 セットアップガイド

上から順に進めるだけで完了するように構成しています。あっちこっち見る必要はありません。

### Step 1: Discord Developer Portal での準備
まず、Bot のアカウントを作成し、必要な情報を取得します。

1. **[Discord Developer Portal](https://discord.com/developers/applications)** にアクセスし、`New Application` を作成します。
2. **Bot の作成**:
   - 左メニューの `Bot` をクリックし、`Add Bot` を押します。
   - **Token** をコピーして控えておきます（後で `.env` に使います）。
3. **特権インテントの有効化** (重要):
   - 同じ `Bot` ページの下部にある `Privileged Gateway Intents` セクションを探します。
   - 以下の3つを **ON** にします（これがないと動きません）:
     - ✅ **Presence Intent**
     - ✅ **Server Members Intent**
     - ✅ **Message Content Intent**
   - `Save Changes` を押します。
4. **招待URLの発行**:
   - 左メニューの `OAuth2` > `URL Generator` をクリックします。
   - **Scopes**: `bot`, `applications.commands` にチェック。
   - **Bot Permissions**: `Administrator` (管理者) にチェックを入れるのが一番手っ取り早いです。
     - ※ 細かく設定したい場合は `Manage Channels`, `Manage Roles`, `Manage Threads`, `Send Messages`, `View Channels` 等を選択。
   - 生成された URL をブラウザで開き、自分のサーバーに Bot を招待します。
5. **Client ID の取得**:
   - 左メニューの `OAuth2` (General) にある **Client ID** をコピーして控えておきます。

### Step 2: プロジェクトの環境設定
ローカル環境でファイルを設定します。

1. **リポジトリの準備**:
   ```bash
   git clone <repository-url>
   cd discordAIManager
   ```
2. **環境変数の作成**:
   `.env.example` をコピーして `.env` を作成します。
   ```bash
   cp .env.example .env
   ```
3. **.env の編集**:
   Step 1 で控えた情報を入力します。
   ```env
   # Step 1-2 で取得した Token
   DISCORD_TOKEN=your_bot_token_here
   
   # Step 1-5 で取得した Client ID
   DISCORD_CLIENT_ID=123456789012345678

   # 暗号化キー (後述のコマンドで生成して貼り付け)
   DISCORDAI_ENCRYPTION_KEY=
   
   # データベース設定 (Docker を使うならそのままでOK)
   DATABASE_URL=postgresql://postgres:postgres@db:5432/discordai?schema=public
   ```
4. **暗号化キーの生成と設定**:
   APIキーを安全に保存するためのキーを生成し、`.env` の `DISCORDAI_ENCRYPTION_KEY` に貼り付けます。
   ```bash
   # Linux / Mac / WSL
   openssl rand -base64 32
   
   # Windows (PowerShell)
   [Convert]::ToBase64String((1..32|%{[byte](Get-Random -Max 256)}))
   ```

### Step 3: 起動 (Docker)
全ての設定が終わったら起動します。

```bash
docker compose up --build
```
正常に起動すると `Logged in as CordMind#xxxx!` と表示されます。

### Step 4: 動作確認
Discord サーバーに戻って確認します。

1. 任意のチャンネルで Bot にメンションを送ります。
   > `@CordMind こんにちは！`
2. Bot がスレッドを作成し、返信が来れば成功です 🎉

---

## 🎮 使い方

1.  **指示**: Bot にメンションして指示を送ります。
    > `@CordMind モデレーター専用のチャンネルを作って`
2.  **スレッドで会話**: Bot が専用スレッドを作成します。以後はメンション不要です。
3.  **計画と承認**: 破壊的変更のときは `Accept` / `Reject` が表示されます。
    - `Accept` を押せるのは依頼者のみです。
4.  **設定変更**: 対話型メニューで設定します。
    - `/discordaimanage setup`: 初回ガイド付きセットアップ（言語→プロバイダー→APIキー→モデル）
    - `/discordaimanage setting`: いつでも再設定可能（対話型メニュー）
    - 設定メニューから `ガイド付きセットアップ` も選べます

---

## 🤖 LLMプロバイダーとモデル

- APIキーは**プロバイダーごと**に保存されます。
- モデル一覧は各プロバイダーAPIから取得し、24時間キャッシュされます。
- APIキー未設定の場合はフォールバックのモデル一覧を使います。
- プロバイダーを切り替えるとモデルは未設定になります（再選択が必要）。

---

## 🛠️ トラブルシューティング

*   **スレッドで返信が来ない**:
    *   Developer Portal で `Message Content Intent` が ON になっているか再確認してください。
*   **Botの権限不足と表示される**:
    *   Botロールに必要な権限（Manage Channels / Roles / Threads など）を付与してください。
*   **起動しない**:
    *   `.env` の `DISCORDAI_ENCRYPTION_KEY` が32バイトのBase64文字列になっているか確認してください。
*   **DBエラー**:
    *   `docker compose down -v` でボリュームを消してから再度立ち上げてみてください。

---

<div align="center">
Created with ❤️ for Discord Admins
</div>
