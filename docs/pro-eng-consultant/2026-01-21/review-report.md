# レビュー報告書（2026-01-21）

## 重大（High）
- エージェンティック計画スキーマが仕様未達で、計画/影響/理由を表現できない。
  - 根拠: src/conversation/schema.ts, src/conversation/plan.ts
  - 影響: “自律的に多段階で進める”体験が弱く、ユーザーが「エージェンティックに感じない」状態になりやすい。
- 曖昧対象の解決が ID/メンション要求に落ちる。
  - 根拠: src/tools/discordTools.ts（resolveMemberFromParams などの失敗文言）
  - 影響: 「IDを聞かない」方針に反し、運用負荷が高い。

## 重要（Medium）
- 観測フォールバックが限定的で、観測→実行の一貫性が弱い。
  - 根拠: src/conversation/handler.ts（inferObservationFallback）
  - 影響: 一部操作で観測が入らず、失敗や質問が増える。
- 権限の観測ツールが不足しており、権限変更前後の比較ができない。
  - 根拠: src/tools/toolRegistry.ts / src/tools/discordTools.ts
  - 影響: 破壊的操作の説明精度・安全性が低下。
- 動的コンテキスト（権限/設定/ユーザー情報）の注入がなく、LLM の判断材料が薄い。
  - 根拠: src/conversation/schema.ts（system prompt）
  - 影響: 予測外の応答や “観測不足” が増える。

## 低（Low）
- destructive のレート制限が計画値より緩い。
  - 根拠: src/constants.ts / docs/plan/04-implementation.md
  - 影響: 連続破壊操作時の安全余裕が少ない。
- ループ停止条件が最大ステップのみ。
  - 根拠: src/conversation/handler.ts
  - 影響: 同一観測の繰り返しを抑止できない。

## 参考（良い点）
- 承認フロー（Accept/Reject）と監査ログ、自己/ボット対象の禁止は実装済み。
  - 根拠: src/conversation/handler.ts, src/tools/discordTools.ts, src/audit.ts
