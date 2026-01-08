# デプロイ手順

## Vercelにデプロイする方法（推奨）

### 1. Vercelアカウント作成
- https://vercel.com にアクセス
- GitHubアカウントでサインアップ（無料）

### 2. デプロイ方法

#### 方法A: Vercel CLIを使用
```bash
# Vercel CLIをインストール
npm i -g vercel

# プロジェクトディレクトリで実行
cd banner-analyzer
vercel

# 初回はログインが必要
# プロジェクト設定はデフォルトでOK
```

#### 方法B: GitHub経由（推奨）
1. GitHubにリポジトリを作成
2. コードをプッシュ
3. Vercelで「New Project」を選択
4. GitHubリポジトリを選択
5. 自動的にデプロイされる

### 3. デプロイ後のURL
- `https://your-project-name.vercel.app` のようなURLが生成されます
- このURLを共有すれば、誰でもアクセス可能です

## その他のデプロイ先

### Netlify
- https://netlify.com
- GitHubと連携して自動デプロイ

### Railway
- https://railway.app
- 簡単なデプロイ手順

## 注意事項
- デプロイ後は、ダミーデータでも動作します
- 実際の画像解析機能を追加する場合は、環境変数の設定が必要になる場合があります
