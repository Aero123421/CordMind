# AGENT.md

## 目的
このリポジトリで作業するAIエージェントが、docs/plan/00-index.md と配下の計画書に基づき一貫した改善/実装を行う。

## まず読む
- docs/plan/00-index.md

## 作業原則
- 事実と仮説を区別し、疑義があれば質問する。
- 重大な前提変更があれば docs/plan/ を更新する。
- スコープ外の作業は実行前に確認する。
- ユーザー向け文面の言語（英/日）を崩さない。
- destructive は必ず human approval、禁止事項はハード拒否。

## 技術スタック
- 言語/フレームワーク: Node.js（最新 LTS）/ TypeScript / discord.js v14
- 主要ライブラリ: Prisma, pino
- 実行環境: Docker Compose + Postgres 16

## リポジトリ構成（概要）
- src/: Discord Bot 本体（会話/ツール/設定）
- prisma/: DB スキーマ
- docs/plan/: 計画書（要件/調査/設計/改善ロードマップ）
- docker-compose.yml / Dockerfile: 自己ホスティング

## セットアップ / 実行
- ローカル開発: `npm run dev`
- ビルド: `npm run build`
- 本番実行: `npm start`
- Docker（DB+Bot）: `docker compose up -d --build`
- Docker logs: `docker compose logs -f bot`

## テスト
- まず `npm run build` を通す（TypeScript）
- 重要フローは docs/plan/06-qa.md の受け入れ項目で回帰確認する

## 品質基準
- 破壊的操作は必ず二段階確認
- 監査ログは失敗時も記録
- JSON 逸脱時に Tool 実行が走らない
- “ID を教えて” が標準動作にならない（観測で解決する）
- 日本語設定なら日本語で応答し続ける（英語に戻らない）

## 変更時の確認事項
- 未確定事項の更新（docs/plan/01-requirements.md / 05-risks.md）
- 監査ログのフォーマット変更有無
- LLM プロバイダー/モデルの更新有無
- 言語/i18n（フォールバック文言含む）の混在がないか
- 承認 UI が JSON 丸出しになっていないか
