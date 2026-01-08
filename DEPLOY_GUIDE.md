# Vercelデプロイ手順ガイド

## 前提条件
- GitHubアカウントを持っていること
- Vercelアカウント（GitHubでサインアップ可能）

## ステップ1: GitHubリポジトリを作成

1. https://github.com にログイン
2. 右上の「+」→「New repository」をクリック
3. リポジトリ名を入力（例：`banner-analyzer`）
4. 「Public」または「Private」を選択
5. 「Initialize this repository with a README」は**チェックしない**
6. 「Create repository」をクリック

## ステップ2: ローカルでGitを初期化してプッシュ

ターミナルで以下のコマンドを実行してください：

```bash
# プロジェクトディレクトリに移動
cd "/Users/kubotie/Downloads/AIテキスト/Cursor/banner-analyzer"

# Gitリポジトリを初期化
git init

# すべてのファイルをステージング
git add .

# 初回コミット
git commit -m "Initial commit: 競合バナー分析アプリ"

# GitHubリポジトリをリモートとして追加
# 以下のURLは、ステップ1で作成したリポジトリのURLに置き換えてください
# 例: git remote add origin https://github.com/あなたのユーザー名/banner-analyzer.git
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# メインブランチにプッシュ
git branch -M main
git push -u origin main
```

**注意**: `YOUR_USERNAME` と `YOUR_REPO_NAME` を実際の値に置き換えてください。

## ステップ3: Vercelにデプロイ

### 方法A: Vercel Web UI（推奨・簡単）

1. https://vercel.com にアクセス
2. 「Sign Up」→「Continue with GitHub」でGitHubアカウントと連携
3. ダッシュボードで「Add New...」→「Project」をクリック
4. 「Import Git Repository」で、ステップ1で作成したリポジトリを選択
5. プロジェクト設定：
   - **Framework Preset**: Next.js（自動検出されるはず）
   - **Root Directory**: `./`（そのまま）
   - **Build Command**: `npm run build`（自動）
   - **Output Directory**: `.next`（自動）
   - **Install Command**: `npm install`（自動）
6. 「Deploy」をクリック
7. 数分待つとデプロイが完了
8. 「Visit」ボタンでデプロイされたURLにアクセス可能

### 方法B: Vercel CLI

```bash
# Vercel CLIをインストール
npm i -g vercel

# プロジェクトディレクトリで実行
cd "/Users/kubotie/Downloads/AIテキスト/Cursor/banner-analyzer"
vercel

# 初回はログインが必要（ブラウザが開きます）
# プロジェクト設定はデフォルトでOK（Enter連打でOK）
```

## デプロイ後のURL

デプロイが完了すると、以下のようなURLが生成されます：
- `https://banner-analyzer-xxxxx.vercel.app`

このURLを共有すれば、誰でもアクセスできます！

## 今後の更新方法

コードを更新したら：

```bash
git add .
git commit -m "更新内容の説明"
git push
```

Vercelが自動的に再デプロイします（数分かかります）。

## トラブルシューティング

### ビルドエラーが出る場合
- Vercelのダッシュボードで「Deployments」→ エラーをクリックしてログを確認
- よくある原因：
  - TypeScriptエラー
  - 依存関係の不足
  - 環境変数の未設定

### 画像が表示されない場合
- 画像はローカルファイルではなく、URLが必要な場合があります
- ダミーデータの場合は問題ありません

## 次のステップ

デプロイが成功したら：
1. 生成されたURLを共有
2. 実際の画像解析機能を追加する場合は、環境変数の設定が必要になる場合があります
