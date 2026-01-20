# 実装計画書 03: アーキテクチャ / 技術方針

## 要求に対する設計方針
- 破壊的操作は「確認 → 実行 → 監査」の安全フローを必須化
- LLM の出力は必ず構造化し、Tool 実行前に検証する
- 権限判定は最終決定とし、LLM の指示だけでは実行しない
- 監査ログは DB に最小限記録し、Discord ログチャンネルは任意（設定時のみ）
- Thread 内の会話はメンション不要とし、Message Content Intent を前提に設計する
- 複雑タスクは「観測（read-only）→計画→実行→再計画」のループで解く（単発実行に依存しない）
- できる限り Bot が自分で Discord の現状を観測し、ユーザーに ID 提示を要求しない
- ユーザー向け出力（質問/確認/結果）はギルド設定の言語に統一する（英/日）

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
- 補足: 実装は案A のままでも、内部の会話処理は案D（状態機械/ノード）に寄せていくと “エージェンティック” な改善が進めやすい

## コンポーネント構成
- Discord Bot (discord.js)
- LLM Adapter（プロバイダー別クライアント）
- Tool Layer（許可済み Discord 操作）
- Agent Orchestrator（観測→計画→実行→再計画ループ、ステップ上限）
- Conversation Manager（Thread 文脈、要約、状態）
- Settings Manager（ギルド単位設定）
- Audit Logger（DB + 任意 Discord ログチャンネル）
- Storage（Postgres）
- Encryption Service（API キー暗号化）

## エージェント実行モデル（推奨）
- 入力: Thread 内のユーザーメッセージ + Thread 状態（要約/設定/最近のツール結果）
- ループ（上限 N ステップ）
  1) 観測: まず read-only ツールで現状把握（例: チャンネル一覧/ロール一覧/メンバー検索）
  2) 計画: 実行したい actions[]（複数可）と不足情報（質問）を生成（構造化出力）
  3) 承認: destructive（または危険）なら human approval（Accept/Reject）を要求（依頼者のみ承認可、内容は要約して提示）
  4) 実行: 許可済み actions を順次実行（バルク/レート制限/バックオフ）
  5) 検証: 結果を観測し、必要なら再計画（失敗/部分成功も含む）
- 出力: 結果サマリ + 次の提案（追加作業がある場合のみ）

## Tool 設計（許可リスト）
- Tool は「観測（read-only）」「変更（write）」「破壊的（destructive）」に分類する
- destructive は必ず承認必須（LLM の自己申告 + ルールベースの両方で判定）
- 例（最低限のカバレッジ）
  - 観測: list_channels / list_roles / find_members / get_member_details / get_channel_details
  - 変更: create_* / update_* / assign_role / remove_role
  - 破壊的: delete_* / ban_member / kick_member / timeout_member / untimeout_member（など）

## データ設計 / API
- guild_settings
  - guild_id (PK), provider, model, confirmation_mode
  - log_channel_id, manager_role_id, thread_policy
  - thread_archive_minutes, rate_limit_per_min
  - created_at, updated_at
- provider_credentials
  - id (PK), guild_id (FK), provider
  - encrypted_api_key, scope, created_at, updated_at
- provider_model_cache
  - provider (PK), models_json, fetched_at, expires_at
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
- 監査ログは最小限の情報で保存し、必要に応じて Discord ログチャンネルへも送信する
- 破壊的判定は「AI の意図判定 + ルールベース（禁止操作/承認必須操作）」の両方で決定
- untrusted input（ユーザー文・ツール出力・外部サイト要約）を system/developer 指示に混ぜない（プロンプト注入耐性）
- 可能な限り structured outputs を使い、データフロー（対象/操作/理由/影響）を明示してから実行する
### 案D: エージェント実行を状態機械（ノード）で表現
- 概要: “観測→計画→確認→実行→検証” を状態遷移として明示し、ノード単位で監査/テスト可能にする
- 長所: 多段階タスクの制御が明確、human approval を組み込みやすい、評価しやすい
- 短所: 実装が増える（MVP には過剰になり得る）
