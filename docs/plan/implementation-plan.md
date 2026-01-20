# DiscordAI Bot 実装計画書（v0.1）

作成日: 2026-01-20  
対象: Discord サーバー管理を自然言語で行う Discord Bot

---

## 1. 目的
要件定義に基づき、Discord サーバー管理操作を LLM 経由で安全に実行できる Bot を実装する。  
MVP では「@メンション → Thread 継続会話 → 破壊的操作の確認 → 実行 → 監査ログ」の一連体験を確実に成立させる。

---

## 2. スコープ（本計画の対象）
- In Scope
  - Discord 管理操作（チャンネル/カテゴリ/ロール/権限/メンバー管理補助）
  - @メンション起点 + Thread 継続会話
  - /discordaimanage による設定 UI
  - LLM プロバイダー切替、API キー管理
  - Docker 自己ホスティング + 永続化 + 監査ログ
- Out of Scope
  - 一般ユーザー向け雑談
  - SaaS 化
  - 課金機能
  - 画像/音声

---

## 3. 前提・制約
- Node.js 20 LTS + discord.js v14 + TypeScript
- 自宅 Ubuntu + Docker / docker-compose
- 永続ストレージ: Postgres 16（MVP/本番は統一）
- スラッシュコマンドは小文字のみ（/discordaimanage）
- Message Content Intent が必要になる場合あり
- プロバイダーは指定の 5 つに限定

---

## 4. 全体アーキテクチャ

### 4.1 構成要素
- Discord Bot (discord.js)
- LLM Adapter（プロバイダー別クライアント）
- Tool Layer（Discord 操作許可済み関数群）
- Conversation Manager（Thread 文脈/要約/状態）
- Settings Manager（ギルド単位設定）
- Audit Logger（DB + 任意 Discord ログチャンネル）
- Storage（Postgres）

### 4.2 主要フロー
1. @メンション受信
2. 権限チェック（Admin or 指定ロール）
3. Thread 作成/誘導
4. LLM で意図解析 → Tool 呼び出し計画
5. 破壊的操作は確認ボタンで二段階実行
6. 実行結果を Thread に報告
7. 監査ログ記録

---

## 5. データ設計（MVP）

### 5.1 テーブル（案）
- guild_settings
  - guild_id (PK)
  - provider
  - model
  - confirmation_mode (confirm/instant)
  - log_channel_id
  - manager_role_id
  - thread_policy
  - thread_archive_minutes
  - rate_limit_per_min
  - created_at, updated_at

- provider_credentials
  - id (PK)
  - guild_id (FK)
  - provider
  - encrypted_api_key
  - scope (guild/global)
  - created_at, updated_at

- thread_state
  - thread_id (PK)
  - guild_id
  - owner_user_id
  - summary
  - last_messages_hash
  - created_at, updated_at

- audit_events
  - id (PK)
  - action
  - actor_user_id
  - guild_id
  - target_id
  - payload_json (JSONB)
  - confirmation_required (bool)
  - confirmation_status (pending/approved/rejected)
  - status (success/failure)
  - error_message
  - created_at

### 5.2 制約・インデックス（決定）
- guild_settings.guild_id: UNIQUE
- provider_credentials: (guild_id, provider) UNIQUE
- thread_state.thread_id: UNIQUE
- audit_events: (guild_id, created_at) INDEX

---

## 6. LLM 統合方針

### 6.1 アダプタ構造
- ProviderAdapter Interface
  - generateCompletion(messages, options)
  - supportsStructuredOutput
  - healthCheck()

### 6.2 対応プロバイダー
- Google (Gemini)
- xAI (Grok)
- Cerebras
- Z.AI (GLM)
- Groq

### 6.3 モデル管理
- ギルド単位で default model
- Thread 単位で一時上書き
- /discordaimanage で選択可能

### 6.4 Structured Output
- 対応プロバイダーは JSON schema で strict validation を必須化
  - 対象: Google(Gemini) / xAI(Grok) / Groq
  - Z.AI / Cerebras は対応可否を判定し、未対応なら厳格 JSON 生成 + 再試行
- 失敗時はツール実行せず再計画

### 6.5 初期モデル定義（デフォルト）
- Google(Gemini): `gemini-3-flash-preview`
- xAI(Grok): `grok-4-1-fast`
- Groq: `openai/gpt-oss-120b`
- Cerebras: `gpt-oss-120b`
- Z.AI(GLM): `glm-4.7`

---

## 7. Discord 操作用ツール（Allowlist）

### 7.1 Read 系
- listChannels, getChannelDetails
- listRoles, getRoleDetails
- getGuildPermissions, getBotPermissions

### 7.2 Write 系
- createChannel, deleteChannel, renameChannel
- createRole, deleteRole, assignRole, removeRole
- updatePermissionOverwrites
- createThread, pinMessage

### 7.3 安全設計
- 破壊的操作は二段階実行
- 実行前に影響範囲を明示
- Audit Logger へ必ず記録

---

## 8. 会話インターフェース設計

### 8.1 @メンション
- 権限者のみ応答
- Thread を新規作成（1依頼=1Thread）
- Thread 名: `discord-ai | <user> | <topic> | <date>`

### 8.2 Thread 継続
- Thread ごとに文脈保持
- 発言ごとに権限チェック
- 自動アーカイブ時間のデフォルト: 72 時間（4320 分）

### 8.3 応答テンプレート
- 理解内容（要約）
- 実行計画（必要なら）
- 追加確認（曖昧時）
- 実行前確認（破壊的操作）
- 実行ログ/結果

---

## 9. /discordaimanage 設定 UI
- 実行権限: Admin または指定ロール
- 設定項目
  - LLM プロバイダー選択
  - モデル選択
  - API キー登録/更新/削除
  - 破壊的操作確認 ON/OFF
  - ログチャンネル設定
  - Thread 運用設定
  - レート制限
- UX
  - ephemeral 応答
  - select menu / modal
  - API 接続テスト

### 9.1 デフォルト設定値（初期）
- confirmation_mode: confirm（破壊的操作は必ず確認）
- thread_policy: auto-create（1依頼=1Thread）
- thread_archive_minutes: 4320
- rate_limit_per_min: 10（ギルド単位）
- destructive_limit_per_min: 2（破壊的操作の追加上限、コード定数）

### 9.2 設定 UI の動作（決定）
- 設定変更は即時反映
- API キー登録/更新/削除は操作ログを監査ログに残す（キー内容は記録しない）
- 接続テストは「モデルに短文を投げて 1 回だけ確認」を標準

---

## 10. セキュリティ & 運用
- API キーは平文ログに出さない
- DB への保存は暗号化（アプリ側暗号化 + OS レベル暗号化）
- Prompt injection 対策
  - 権限判定が最終決定
  - Tool allowlist
  - Schema validation
- 監査ログ必須
- レート制限（連続削除抑止など）

### 10.1 API キー暗号化方式（決定）
- 方式: AES-256-GCM（アプリ側暗号化）
- キー供給: `DISCORDAI_ENCRYPTION_KEY` を env または Docker secret で注入（32 bytes base64）
- 保存形式: `enc_v1:<base64(iv|ciphertext|tag)>` の単一文字列
- OS レベル暗号化: ホスト側で LUKS/dm-crypt などにより Docker volume を暗号化

### 10.2 監査ログフォーマット（決定）
- audit_events.payload_json の基本形
  - request: { tool, params, raw_text }
  - impact: { channels, roles, members, permissions }
  - result: { ok, message, discord_ids }
- Discord ログ送信は埋め込み 1 件で統一
  - title: `AUDIT | <action>`
  - fields: actor, target, confirmation, status, error (if any)

---

## 11. エラーハンドリング
- Discord 権限不足 → 必要権限を提示
- API エラー/レート制限 → 再試行案内
- 不正 tool call → 実行拒否し再計画

---

## 12. デプロイ計画（Docker）
- docker-compose
  - bot: node:20-bookworm-slim
  - db: postgres:16-alpine
- Secrets
  - Discord Bot Token は env / Docker secrets
  - LLM API Key は DB に暗号化保存
- Volume
  - DB volume
  - logs volume

### 12.1 コンテナ運用（決定）
- bot 側で簡易 HTTP ヘルスチェック `GET /health` を提供（port 3001）
- ログは JSON 形式（pino）で stdout に出力し、ホスト側でローテーション

---

## 13. 実装フェーズ

### Phase 0: 基盤準備
- リポジトリ構成整理
- Docker / compose 雛形
- DB 接続レイヤ

### Phase 1: Discord 基本機能
- Bot 起動 + ギルド参加イベント
- 管理ロール自動作成
- 権限チェック（Admin/ロール）
- @メンション受信
- Thread 作成

### Phase 2: LLM 統合
- ProviderAdapter 実装（5社）
- モデル/プロバイダー設定
- Structured Output / Validation

### Phase 3: Tool Layer
- Read ツール実装
- Write ツール実装
- 破壊的操作の二段階確認

### Phase 4: /discordaimanage UI
- 設定 UI
- API キー登録/削除
- 接続テスト

### Phase 5: 監査ログ・運用
- audit_events 追加
- Discord ログチャンネル送信
- レート制限

### Phase 6: MVP 受入テスト
- 受入基準のシナリオテスト
- 失敗ケース検証

---

## 14. 受入基準（MVP）対応表
- ギルド参加時に管理ロール自動作成
- Admin/指定ロールのみ @メンション対応
- Thread 作成 + 継続会話
- 「チャンネル削除」→確認→削除→監査ログ
- /discordaimanage でプロバイダー/モデル/API キー設定
- 5プロバイダーでテキスト応答

---

## 15. 決定事項（固定）
- 永続ストレージ: Postgres
- 暗号化方式: AES-256-GCM + `DISCORDAI_ENCRYPTION_KEY`
- Thread 自動アーカイブ: 72 時間（4320 分）
- レート制限初期値: 10 ops/分（破壊的 2/分）
- Structured Output: Gemini / Grok / Groq は必須、Z.AI/Cerebras は対応可否で切替

---

## 16. 実装開始時の固定タスク（決定）
- DB マイグレーション: Prisma Migrate を採用
- 暗号化キー生成: `openssl rand -base64 32` を標準手順とする
- 監査ログ実装: `audit_events` へ必ず記録 + ログチャンネル送信をデフォルト ON

