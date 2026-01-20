# 実装計画書 01: 要件定義

## 背景 / 目的
- Discord サーバー管理を自然言語で安全に実行できる Bot を構築する
- 管理者が「意図 → 実行計画 → 確認 → 実行 → 監査」の流れで操作できることを重視する

## 成功条件
- 管理者/指定ロールのみが Bot を操作できる
- @メンション起点で Thread が作成され、会話が継続できる
- 破壊的操作は必ず二段階確認が入る
- 実行結果と監査ログ（最小限）が確実に保存される
- LLM プロバイダーをギルド単位で切替できる
- 運用対象ギルドは最大 5 までの小規模運用を想定
- Bot が「観測→計画→実行→再計画」の多段階タスクに対応できる
- 言語設定（英/日）に基づき、ユーザー向け文面が一貫してその言語で返る

## スコープ
### In scope
- Discord 管理操作（チャンネル/カテゴリ/ロール/権限/メンバー管理補助）
- @メンション起点 + Thread 継続会話
- /discordaimanage による設定 UI
- LLM プロバイダー切替、API キー管理
- Docker 自己ホスティング + 永続化 + 監査ログ

### Out of scope
- 一般ユーザー向け雑談
- SaaS 化 / 課金機能
- 画像/音声

## 機能要件
- 権限チェック（Admin または指定ロール）後のみ操作を受け付ける
- @メンションで Thread を作成し、1 依頼 = 1 Thread で会話継続する
- Thread 内の会話はメンション不要で成立する（Message Content Intent を使用）
- LLM で意図解析し、Tool Layer（許可済み操作）を呼び出す
- Bot は「不足情報があるなら質問する/自分で観測して補う」を切り替えられる
  - 例: 「名前が長いから vc3 にして」→ チャンネル一覧を取得→ 対象を推定→ 変更案を提示
  - 例: 「2人〜10人制限のVCを作って」→ 仕様を確認（8個作る/既存に追記等）→ まとめて作成案を提示
- なるべくユーザーに ID 提示を要求しない（一覧取得/検索で Bot 側が解決する）
- 破壊的操作は二段階確認（Thread 内の Accept / Reject ボタン）を必須化する
- 承認ボタン（Accept/Reject）を押せるのは依頼者のみとする
- 確認時に「実行内容」と「影響範囲（対象チャンネル/ロール等）」を提示する
- 破壊的操作は原則許可するが、以下は禁止:
  - サーバー（Guild）削除
  - Bot 自身の BAN / Kick / Timeout（および自分自身への BAN/Kick/Timeout）
- BAN/Kick/Timeout 等のメンバー管理は「対象が自分自身/ボットでない」場合に限り許可（必ず確認を挟む）
- 監査ログは最小限・短期保管（長期保持は不要）
- Discord ログチャンネルへの出力は任意設定とする
- /discordaimanage でプロバイダー/モデル/API キー/ログ/Thread/レート制限を設定できる
- 設定コマンド/導線は一貫性があり、合理的な UX であること
- 設定 UX は以下を満たす:
  - コマンドは原則 `/discordaimanage setup` と `/discordaimanage setting` のみ
  - setup は対話式（選択肢提示 + Next）で、言語設定が最初
  - setting は現在値を見せ、同じ導線で再設定できる（“一度設定して終わり”にしない）
  - API キーはプロバイダーごとに設定されていることが分かる UI（設定済み/未設定の表示）
  - モデル名が「どのプロバイダーのモデルか」分かる表示（provider label）
  - モデル一覧は各プロバイダー API から取得し、1 日キャッシュして UI に提示
- 設定フローは「プロバイダー選択 → API 入力 → モデル選択」
  - API 設定済みなら入力画面は省略（再設定は可能）

## 非機能要件
- 可用性: 単一ホスト運用での継続稼働（自動再起動前提）
- 性能/スケーラビリティ: ギルド単位 10 ops/分程度の管理操作に耐える
- セキュリティ: API キー暗号化、最小権限、監査ログ必須
- 監査/ログ: 破壊的操作中心に最小限のログを残す（短期保管、会話全文は原則保持しない）
- 運用性: Docker Compose で容易に再起動/更新できる
- 可観測性: 構造化ログ + エラー通知
- 国際化: 英語をデフォルトとし、ギルド設定により英/日を切替（ユーザー向け文面は一貫）
- 拡張性: Discord の主要リソース（チャンネル/ロール/メンバー等）を横断して操作できる Tool 設計

## 制約 / 依存
- 【FACT】Discord の Message Content Intent は特権 Intent であり、条件次第で承認が必要
- 【FACT】Message Content Intent 未承認の場合、コンテンツ関連フィールドが空になるが、Bot へのメンションや DM では取得可能
- 【FACT】運用対象ギルドが 100 未満なら Message Content Intent は開発者ポータルで有効化できる
- 【FACT】Discord のグローバルレート制限は 50 req/s（大半のルート）
- 【FACT】discord.js v14 は Discord API v10 を使用
- 【FACT】discord.js は最新 LTS の Node.js を前提にドキュメントが記載されている
- 【FACT】Thread の auto_archive_duration は 60/1440/4320/10080 分が利用可能
- 【FACT】Gemini は response_mime_type/response_json_schema により JSON 出力を制御できる
- 【FACT】xAI は Structured Outputs をサポートし、モデル条件により JSON Schema 準拠を保証
- 【FACT】Groq は response_format=json_schema と strict でスキーマ準拠を強制できる
- 【FACT】Cerebras は response_format に json_schema/json_object を提供
- 【FACT】Z.AI は response_format に text/json_object を提供（json_schema 不在）
- 事実の根拠は docs/plan/02-research.md を参照

## 前提 / 仮説
- 【FACT】運用対象ギルドは最大 5 程度の小規模運用
- 【HYPOTHESIS】Thread 継続会話は Message Content Intent を前提に成立する（未承認時は UI/メンション要求にフォールバック）
- 【HYPOTHESIS】エージェントは “観測ツール→再計画” のループで複雑タスクの成功率が改善する

## 未確定事項 / 質問
- 【UNRESOLVED】「破壊的操作」の判定条件（AI 判断 + ルールの両方か、最終判定ロジック）
- 【UNRESOLVED】常に禁止する操作の追加有無（例: guild 削除以外に “連携/インテグレーション破壊” を禁じる等）
