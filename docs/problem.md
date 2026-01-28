# 問題点まとめ

## 概要
現在のUXが悪化する主因は、**意図判定の強さ・不足情報の扱い・対象の会話的保持の弱さ・失敗時の誘導不足・応答遅延**が同時に起きている点にある。

## 主要な問題点（実装由来）
1. **入口の意図判定が強すぎて誤分岐しやすい**
   - 例: 「メンバー」という語だけで一覧要求に寄る / 診断キーワードで診断に寄る。
   - 該当: `src/conversation/handler.ts`（`detectMemberListIntent`）、`src/diagnostics.ts`（`detectDiagnosticsTopic`）

2. **LLM出力がJSON前提で失敗時のUXが薄い**
   - JSONパース失敗時に「finish扱い」や固定文に落ち、次の行動が案内されない。
   - 該当: `src/conversation/plan.ts`、`src/conversation/handler.ts`（`planFallbackReply`）

3. **観測の繰り返し禁止が詰まりを生む**
   - 同一観測を拒否して即「対象特定できず」になり、対話が続かない。
   - 該当: `src/conversation/handler.ts`（`trackObservation` / `repeatedObservationReply`）

4. **不足パラメータの質問フローがない**
   - Toolは必須パラメータ不足で即failするが、質問に切り替わらない。
   - 例: `create_role` の `name` 欠落で失敗。
   - 該当: `src/tools/discordTools.ts`

5. **対象解決が厳格すぎる（完全一致）**
   - ロール/チャンネル名の大小文字・部分一致に弱く、失敗を招く。
   - 該当: `src/tools/discordTools.ts`（`resolveRole` / `resolveChannel`）

6. **act後の返答が機械的で“AI感”が薄い**
   - 実行結果の羅列だけで、要約や次提案がない。
   - 該当: `src/conversation/handler.ts`

7. **対象の会話的保持が弱い**
   - スレッド要約は文字列追記のみで、直前対象（ユーザー/チャンネル）を保持できない。
   - 該当: `src/conversation/threadState.ts` / `buildObservationMemoryAppend`

8. **遅延が発生しやすい**
   - 1メッセージ内で複数API（LLM複数回＋Discord API多発）になりやすい。
   - 該当: `src/conversation/handler.ts` / `src/impact.ts`

## UXが悪くなる主因（コード/挙動ベース）
- **失敗時の返しが雑**
  - 失敗するとほぼ固定文（例:「うまく処理できませんでした…」）に落ちるため、ユーザーが次に何を言えばいいか分からない。
  - 該当: `src/conversation/handler.ts`（`planFallbackReply` / `repeatedObservationReply`）
- **“同じ情報を再確認”ループ**
  - 観測ツールを再実行できないようガードしているため、曖昧さが解けないと即「対象特定できません」に戻る。
  - 該当: `src/conversation/handler.ts`（`trackObservation` / `repeatedObservationReply`）
- **不足パラメータの処理が弱い**
  - 例: 「manロール作って」→ `create_role` の `name` が空で失敗。
  - 本来は不足項目を質問するか、観測→候補提示するべきだが、今はその検証が弱い。
  - 該当: `src/conversation/plan.ts`（入力検証はあるが不足パラメータの対話処理は別途存在しない）
- **“できない要求”に対する説明がない**
  - 「活動してないメンバーをキック」など、必要なログや活性指標の取得ツールが無いのに、ただ失敗を返す。
  - UX的には「何が足りないか」「どうすれば可能か」を返すべき。
  - 該当: `src/tools/` に活動ログ系のツールがない
- **矛盾した返答が起きる**
  - 「自分をBAN」は LLMが一旦“実行宣言”→実ツールで失敗→説明は「自己防衛でできない」。
  - 事前チェックが無いので、宣言→失敗→言い訳の順になって信用を落とす。
  - 該当: `src/conversation/handler.ts`（ツール実行前の事前検証が薄い）
- **act後の返答が機械的**
  - 非破壊アクションはツール結果の羅列で終わる。人間っぽいまとめ/次の提案がない。
  - 該当: `src/conversation/handler.ts`（結果を並べて返信、LLM再生成はしない）
- **レスポンスの遅さ**
  - ループで最大6回 LLMコール、かつ `[TOOL_RESULT]` が大きくなりがち。
  - 該当: `src/conversation/handler.ts`（`MAX_AGENT_STEPS` / `buildToolResultMessage`）
- **対象の“会話的保持”がない**
  - 例: 直前に選んだユーザーを次発話で参照できない。
  - “一貫した会話”に感じない。
  - 該当: スレッドサマリはあるが「ターゲットの固定」がない

## 追加で見える問題点
- **LLMの指示遵守が不完全でも先に進む**
  - schemaに合わない出力が来ると finish 扱い or fallback になり、意図が崩れる。
  - JSON失敗時に「素のテキストでfinish返し」になるのはUX的に不安定。
  - 該当: `src/conversation/plan.ts`

- **Bot権限不足時のUXが弱い**
  - 権限不足は出るが「何をどう付けるか」の案内が無い。
  - 例: `ManageChannels` が必要だが、どこで付与するかが分からない。
  - 該当: `src/conversation/handler.ts`（`formatMissingPerms`）

- **曖昧解決のガイドがない**
  - 同名チャンネル/ロールなど候補が出ても質問化が一貫しない。
  - その結果「対象を特定できません」になりやすい。
  - 該当: `resolveMemberFromParams` などの候補返しとLLMの橋渡し不足

- **モデル差で品質が揺れる**
  - providerごとの出力品質の差で JSON準拠率やプラン品質が乱れる。
  - Geminiはプロンプトがフラット文字列化され、会話構造が弱い。
  - 該当: `src/llm/gemini.ts`

- **Tool結果の可観測性が低い**
  - 失敗時にDiscord APIの詳細（エラーコード）が返らず「ツールの実行に失敗しました」で終わる。
  - 該当: `src/tools/discordTools.ts` / `src/conversation/handler.ts`

- **破壊的操作の確認UXが硬い**
  - 確認は出るが、代替案や影響の軽い選択肢への誘導が少ない。

- **「ユーザーの意図」を保存していない**
  - 目的（例: 荒らし対応/整理）を保持しないため、次の提案が的外れになりやすい。

- **多段作業の途中状態が記録されない**
  - 途中で質問を挟むと前提が失われ、再観測からやり直しになりがち。

- **行動前の実行可能性チェックが薄い**
  - 例: Bot自身への操作、権限不足、対象未存在などが「宣言→失敗」になる。
  - 事前に止めれば信用低下を防げる。

## ログで顕在化した症状（例）
- 自己BANの宣言 → 実ツールで失敗 → 後から説明（信用低下）
- 「活動していない人をキック」→ 一覧 or 失敗で停滞
- 「manロール作って」→ name不足でツール失敗
- 「暴言ユーザーいる？」→ ツール不足で曖昧応答

## 影響
- 対話が続かない／目的達成に至らない
- エラー時の納得感が薄い
- 実行したい操作が“意図通りに進まない”

## 備考（改善の方向性）
- 不足パラメータは必ず `ask` に切り替える
- 直前対象の会話メモリ（ターゲット保持）を導入
- 失敗時は「理由＋次の一手」を必ず返す
- act後に自然文で要約・次提案を返す
