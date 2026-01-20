# 実装計画書 02: 調査結果（事実ベース）

## 検索方針
- 優先度: 公式ドキュメント > 仕様/公式ブログ > 標準化団体 > 実運用事例
- 参照日: 2026-01-20

## 調査トラック
- トラックA（前提検証）: Discord の権限/Intent/Thread/レート制限の仕様確認
- トラックB（技術選定）: LLM プロバイダーの Structured Output / JSON 出力機能の確認
- トラックC（リスク検証）: 失敗しやすい領域（Intent 未承認、レート制限、JSON 逸脱）

## 事実一覧
- 事実: Discord の Message Content Intent は特権 Intent であり、条件次第で承認が必要
  - 根拠: https://support-dev.discord.com/hc/en-us/articles/9332123851287-Verified-Apps-and-Privileged-Intents
  - 参照日: 2026-01-20
- 事実: Message Content Intent 未承認の Bot では content/embeds/attachments/components が空になり、DM/メンション/自分の送信メッセージは例外
  - 根拠: https://support-dev.discord.com/hc/en-us/articles/12162394845207-Message-Content-Intent-FAQ
  - 参照日: 2026-01-20
- 事実: 100 サーバー未満の Bot は Message Content Intent を開発者ポータルで有効化でき、承認対象は 100 サーバー以上（検証済み Bot）
  - 根拠: https://support-dev.discord.com/hc/en-us/articles/12162394845207-Message-Content-Intent-FAQ
  - 参照日: 2026-01-20
- 事実: Discord のグローバルレート制限は大半のエンドポイントで 50 req/s
  - 根拠: https://support-dev.discord.com/hc/en-us/articles/11634635707287-Rate-Limits-What-are-they
  - 参照日: 2026-01-20
- 事実: discord.js v14 は Discord API v10 を使用
  - 根拠: https://discordjs.guide/additional-info/changes-in-v14.html#discord-api-types
  - 参照日: 2026-01-20
- 事実: discord.js のドキュメントは最新 LTS の Node.js を前提としている
  - 根拠: https://discordjs.guide/preparations/#installing-node-js
  - 参照日: 2026-01-20
- 事実: Thread の auto_archive_duration は 60/1440/4320/10080 分が利用可能
  - 根拠: https://discord.js.org/docs/packages/discord.js/main/APIThreadMetadata:Interface
  - 参照日: 2026-01-20
- 事実: Gemini は response_mime_type と response_json_schema で JSON 出力を制御でき、JSON Schema はサブセット
  - 根拠: https://ai.google.dev/gemini-api/docs/structured-output?lang=python
  - 参照日: 2026-01-20
- 事実: xAI の Structured Outputs は JSON Schema 準拠を保証し、grok-2-1212 以降のモデルで利用可能
  - 根拠: https://docs.x.ai/docs/guides/structured-outputs
  - 参照日: 2026-01-20
- 事実: Groq は response_format=json_schema と strict でスキーマ準拠を強制でき、対応モデルに制限がある
  - 根拠: https://console.groq.com/docs/structured-outputs
  - 参照日: 2026-01-20
- 事実: Cerebras は response_format に json_schema/json_object を提供している
  - 根拠: https://inference-docs.cerebras.ai/api-reference/chat-completions
  - 参照日: 2026-01-20
- 事実: Z.AI は response_format に text/json_object を提供し、json_schema は記載がない
  - 根拠: https://docs.z.ai/api-reference/chat-completion
  - 参照日: 2026-01-20
- 事実: Z.AI の API は Bearer 認証で https://api.z.ai/v1 を利用
  - 根拠: https://docs.z.ai/introduction
  - 参照日: 2026-01-20

## 重要な示唆
- Message Content Intent を前提にしない会話設計（メンション/インタラクション中心）が安全
- Structured Output のサポート差が大きく、プロバイダー別に厳格度を変える必要がある
- レート制限対策（キュー/バルク制御）が MVP でも必要

## 仮説（裏取り未完了）
- Groq / Cerebras / Z.AI の最新モデル ID は運用開始時点で再確認が必要
- Thread 内での「非メンション」会話運用は Intent 未承認時に破綻する可能性がある

## 追加調査候補
- Discord アプリコマンドの命名規則と制限（公式ソースの最終確認）
- プロバイダー別のレート制限 / 料金体系
- 監査ログの法的・組織的な保持要件
