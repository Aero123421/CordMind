# 実装計画書 00: 目次と概要

## 目的 / 成功条件（要約）
- Discord サーバー管理を自然言語で安全に実行できる Bot を実装する
- MVP で「@メンション → Thread 継続会話 → 破壊的操作の確認 → 実行 → 監査ログ」の体験が成立する
- 破壊的操作は必ず二段階確認し、すべて監査ログに記録される

## 依頼原文（要約）
- 既存の DiscordAI Bot 実装計画（docs/plan/implementation-plan.md）を改善し、AI 実装可能な計画書に再整理

## 記号ルール
- 【FACT】調査で裏取り済みの事実
- 【HYPOTHESIS】仮説（要検証）
- 【UNRESOLVED】未確定事項 / 要質問

## 読了順序
1. 01-requirements.md
2. 02-research.md
3. 03-architecture.md
4. 04-implementation.md
5. 05-risks.md
6. 06-qa.md
7. 07-ops.md
8. 08-decisions.md
9. 09-glossary.md

## 重要な決定事項（要約）
- Node.js（最新 LTS）+ TypeScript + discord.js v14 を採用する
- 永続化は Postgres 16、Docker Compose で自己ホスティング
- 破壊的操作は二段階確認（Thread 内 Accept / ダメ）+ 影響範囲の提示
- 破壊的操作は原則許可だが「サーバー削除」「Bot 自身の BAN/Kick/Timeout」は禁止
- LLM は 5 プロバイダー（Gemini / Grok / Groq / Cerebras / Z.AI）をアダプタで切替
- Structured Output は可能な限り JSON Schema で強制し、未対応は JSON モード + バリデーションで補完
- 設定フローは「プロバイダー選択 → API 入力 → モデル選択」、API 設定済みなら入力省略（再設定可）
- 運用対象ギルドは最大 5
- 監査ログは最小限・短期保管、Discord ログチャンネルは任意
- Thread 内の会話はメンション不要（Message Content Intent を有効化）

## 主要マイルストーン（要約）
- M0: 基盤準備（Docker / DB / ログ基盤）
- M1: Discord 基本機能（@メンション + Thread）
- M2: LLM アダプタ + Structured Output
- M3: Tool Layer + 破壊的操作の確認フロー
- M4: /discordaimanage 設定 UI
- M5: 監査ログ / レート制限 / 運用項目
- M6: MVP 受入テスト

## 追調査が必要な項目
- 5 プロバイダーのモデル ID / 料金 / レート制限の最終確定
- 破壊的判定の最終ルール（AI 判断 + ルール併用の細部）

## 参照
- docs/plan/02-research.md
- 旧版: docs/plan/implementation-plan.md（参考・廃止予定）
