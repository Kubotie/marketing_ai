#!/bin/bash

# Vercelデプロイ用のクイックスクリプト
# 使用方法: ./QUICK_DEPLOY.sh

echo "🚀 競合バナー分析アプリ - Vercelデプロイ準備"
echo ""

# 現在のディレクトリを確認
if [ ! -f "package.json" ]; then
    echo "❌ エラー: package.jsonが見つかりません"
    echo "   このスクリプトはプロジェクトルートで実行してください"
    exit 1
fi

echo "📦 Gitリポジトリを初期化中..."
git init

echo "📝 ファイルをステージング中..."
git add .

echo "💾 初回コミット中..."
git commit -m "Initial commit: 競合バナー分析アプリ"

echo ""
echo "✅ 準備完了！"
echo ""
echo "次のステップ:"
echo "1. GitHubでリポジトリを作成: https://github.com/new"
echo "2. 以下のコマンドでプッシュ:"
echo "   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "3. Vercelでデプロイ: https://vercel.com"
echo "   - GitHubリポジトリをインポート"
echo "   - 自動的にデプロイされます"
echo ""
