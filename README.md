<div align="center">

# CordMind

**Discord AI Manager** — Manage your Discord server with natural language.

![node](https://img.shields.io/badge/node-%3E%3D20-43853d?style=flat-square)
![docker](https://img.shields.io/badge/docker-ready-2496ed?style=flat-square)
![status](https://img.shields.io/badge/status-alpha-ff7a59?style=flat-square)

[English](#en) | [日本語](#jp)

</div>

---

<a id="en"></a>

# English

## At a Glance
- Mention the bot to create a **dedicated Thread**
- Continue **without further mentions** (Message Content Intent required)
- Destructive actions require **Accept / Reject** with **impact preview**
- Supports **Gemini / xAI / Groq / Cerebras / Z.AI**

## What is CordMind?
CordMind is a **self-hosted Discord administration assistant**. It turns natural-language requests into safe, allowlisted Discord operations, with strict permission checks and audit logging. It is designed for **small-scale servers (≈ up to 5 guilds)** where safety and clarity matter more than raw throughput.

**Typical use cases**
- Create / rename / delete channels or roles
- Update permission overwrites for a role or user
- Assign / remove roles
- Inspect server or bot permissions

**What it is not**
- A general chat bot or entertainment bot
- A SaaS product (this project is self-hosted)

## Features
| Category | Details |
| --- | --- |
| Conversation | One request = one Thread; no further mentions needed |
| Safety | Confirmation UI + impact preview (channels/roles/members/permissions) |
| Governance | Admin / Manager role only |
| Providers | Gemini, xAI, Groq, Cerebras, Z.AI |
| Storage | Encrypted API keys (AES-256-GCM) + short-term audit logs |

## Architecture (Detailed)
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

## Quick Start (Docker)
1) Create `.env` (see below)
2) Run one command (DB + Bot + schema)

```bash
docker compose up --build
```

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

## Rate Limits
- General operations: `rate_limit_per_min` (default 10)
- Destructive operations: **2 / minute** (fixed)

## Audit Logs
- Destructive actions are recorded
- Short-term retention (default 7 days)
- Optional Discord log channel

## Troubleshooting
- Thread messages are empty → enable **Message Content Intent** in Developer Portal
- API key missing → `/discordaimanage api`
- Model not set → `/discordaimanage model`

## Development
- Plans: `docs/plan/`
- Build: `npm run build`
- DB sync: `npm run db:push`

---

<a id="jp"></a>

# 日本語

## 概要
- Bot を @メンションすると **専用Thread** を作成
- Thread 内は **メンション不要**（Message Content Intent 必須）
- 破壊的操作は **Accept / Reject** の確認 + **影響範囲表示**
- **Gemini / xAI / Groq / Cerebras / Z.AI** 対応

## CordMind とは
CordMind は **自己ホスト型のDiscord管理アシスタント** です。自然言語の指示を安全なDiscord操作に変換し、厳格な権限チェックと監査ログによって安全性を担保します。**小規模運用（目安: 最大5ギルド）** を前提としています。

**主な用途**
- チャンネル / ロールの作成・名称変更・削除
- ロールやユーザーの権限上書き更新
- ロール付与 / 削除
- 権限（ユーザー/ボット）の確認

**対象外**
- 雑談や娯楽向けのチャットBot
- SaaS型のクラウドサービス

## 特徴
| 分類 | 内容 |
| --- | --- |
| 会話 | 1依頼=1Thread / Thread内はメンション不要 |
| 安全 | 確認UI + 影響範囲表示（チャンネル/ロール/メンバー/権限） |
| 権限 | 管理者 or 管理ロールのみ操作可能 |
| プロバイダー | Gemini / xAI / Groq / Cerebras / Z.AI |
| 保存 | APIキー暗号化（AES-256-GCM）+ 短期監査ログ |

## アーキテクチャ（詳細）
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

## クイックスタート（Docker）
1) `.env` を作成（下記参照）
2) 1コマンドで DB + Bot を起動

```bash
docker compose up --build
```

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

## レート制限
- 通常操作: `rate_limit_per_min`（デフォルト10）
- 破壊的操作: **1分あたり2回**（固定）

## 監査ログ
- 破壊的操作は必ず記録
- 短期保管（デフォルト7日）
- Discordログチャンネルは任意

## トラブルシュート
- Thread内メッセージが空 → **Message Content Intent** を有効化
- APIキー未設定 → `/discordaimanage api`
- モデル未設定 → `/discordaimanage model`

## 開発
- 計画書: `docs/plan/`
- ビルド: `npm run build`
- DB同期: `npm run db:push`

---

[Back to English](#en)
