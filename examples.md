1. 安装

推荐用虚拟环境：

python3 -m venv ~/.venvs/autotd
source ~/.venvs/autotd/bin/activate

python -m pip install -U pip
pip install autotd-buaa==0.1.11

autotd --help
以后每次使用前：

source ~/.venvs/autotd/bin/activate
2. 初始化配置目录

如果你把本地的 autoTD/ 项目传到了服务器，比如放在 ~/autoTD：

autotd init [--from ~/autoTD]
这会生成：

~/.autoTD/
├── config.json
├── users.json
├── settings.json
├── state.json
├── images/
└── logs/
如果不从旧项目导入：

autotd init
然后手动编辑：

nano ~/.autoTD/config.json
把里面的 server、machine 配置改成真实配置。
如果 config.json 里还是旧默认 127.0.0.1:8888，升级到 0.1.3 后再次运行 autotd init 会自动改成当前默认 TD 服务器地址。

Telemetry 默认开启，会上传明文学号、TD 次数、用户数量、版本、平台和运行事件，不上传 card_id、图片、机器编号、服务器地址或日志。关闭：

autotd telemetry disable

维护者配置 Cloudflare Worker endpoint 后可开启/同步：

autotd telemetry enable --endpoint https://autotd-telemetry.autotd-buaa.workers.dev
autotd telemetry sync

3. 添加图片

如果没有从旧项目导入图片，先添加图片：

autotd image add ~/images/image1.jpg
autotd image add ~/images/image2.jpg
autotd image add ~/images/image3.jpg

autotd image list
也可以自定义名字：

autotd image add ~/images/in.jpg --name entrance.jpg
autotd image add ~/images/out.jpg --name exit.jpg
4. 快速添加用户

沙河：

autotd user add 22375080 --quick 沙河
学院路：

autotd user add 22375080 --quick 学院路
--quick 会自动随机选择对应校区的入口/出口机器，并随机选择已有图片。

查看用户：

autotd user list
autotd user show 22375080
5. 手动添加用户

autotd user add 22375080 \
  --entrance 2 \
  --exit 6 \
  --entrance-image image3.jpg \
  --exit-image image2.jpg
修改用户：

autotd user update 22375080 --card-id ABCDEF
autotd user update 22375080 --entrance 3 --exit 7
autotd user update 22375080 --entrance-image image1.jpg --exit-image image2.jpg
删除用户：

autotd user delete 22375080
6. 查询 TD 锻炼次数

默认读取本地缓存，不访问服务器：

autotd user count 22375080
需要发送真实 checkdata 请求并刷新缓存时：

autotd user count 22375080 --refresh
如果本地缓存显示该用户本学期 TD 次数已经达到 32 次，运行打卡时会自动跳过该用户；这会更新 telemetry 今日活跃用户快照，但不会增加 Cloudflare 中的今日 TD 打卡数。
7. 立即运行一次

autotd run --once
日志会写到：

ls ~/.autoTD/logs/
cat ~/.autoTD/logs/$(date +%F)-daytime-log.txt
8. 配置后台定时检测

查看定时配置：

autotd schedule show
设置轮询间隔和时间段：

autotd schedule set \
  --poll-seconds 60 \
  --windows "07:30-10:00,11:30-14:00,15:30-20:00"
启动后台定时检测：

autotd run
终端会立即返回，后台进程会按设置的时间段检测。查看后台进程状态：

autotd status
停止后台定时检测：

autotd --stop

9. 常用检查

autotd image list
autotd user list
autotd schedule show
tail -f ~/.autoTD/logs/$(date +%F)-daytime-log.txt
如果遇到无法连接服务器，检查：

cat ~/.autoTD/config.json
确认 server.ip 不是 127.0.0.1，而是可访问的 TD 服务器地址，例如 10.212.28.38；同时确认当前网络可访问校园网或已连接 VPN。
安装包名是：

pip install autotd-buaa==0.1.11
命令名是：

autotd
