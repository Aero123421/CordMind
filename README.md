<div align="center">

# CordMind

**Discord AI Manager** — Manage your Discord server with natural language.

![node](https://img.shields.io/badge/node-%3E%3D20-43853d?style=flat-square)
![docker](https://img.shields.io/badge/docker-ready-2496ed?style=flat-square)
![status](https://img.shields.io/badge/status-alpha-ff7a59?style=flat-square)

[English ↓](#english) | [日本語 ↓](#japanese)

</div>

---

<a id="english"></a>

# English

## Quick Summary
- Mention the bot to create a **dedicated Thread**
- Continue **without further mentions** (Message Content Intent required)
- Destructive actions require **Accept / Reject** with **impact preview**
- Supports **Gemini / xAI / Groq / Cerebras / Z.AI**

## What is CordMind?
CordMind is a **self-hosted Discord administration assistant**. It turns natural-language requests into safe, allowlisted Discord operations, with strict permission checks and audit logging. It is designed for **small-scale servers (≈ up to 5 guilds)** where safety and clarity matter more than raw throughput.

## Table of Contents
- Quick Start (Docker)
- Discord Developer Portal Settings
- Configuration (.env)
- Usage
- Slash Commands
- Use Cases (Examples)
- Permissions / Required Discord Scopes
- Security Model
- Architecture
- Troubleshooting
- Development

---

## Quick Start (Docker)
1) Create `.env` (see below)
2) Run one command (DB + Bot + schema)

```bash
docker compose up --build
```

## Discord Developer Portal Settings
1) **Bot → Privileged Gateway Intents**
   - Enable **Message Content Intent** (required for Thread messages without mentions)
   - Enable **Server Members Intent** (role checks)
2) **Bot → Permissions**
   - Grant permissions listed in “Permissions / Required Discord Scopes”
3) **OAuth2 → URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: same as below
   - Use the generated URL to invite the bot

## Configuration (.env)
**Required**
```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DATABASE_URL=postgresql://postgres:postgres@db:5432/discordai?schema=public
DISCORDAI_ENCRYPTION_KEY=...   # base64(32 bytes)
```
Generate encryption key:
```bash
openssl rand -base64 32
```

**Optional**
```
DISCORD_GUILD_ID=...        # dev-only slash commands
DEFAULT_PROVIDER=gemini
DEFAULT_MODEL=...
AUDIT_RETENTION_DAYS=7
DB_WAIT_RETRIES=30
```

## Usage
1) Mention the bot in a server channel
2) A dedicated Thread is created
3) Continue inside the Thread without mentions
4) Destructive actions require Accept / Reject

## Slash Commands
| Command | Description |
| --- | --- |
| `/discordaimanage setup` | Setup guidance |
| `/discordaimanage provider` | Set provider |
| `/discordaimanage api` | Set/reset/clear API key |
| `/discordaimanage model` | Set model |
| `/discordaimanage role` | Set manager role (optional) |
| `/discordaimanage log` | Set audit log channel (optional) |
| `/discordaimanage thread` | Thread archive minutes |
| `/discordaimanage rate` | Ops per minute |
| `/discordaimanage show` | Show current settings |

## Use Cases (Examples)
- “Create a private channel for the mods and give it only Moderator role access.”
- “Rename #general to #lobby.”
- “List all roles and show details for the ‘Moderator’ role.”
- “Remove the Temp role from user 123.”
- “Update permissions so @Newcomer can read #rules only.”

## Permissions / Required Discord Scopes
**Application scopes**
- `bot`
- `applications.commands`

**Required Gateway Intents**
- `Guilds`
- `GuildMessages`
- `MessageContent` (required for Thread messages without mentions)
- `GuildMembers` (role checks)

**Bot permissions (recommended)**
- Manage Channels
- Manage Roles
- Manage Threads
- Read Message History
- Send Messages
- View Channels
- Manage Messages (for pinning)

## Security Model
- **Principle of least privilege**: Only allowlisted tools can execute
- **Explicit confirmation**: destructive actions require Accept / Reject
- **Impact preview**: shows affected channels/roles/members/permissions before execution
- **Role-based authorization**: Admin or configured manager role only
- **API key protection**: AES-256-GCM encrypted at rest
- **Audit logging**: destructive actions are recorded (short-term retention)

## Architecture
```
                       +-----------------------------+
                       |        Discord Server       |
                       |  User -> @mention -> Thread |
                       +--------------+--------------+
                                      |
                                      v
                        +---------------------------+
                        |   CordMind (discord.js)   |
                        +-----+-----------+---------+
                              |           |
                +-------------+           +--------------------+
                |                                         |
       +--------v--------+                       +--------v--------+
       | Conversation    |                       | Slash Commands  |
       | Manager         |                       | /discordaimanage|
       +--------+--------+                       +--------+--------+
                |                                         |
       +--------v--------+                       +--------v--------+
       | LLM Adapter     |                       | Settings / DB   |
       | (Gemini/xAI/...)|                       | + Encryption    |
       +--------+--------+                       +--------+--------+
                |                                         |
       +--------v--------+                       +--------v--------+
       | Tool Layer      |                       | Audit Log        |
       | (Allowlist)     |                       | DB + Log Channel |
       +--------+--------+                       +------------------+
                |
                v
        Discord API (channels/roles/permissions)
```

## Troubleshooting
- Thread messages are empty → enable **Message Content Intent** in Developer Portal
- API key missing → `/discordaimanage api`
- Model not set → `/discordaimanage model`

## Development
- Plans: `docs/plan/`
- Build: `npm run build`
- DB sync: `npm run db:push`

---

<a id="japanese"></a>

# 日本語

## 概要
- Bot を @メンションすると **専用Thread** を作成
- Thread 内は **メンション不要**（Message Content Intent 必須）
- 破壊的操作は **Accept / Reject** の確認 + **影響範囲表示**
- **Gemini / xAI / Groq / Cerebras / Z.AI** 対応

## CordMind とは
CordMind は **自己ホスト型のDiscord管理アシスタント** です。自然言語の指示を安全なDiscord操作に変換し、厳格な権限チェックと監査ログによって安全性を担保します。**小規模運用（目安: 最大5ギルド）** を前提としています。

## 目次
- クイックスタート（Docker）
- Discord 開発者ポータル設定
- 設定 (.env)
- 使い方
- スラッシュコマンド
- Use Cases（具体例）
- 必要権限 / Discord Scopes
- セキュリティモデル
- アーキテクチャ
- トラブルシュート
- 開発

---

## クイックスタート（Docker）
1) `.env` を作成（下記参照）
2) 1コマンドで DB + Bot を起動

```bash
docker compose up --build
```

## Discord 開発者ポータル設定
1) **Bot → Privileged Gateway Intents**
   - **Message Content Intent** を有効化（Thread内メンション不要のため必須）
   - **Server Members Intent** を有効化（ロールチェック用）
2) **Bot → Permissions**
   - 下記「必要権限」に記載の権限を付与
3) **OAuth2 → URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: 下記と同じ
   - 生成されたURLでBotを招待

## 設定 (.env)
**必須**
```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DATABASE_URL=postgresql://postgres:postgres@db:5432/discordai?schema=public
DISCORDAI_ENCRYPTION_KEY=...   # base64(32 bytes)
```
暗号化キー生成:
```bash
openssl rand -base64 32
```

**任意**
```
DISCORD_GUILD_ID=...        # 開発用スラッシュコマンド
DEFAULT_PROVIDER=gemini
DEFAULT_MODEL=...
AUDIT_RETENTION_DAYS=7
DB_WAIT_RETRIES=30
```

## 使い方
1) サーバー内でBotにメンション
2) 専用Threadが作成される
3) Thread内でメンション不要で会話
4) 破壊的操作は Accept / Reject で確認

## スラッシュコマンド
| コマンド | 説明 |
| --- | --- |
| `/discordaimanage setup` | セットアップ案内 |
| `/discordaimanage provider` | プロバイダー設定 |
| `/discordaimanage api` | APIキー設定/再設定/削除 |
| `/discordaimanage model` | モデル設定 |
| `/discordaimanage role` | 管理ロール設定（任意） |
| `/discordaimanage log` | 監査ログチャンネル設定（任意） |
| `/discordaimanage thread` | Threadアーカイブ時間 |
| `/discordaimanage rate` | 1分あたりの操作数 |
| `/discordaimanage show` | 設定内容を表示 |

## Use Cases（具体例）
- 「モデレーター専用の非公開チャンネルを作成して権限を付与して」
- 「#general を #lobby にリネームして」
- 「ロール一覧を表示して “Moderator” の詳細を教えて」
- 「ユーザー123から Temp ロールを外して」
- 「@Newcomer が #rules だけ読めるように権限を更新して」

## 必要権限 / Discord Scopes
**Application scopes**
- `bot`
- `applications.commands`

**必要な Gateway Intents**
- `Guilds`
- `GuildMessages`
- `MessageContent`（Thread内メンション不要のため必須）
- `GuildMembers`（ロールチェック用）

**推奨 Bot 権限**
- チャンネル管理
- ロール管理
- スレッド管理
- メッセージ履歴の閲覧
- メッセージ送信
- チャンネル閲覧
- メッセージの管理（ピン留め用）

## セキュリティモデル
- **最小権限**: Allowlist 以外の操作は実行不可
- **明示的な確認**: 破壊的操作は Accept / Reject 必須
- **影響範囲の提示**: 実行前に対象を表示
- **権限制御**: 管理者 or 管理ロールのみ操作可能
- **APIキー保護**: AES-256-GCM で暗号化保存
- **監査ログ**: 破壊的操作を記録（短期保管）

## アーキテクチャ
```
                       +-----------------------------+
                       |        Discord Server       |
                       |  User -> @mention -> Thread |
                       +--------------+--------------+
                                      |
                                      v
                        +---------------------------+
                        |   CordMind (discord.js)   |
                        +-----+-----------+---------+
                              |           |
                +-------------+           +--------------------+
                |                                         |
       +--------v--------+                       +--------v--------+
       | Conversation    |                       | Slash Commands  |
       | Manager         |                       | /discordaimanage|
       +--------+--------+                       +--------+--------+
                |                                         |
       +--------v--------+                       +--------v--------+
       | LLM Adapter     |                       | Settings / DB   |
       | (Gemini/xAI/...)|                       | + Encryption    |
       +--------+--------+                       +--------+--------+
                |                                         |
       +--------v--------+                       +--------v--------+
       | Tool Layer      |                       | Audit Log        |
       | (Allowlist)     |                       | DB + Log Channel |
       +--------+--------+                       +------------------+
                |
                v
        Discord API (channels/roles/permissions)
```

## トラブルシュート
- Thread内メッセージが空 → **Message Content Intent** を有効化
- APIキー未設定 → `/discordaimanage api`
- モデル未設定 → `/discordaimanage model`

## 開発
- 計画書: `docs/plan/`
- ビルド: `npm run build`
- DB同期: `npm run db:push`

---

[Back to English](#english)
