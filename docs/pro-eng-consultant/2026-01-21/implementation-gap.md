# 実装ギャップ分析（2026-01-21）

## 全体所見
- “観測→計画→実行→再計画” は **観測/実行ループのみ** 実装されており、計画/再計画の構造化が不足。
- 主要ツールはあるが、観測系の不足と「ID を要求しない」UXが未達。

## ギャップ一覧
| 要件 | 現状 | 根拠 | 影響/備考 |
|---|---|---|---|
| 観測→計画→実行→再計画の多段階 | **部分実装**（observe/act/ask/finish） | src/conversation/schema.ts, src/conversation/handler.ts | plan/verify がなく “自律計画” の手応えが弱い。
| 構造化出力（clarifications/actions/reason/expected_impact） | **未実装** | src/conversation/schema.ts | 影響説明や理由が自動生成されず、説明品質が不安定。
| 観測優先（ID を聞かない） | **部分実装** | src/conversation/handler.ts（inferObservationFallback） | rename/move 等の一部のみ。多くの操作で観測が入らない。
| 曖昧対象の選択 UI（候補提示→選択） | **未実装** | src/conversation/handler.ts, src/interactions/handlers.ts | ユーザーが ID/メンション入力を求められる。
| 「ID を要求しない」UX | **未達** | src/tools/discordTools.ts（resolveMemberFromParams 等） | 複数候補時に “user_id/mention を提示” となる。
| 権限の観測（チャンネル/ロール単位の上書き確認） | **不足** | src/tools/toolRegistry.ts | 権限変更前の状態確認ができない。
| ロール更新/リネームなどの汎用操作 | **不足** | src/tools/toolRegistry.ts | “汎用管理エージェント”としてのカバレッジが弱い。
| 動的コンテキスト注入（権限/設定/管理ロール等） | **不足** | src/conversation/schema.ts | LLM が状況を知らず誤推論しやすい。
| ループ停止条件（同一観測の反復など） | **不足** | src/conversation/handler.ts | 最大ステップのみで暴走抑制が弱い。
| destructive レート制限の安全寄り既定値 | **不一致** | src/constants.ts / docs/plan/04-implementation.md | 計画の想定より緩く、事故リスクが上がる。
| Evals/回帰テスト | **未実装** | repo 内に相当ファイルなし | “エージェンティックさ”の改善が測れない。
