# Repo Map（2026-01-21）

## エントリポイント
- src/index.ts
  - Discord client 初期化、イベントハンドリング、Thread 作成、/discordaimanage などの interaction ルーティング。

## エージェント実行ループ
- src/conversation/handler.ts
  - Thread 内メッセージ処理、LLM ループ、観測/実行/確認/監査ログ。
- src/conversation/schema.ts
  - system prompt と AgentStep の JSON スキーマ。
- src/conversation/plan.ts
  - LLM 出力のパース/バリデーション。
- src/conversation/threadState.ts
  - Thread の要約メモリ。

## LLM アダプタ
- src/llm/providerFactory.ts
- src/llm/openaiCompat.ts
- src/llm/gemini.ts
- src/llm/modelCatalog.ts

## Tool Layer
- src/tools/discordTools.ts
  - チャンネル/ロール/メンバー/スレッド/権限操作。
- src/tools/toolRegistry.ts
  - tool 登録、危険度、必要権限。

## 設定・UI
- src/interactions/commands.ts
- src/interactions/handlers.ts
- src/settings.ts

## 監査/ログ/レート制限
- src/audit.ts / src/auditLog.ts
- src/logger.ts
- src/rateLimit.ts

## 永続化
- prisma/schema.prisma
  - GuildSettings / ProviderCredentials / ProviderModelCache / ThreadState / AuditEvent

## 実行/配布
- package.json, tsconfig.json
- Dockerfile, docker-compose.yml
