# Discord AI Manager

Discord サーバー管理を自然言語で実行するための Bot です。@メンションで専用 Thread を作成し、以降は Thread 内でメンション不要で会話できます。破壊的操作は必ず二段階確認（Accept / Reject）を挟みます。

## 特徴
- @メンション → 専用 Thread 自動作成
- Thread 内はメンション不要（Message Content Intent 必須）
- 破壊的操作は二段階確認 + 影響範囲表示
- 禁止操作: サーバー削除 / Bot 自身の BAN・KICK・TIMEOUT
- 監査ログは短期保管（デフォルト 7 日）
- LLM プロバイダー切替（Gemini / xAI / Groq / Cerebras / Z.AI）
- /discordaimanage で設定 UI

## 必要条件
- Node.js 20+ (LTS)
- Docker (任意: DB をコンテナで立ち上げる場合)
- Discord Bot アプリ
- Postgres 16

## セットアップ

### 1) リポジトリ準備
```bash
npm install
```

### 2) 環境変数
`.env.example` をコピーして `.env` を作成し、以下を設定してください。

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID= # 開発時のみ任意
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/discordai?schema=public
DISCORDAI_ENCRYPTION_KEY=
```

`DISCORDAI_ENCRYPTION_KEY` は 32 bytes の base64 です。
```bash
openssl rand -base64 32
```

### 3) Discord 開発者ポータル設定
- **Message Content Intent** を有効化
- Bot に必要な権限を付与（チャンネル/ロール/権限編集など）

### 4) DB 準備
```bash
npm run db:push
```

### 5) 起動
```bash
npm run dev
```

## Docker で起動
```bash
docker compose up --build
```

## 使い方

### 1) Bot を @メンション
メンションすると専用 Thread が作成されます。

### 2) Thread 内で操作
Thread 内はメンション不要で会話できます。

### 3) 破壊的操作
Accept / Reject ボタンで二段階確認が必要です。操作内容と影響範囲が表示されます。

## /discordaimanage コマンド
- `setup` : セットアップ手順の表示
- `provider` : プロバイダー変更
- `api` : API キー設定（再設定可）
- `model` : モデル変更
- `role` : 管理ロール設定（任意）
- `log` : 監査ログチャンネル設定（任意）
- `thread` : Thread アーカイブ時間設定
- `rate` : 1分あたりの操作数上限
- `show` : 設定内容を表示

設定フローは「プロバイダー選択 → API 入力 → モデル選択」です。

## LLM プロバイダー
- Gemini
- xAI
- Groq
- Cerebras
- Z.AI

API キーは DB に AES-256-GCM で暗号化保存します。

## レート制限
- 通常操作: ギルド単位 `rate_limit_per_min`（デフォルト 10）
- 破壊的操作: 1分あたり 2 回

## 監査ログ
- 破壊的操作は必ずログに記録
- 監査ログはデフォルト 7 日で削除
- `AUDIT_RETENTION_DAYS` で保持日数を変更可能

## よくある質問

### Thread 内メンション不要は可能？
可能です。**Message Content Intent** を有効化してください。

### API キー設定済みなのに再設定したい
`/discordaimanage api` から再設定できます。

## 開発メモ
- 実装計画書は `docs/plan/` にあります。
- 仕様変更があれば plan を更新してください。
