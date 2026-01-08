# GitHub認証の別の方法

## 方法1: GitHub CLIを使用（推奨・簡単）

### インストール
```bash
# Homebrewでインストール
brew install gh
```

### 認証
```bash
# GitHub CLIでログイン
gh auth login

# 以下の質問に答える：
# - GitHub.com? → Yes
# - HTTPS? → Yes
# - Authenticate Git with your GitHub credentials? → Yes
# - How would you like to authenticate? → Login with a web browser
# - ブラウザが開くので、認証を完了
```

### 認証後、再度プッシュ
```bash
git push -u origin main
```

## 方法2: SSH認証を使用

### SSH鍵を生成（まだの場合）
```bash
# SSH鍵を生成
ssh-keygen -t ed25519 -C "your_email@example.com"

# 生成された公開鍵を表示
cat ~/.ssh/id_ed25519.pub
```

### GitHubにSSH鍵を登録
1. 上記のコマンドで表示された公開鍵をコピー
2. https://github.com/settings/keys にアクセス
3. 「New SSH key」をクリック
4. タイトルを入力し、公開鍵を貼り付け
5. 「Add SSH key」をクリック

### リモートURLをSSHに変更
```bash
# HTTPSからSSHに変更
git remote set-url origin git@github.com:Kubotie/banner-analyzer.git

# 確認
git remote -v

# プッシュ
git push -u origin main
```

## 方法3: Personal Access Tokenを再試行

### 入力時の注意
- パスワード入力時は文字が表示されません（正常です）
- Personal Access Tokenをコピーして貼り付け
- Enterキーを押す

### Personal Access Tokenの作成
1. https://github.com/settings/tokens/new にアクセス
2. 「Note」に適当な名前を入力
3. 有効期限を選択
4. スコープで `repo` にチェック
5. 「Generate token」をクリック
6. トークンをコピー（一度しか表示されません）

### 入力方法
```bash
# Username: Kubotie と入力してEnter
# Password: Personal Access Tokenを貼り付けてEnter
# （文字は表示されませんが、入力はできています）
```
