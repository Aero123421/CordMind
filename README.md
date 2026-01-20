# CordMind (Discord AI Manager)

A Discord administration bot that lets you manage servers via natural language. Mention the bot to create a dedicated Thread, then continue the conversation without further mentions. Destructive operations always require confirmation (Accept / Reject) and show impact details.

JP: 自然言語でDiscordサーバーを管理できるBotです。@メンションで専用Threadを作成し、以降はメンション不要で会話できます。破壊的操作は必ず二段階確認（Accept / Reject）と影響範囲表示を行います。

---

## Table of Contents
- Overview
- Features
- Requirements
- Quick Start (Docker)
- Configuration (.env)
- Usage
- Slash Commands
- LLM Providers
- Rate Limits
- Audit Logs
- Troubleshooting
- Development

---

## Overview
**English**
- Mention the bot to open a dedicated Thread
- Continue inside the Thread without further mentions (requires Message Content Intent)
- Destructive actions require confirmation and impact preview

**日本語**
- Botにメンションすると専用Threadを作成
- Thread内はメンション不要（Message Content Intent必須）
- 破壊的操作は確認＋影響範囲の提示

---

## Features
**English**
- Dedicated Thread per request
- Confirmation UI for destructive operations
- Impact preview (channels / roles / members / permissions)
- Provider switching (Gemini / xAI / Groq / Cerebras / Z.AI)
- Encrypted API key storage (AES-256-GCM)
- Short-term audit logs with optional log channel

**日本語**
- 1依頼=1Thread
- 破壊的操作の二段階確認
- 影響範囲表示（チャンネル/ロール/メンバー/権限）
- プロバイダー切替（Gemini / xAI / Groq / Cerebras / Z.AI）
- APIキーの暗号化保存（AES-256-GCM）
- 短期監査ログ + 任意ログチャンネル

---

## Requirements
**English**
- Node.js 20+ (LTS)
- Docker (recommended)
- Discord Application (Bot)
- Postgres 16

**日本語**
- Node.js 20+ (LTS)
- Docker 推奨
- Discord Bot アプリ
- Postgres 16

---

## Quick Start (Docker)
**English**
1) Create `.env`
2) Run a single command to start DB + Bot

```bash
docker compose up --build
```

**日本語**
1) `.env` を作成
2) DB と Bot を一括起動

```bash
docker compose up --build
```

---

## Configuration (.env)
**English**
Minimal required values:
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

**日本語**
最低限必要な環境変数:
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

---

## Usage
**English**
1) Mention the bot in a server channel
2) A dedicated Thread is created
3) Continue conversation inside the Thread without mentions
4) Destructive actions require Accept / Reject

**日本語**
1) サーバー内でBotにメンション
2) 専用Threadが作成
3) Thread内でメンション不要で会話
4) 破壊的操作はAccept / Rejectで確認

---

## Slash Commands
**English**
- `setup` : Show setup steps
- `provider` : Set LLM provider
- `api` : Set/reset/clear API key
- `model` : Set model
- `role` : Set manager role (optional)
- `log` : Set audit log channel (optional)
- `thread` : Set thread archive minutes
- `rate` : Set rate limit per minute
- `show` : Show current settings

**日本語**
- `setup` : セットアップ手順表示
- `provider` : LLMプロバイダー設定
- `api` : APIキー設定/再設定/削除
- `model` : モデル設定
- `role` : 管理ロール設定（任意）
- `log` : 監査ログチャンネル設定（任意）
- `thread` : Threadアーカイブ時間
- `rate` : 1分あたりの操作数上限
- `show` : 現在設定を表示

---

## LLM Providers
**English**
- Gemini
- xAI
- Groq
- Cerebras
- Z.AI

**日本語**
- Gemini
- xAI
- Groq
- Cerebras
- Z.AI

---

## Rate Limits
**English**
- General operations: `rate_limit_per_min` (default 10)
- Destructive operations: 2 per minute (fixed)

**日本語**
- 通常操作: `rate_limit_per_min`（デフォルト10）
- 破壊的操作: 1分あたり2回（固定）

---

## Audit Logs
**English**
- Destructive actions are recorded
- Logs are retained short-term (default 7 days)
- Optional Discord log channel

**日本語**
- 破壊的操作は必ず記録
- 監査ログは短期保管（デフォルト7日）
- Discordログチャンネルは任意

---

## Troubleshooting
**English**
- Thread messages are empty → Enable Message Content Intent in Discord Developer Portal
- API key missing → Use `/discordaimanage api`
- Model not set → Use `/discordaimanage model`

**日本語**
- Thread内メッセージが空 → Message Content Intent を有効化
- APIキー未設定 → `/discordaimanage api`
- モデル未設定 → `/discordaimanage model`

---

## Development
**English**
- Plans: `docs/plan/`
- Build: `npm run build`
- DB sync: `npm run db:push`

**日本語**
- 計画書: `docs/plan/`
- ビルド: `npm run build`
- DB同期: `npm run db:push`

---

If you want more sections (architecture diagram, screenshots, etc.), tell me and I will add them.
