# Evals

代表ログをフィクスチャ化して回帰を簡易チェックするための仕組みです。

## 使い方

1. `evals/fixtures/` に JSON 形式でログを保存します。
2. `npm run evals` を実行します。
3. 厳格判定が必要なら `npm run evals -- --strict` を使います。

## フィクスチャ形式

```json
{
  "id": "case-001",
  "lang": "ja",
  "messages": [
    { "role": "user", "content": "@Bot VCを作って" },
    { "role": "assistant", "content": "候補を選んでください\n• 1. voice-room\n• 2. VC-雑談" },
    { "role": "user", "content": "1" },
    { "role": "assistant", "content": "voice-room を作成します" }
  ]
}
```

## チェック内容（簡易）
- ID 要求（user_id / role_id / channel_id など）の露出
- JSON 丸出し（構造化出力がそのままユーザーに出た場合）
- 言語逸脱（日本語設定で英語比率が高い、等）
- 破壊的操作の確認漏れ（推定）

※ いずれもヒューリスティックな簡易判定です。正確さが必要な場合は個別の E2E で検証してください。
