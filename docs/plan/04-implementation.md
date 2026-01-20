# 実装計画書 04: 実装計画

## フェーズ分割
- Phase 0: 基盤準備
- Phase 1: Discord 基本機能
- Phase 2: 設定管理 / UI
- Phase 3: LLM 統合
- Phase 4: Tool Layer
- Phase 5: 監査ログ / レート制限
- Phase 6: MVP 受入テスト

## 主要タスク（AI実装向け粒度）
- Phase 0
  - リポジトリ構成作成（src/, prisma/, configs/ など）
  - Docker Compose 雛形（bot + Postgres）
  - Prisma スキーマ作成（guild_settings / provider_credentials / thread_state / audit_events）
  - ENV 読み込み（dotenv / Docker secrets）
- Phase 1
  - Discord Bot 起動、ログイン、イベント登録
  - Message Content Intent を有効化（開発者ポータル + intents 設定）
  - @メンション検知 → Thread 作成（命名規則）
  - 権限チェック（Admin / manager_role_id）
  - Thread での会話継続フロー（メンション不要のメッセージ収集）
- Phase 2
  - /discordaimanage コマンド登録
  - 設定 UI（select menu / modal / button）
  - 設定コマンドと導線の情報設計（ユーザーが迷わない構成）
  - 設定フロー「プロバイダー選択 → API 入力 → モデル選択」の実装
  - API 設定済み時は入力画面を省略（再設定導線は別途用意）
  - プロバイダー / モデル選択の保存
  - API キー登録/更新/削除（監査ログ併記）
- Phase 3
  - ProviderAdapter Interface 実装
  - Gemini / xAI / Groq / Cerebras / Z.AI のクライアント実装
  - Structured Output の共通バリデーション（JSON Schema）
  - JSON 逸脱時の再試行・エラー応答
- Phase 4
  - Tool Allowlist 設計（Read/Write/Destructive）
  - 各 Tool の Discord API 実装
  - 破壊的操作の確認 UI（Thread 内に Accept / ダメ ボタン）
  - 影響範囲の要約表示（channels/roles/permissions）
  - 破壊的判定ルール（AI 判定 + 禁止操作ルール）の実装
- Phase 5
  - audit_events への必須記録
  - Discord ログチャンネル送信（埋め込み）
  - レート制限（ギルド単位、破壊的操作の上限）
  - 例外処理（権限不足/レート制限/LLM 失敗）
- Phase 6
  - 受入テストシナリオ作成
  - 破壊的操作の確認フロー検証
  - Provider 切替テスト

## 依存関係
- DB スキーマ → 設定 UI / 監査ログの前提
- ProviderAdapter → Tool 呼び出し計画の前提
- 権限チェック → すべての操作の前提

## マイルストーン
- M0: Docker + DB + Prisma 完了
- M1: @メンション → Thread 生成まで完了
- M2: ProviderAdapter と JSON 検証完了
- M3: 破壊的操作の確認フロー完了
- M4: /discordaimanage 主要設定完了
- M5: 監査ログ + レート制限完了
- M6: 受入テスト完了

## クリティカルパス
- 権限チェック → Thread 会話 → LLM 構造化出力 → Tool 実行 → 監査ログ

## 作業順序（直近1〜3ステップ）
- 1) 未確定事項（Message Content Intent / 破壊的操作範囲）の確定
- 2) Prisma スキーマの確定とマイグレーション作成
- 3) Discord Bot の最小起動 + @メンション → Thread 生成

## 受け入れ基準（DoD）
- 管理者のみ @メンションに応答
- Thread 生成と継続会話が成立
- 「チャンネル削除」操作で確認 → 実行 → 監査ログが通る
- 「Bot 自身の BAN/Kick/Timeout」「サーバー削除」は実行できない
- /discordaimanage でプロバイダー/モデル/API キー設定ができる
- 5 プロバイダーでテキスト応答が取得できる
