# mars_dev_014
marse develop is NASA app project 2026 No 14 

## ローカルでの起動

地図で設定したA/B地点をリポジトリ直下の `data.json` に保存し、HUD操作画面と同期するには、Node.jsでローカルサーバーを起動します。

```sh
node server.js
```

ブラウザーで `http://127.0.0.1:8080/` を開いて地図を操作し、`http://127.0.0.1:8080/SerchClothes/` を開くと、操作画面にA/B地点の座標が表示されます。地図でピンを動かすか地図をクリックすると `data.json` が更新され、開いている同一ブラウザー内の画面にも反映されます。`data.json` の `waypoints.a` / `waypoints.b` が保存先です。

HTMLファイルを直接開いた場合はブラウザーの制約で `data.json` を更新できません。
