# トラブルシューティング: Vercel 404エラー

## エラー: `DEPLOYMENT_NOT_FOUND`

このエラーは、デプロイが見つからないことを示しています。以下の手順で確認・解決してください。

## 確認手順

### 1. Vercelダッシュボードでデプロイ状況を確認

1. https://vercel.com/dashboard にアクセス
2. プロジェクトを選択
3. 「Deployments」タブを確認
4. 最新のデプロイの状態を確認：
   - ✅ **Ready**: デプロイ成功（URLをクリック）
   - ⏳ **Building**: ビルド中（待つ）
   - ❌ **Error**: ビルドエラー（ログを確認）

### 2. ビルドエラーの場合

「Deployments」→ エラーをクリック → 「Build Logs」を確認

よくあるエラーと対処法：

#### TypeScriptエラー
```
エラー例: Type error: Property 'xxx' does not exist
対処: 型定義を確認・修正
```

#### 依存関係エラー
```
エラー例: Module not found: Can't resolve 'xxx'
対処: package.jsonに依存関係が正しく記載されているか確認
```

#### ビルドコマンドエラー
```
対処: Vercelのプロジェクト設定で以下を確認
- Build Command: npm run build
- Output Directory: .next
- Install Command: npm install
```

### 3. プロジェクト設定の確認

Vercelダッシュボードで：
1. プロジェクトを選択
2. 「Settings」→「General」
3. 以下を確認：
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`（空欄または`./`）
   - **Build Command**: `npm run build`（または空欄で自動）
   - **Output Directory**: `.next`（または空欄で自動）
   - **Install Command**: `npm install`（または空欄で自動）

### 4. 再デプロイ

設定を変更したら：
1. 「Deployments」タブ
2. 最新のデプロイの「...」メニュー
3. 「Redeploy」をクリック

または、GitHubにプッシュして自動再デプロイ：
```bash
git add .
git commit -m "Fix deployment"
git push
```

## よくある問題と解決策

### 問題1: ビルドが失敗する

**確認事項:**
- `package.json`の`scripts`に`build`コマンドがあるか
- TypeScriptエラーがないか
- すべての依存関係が`package.json`に記載されているか

**解決策:**
```bash
# ローカルでビルドをテスト
npm run build

# エラーが出たら修正してから再デプロイ
```

### 問題2: デプロイは成功したが404エラー

**確認事項:**
- 正しいURLにアクセスしているか
- デプロイが完了しているか（Ready状態か）

**解決策:**
- Vercelダッシュボードの「Visit」ボタンからアクセス
- カスタムドメインを使っている場合、DNS設定を確認

### 問題3: 画像が表示されない

**原因:**
- 画像はローカルファイルパスではなく、URLが必要
- Next.jsの画像最適化設定が必要な場合がある

**解決策:**
- ダミーデータの場合は問題なし
- 実際の画像を使う場合は、`next.config.js`で設定が必要

## デバッグ用コマンド

ローカルでビルドをテスト：
```bash
cd "/Users/kubotie/Downloads/AIテキスト/Cursor/banner-analyzer"
npm run build
```

エラーが出たら、そのエラーを修正してから再デプロイしてください。

## それでも解決しない場合

1. Vercelのサポートに問い合わせ: https://vercel.com/support
2. ビルドログを共有して、具体的なエラーメッセージを確認
