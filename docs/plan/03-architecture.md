# 実装計画書 03: アーキテクチャ / 技術方針

## 要求に対する設計方針
- 破壊的操作は「確認 → 実行 → 監査」の安全フローを必須化
- LLM の出力は必ず構造化し、Tool 実行前に検証する
- 権限判定は最終決定とし、LLM の指示だけでは実行しない
- 監査ログは DB と Discord ログチャンネルに二重記録する
- Thread 内の会話はメンション不要とし、Message Content Intent を前提に設計する

## アーキテクチャ案
### 案A: 単一プロセス Bot（推奨）
- 概要: discord.js Bot 内に Adapter / Tool / Settings / Audit を統合
- 長所: 実装が単純、デプロイが容易、MVP に最適
- 短所: LLM 呼び出し負荷が集中、障害が全体に影響

### 案B: LLM サービス分離
- 概要: Bot と LLM 呼び出しを分離し、内部 API で連携
- 長所: 障害分離、LLM 側の拡張が容易
- 短所: 通信・運用が増える、MVP には過剰

### 案C: キュー駆動（非同期実行）
- 概要: Bot は要求をキューに積み、Worker が実行
- 長所: レート制限や再試行に強い
- 短所: 実装コスト増、UX（即時応答）が複雑化

## 採用案と理由
- 採用案: 案A
- 根拠: MVP では実装速度と運用容易性を優先する
- トレードオフ: LLM/Discord API の負荷が集中するため、将来は案B/C を検討

## コンポーネント構成
- Discord Bot (discord.js)
- LLM Adapter（プロバイダー別クライアント）
- Tool Layer（許可済み Discord 操作）
- Conversation Manager（Thread 文脈、要約、状態）
- Settings Manager（ギルド単位設定）
- Audit Logger（DB + 任意 Discord ログチャンネル）
- Storage（Postgres）
- Encryption Service（API キー暗号化）

## データ設計 / API
- guild_settings
  - guild_id (PK), provider, model, confirmation_mode
  - log_channel_id, manager_role_id, thread_policy
  - thread_archive_minutes, rate_limit_per_min
  - created_at, updated_at
- provider_credentials
  - id (PK), guild_id (FK), provider
  - encrypted_api_key, scope, created_at, updated_at
- thread_state
  - thread_id (PK), guild_id, owner_user_id
  - summary, last_messages_hash, created_at, updated_at
- audit_events
  - id (PK), action, actor_user_id, guild_id, target_id
  - payload_json (JSONB), confirmation_required, confirmation_status
  - status, error_message, created_at

## LLM 出力制御（プロバイダー別）
- Gemini: response_mime_type/response_json_schema による JSON Schema 強制
- xAI: Structured Outputs（モデル条件により JSON Schema 準拠保証）
- Groq: response_format=json_schema + strict で厳格化
- Cerebras: response_format=json_schema/json_object
- Z.AI: response_format=json_object のみ（Schema 強制は不可）
- 仕様の根拠は docs/plan/02-research.md を参照

## 実行環境 / インフラ
- Docker Compose（bot + Postgres）
- Secrets: Discord Bot Token, 暗号化キー, LLM API キー
- ログは stdout（JSON）→ ホスト側でローテーション

## セキュリティ設計
- API キーは DB に暗号化保存（AES-256-GCM）
- Tool Allowlist + Schema Validation による実行制御
- 破壊的操作は二段階確認（UI で承認）
- 監査ログは改ざん検知可能なフォーマットで保存
- 破壊的判定は「AI の意図判定 + ルールベース（禁止操作）」の両方で決定
