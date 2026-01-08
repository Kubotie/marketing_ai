# Personal Access Token の作成と入力方法

## ステップ1: Personal Access Tokenを作成

1. **ブラウザで以下にアクセス：**
   https://github.com/settings/tokens/new

2. **設定を入力：**
   - **Note（メモ）**: `Vercel Deploy` など、わかりやすい名前
   - **Expiration（有効期限）**: `90 days` または `No expiration`（推奨）
   - **Select scopes（スコープ）**: 
     - ✅ `repo` にチェック（これが重要！）
     - その他のチェックは不要

3. **「Generate token」をクリック**

4. **表示されたトークンをコピー**
   - ⚠️ **重要**: このトークンは一度しか表示されません
   - 必ずコピーして安全な場所に保存してください
   - 例: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## ステップ2: ターミナルでプッシュ

```bash
cd "/Users/kubotie/Downloads/AIテキスト/Cursor/banner-analyzer"
git push -u origin main
```

## ステップ3: 認証情報を入力

### Username（ユーザー名）
```
Kubotie
```
と入力してEnter

### Password（パスワード）
**ここが重要！**
- Personal Access Tokenを**貼り付け**（コピー&ペースト）
- ⚠️ **文字は表示されません**（正常です）
- 貼り付けたらEnterキーを押す

## よくある間違い

❌ **間違い**: パスワードを手入力しようとする
✅ **正解**: Personal Access Tokenをコピー&ペースト

❌ **間違い**: トークンが表示されないと思って何度もクリック
✅ **正解**: 一度コピーしたら、そのトークンを使う

❌ **間違い**: `repo`スコープにチェックを入れ忘れる
✅ **正解**: 必ず`repo`にチェックを入れる

## それでも失敗する場合

### 方法A: トークンを再作成
1. https://github.com/settings/tokens にアクセス
2. 古いトークンを削除
3. 新しいトークンを作成（上記手順を再度実行）

### 方法B: GitHub Desktopを使用
1. https://desktop.github.com からGitHub Desktopをダウンロード
2. インストールしてログイン
3. リポジトリを開いて「Push origin」をクリック
