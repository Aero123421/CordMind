# TODO（2026-01-21）

## P0: エージェンティック体験の完成度
- [x] AgentStep スキーマ拡張（reason/expected_impact/options）
- [x] Ask/Confirm UI の候補・理由・影響表示
- [x] 観測フォールバック（メンバー/ロール/権限）
- [x] 数字選択の自動解決（候補からの選択）
- [x] 観測メモリに権限上書きの要約を追加
- [x] `get_permission_overwrites` の観測フォールバック（チャンネル未指定時）

## P1: 安全性/安定性
- [x] 同一観測の反復抑止（ただし act 後の再観測は許可）
- [x] system prompt への untrusted 文字列注入の排除
- [x] 破壊的操作の要約に “理由/影響” のフォールバック文を追加

## P2: 運用/評価
- [x] 簡易 Evals 基盤追加（fixtures + script）
- [x] README/README.ja に Evals の実行方法を追記
- [x] `npm run evals -- --strict` の運用ルールを docs に追記

## 検証
- [x] `npm run build`
- [x] `npm run evals`
