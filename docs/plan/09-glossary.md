# 実装計画書 09: 用語集

- LLM: 大規模言語モデル
- Guild: Discord サーバー
- Thread: 会話を分離する Discord のスレッド機能
- Privileged Intent: Bot が特別な権限で取得できる Intent
- Message Content Intent: メッセージ本文取得に必要な Privileged Intent
- Tool Layer: Bot が許可された Discord 操作を実行する層
- Structured Output: JSON Schema などに基づく構造化出力
- Audit Log: 操作履歴を記録する監査ログ
- Agent Orchestrator: 観測→計画→実行→再計画を制御する中核
- Human approval: 破壊的操作などを人間が承認してから実行する仕組み
- Prompt injection: ユーザー入力等により指示が乗っ取られる攻撃/失敗パターン
- Evals: 代表ログ等を使って AI 挙動を評価・回帰防止する仕組み
