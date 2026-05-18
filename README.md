# autoTD

[![PyPI](https://img.shields.io/pypi/v/autotd-buaa)](https://pypi.org/project/autotd-buaa/)
[![Python](https://img.shields.io/pypi/pyversions/autotd-buaa)](https://pypi.org/project/autotd-buaa/)

`autoTD` 是一个用于 BUAA TD 打卡流程管理与执行的 Python CLI 工具。

> 仅支持校园网直连环境，不支持 VPN。

## Quickstart

```bash
# 1) 安装 PyPI 包
pip install autotd-buaa

# 2) 初始化本地配置目录（默认 ~/.autoTD）
autotd init

# 3) 准备至少一张打卡图片并导入
autotd image add ~/images/image1.jpg

# 4) 添加用户（quick 模式自动填充学院路机位组合）
autotd user add 2xxxxxxx --quick 学院路

# 5) 启动打卡流程
#    - autotd run       : 后台持续运行
#    - autotd run --once: 前台仅执行一轮
autotd run [--once]
```

## Windows 安装说明（PATH）

在 Windows 上，如果 `pip install autotd-buaa` 输出类似警告：

```text
... is installed in 'C:\Users\<you>\AppData\Roaming\Python\PythonXY\Scripts' which is not on PATH
```

说明 `autotd.exe` 已安装成功，但当前终端找不到该目录，因此 `autotd` 命令不可直接调用。

### 方案 A：先不改 PATH，直接使用模块入口

```powershell
py -m auto_td.cli init
```

### 方案 B：将用户 Scripts 目录加入 PATH（推荐，一次配置长期生效）

```powershell
$scriptDir = py -c "import sysconfig; print(sysconfig.get_path('scripts', 'nt_user'))"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$scriptDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$scriptDir", "User")
}
```

执行后请重开 PowerShell，再运行：

```powershell
autotd --help
```

## 状态与 TD 次数查询

```bash
# 查看当前后台运行状态与今日执行进度
autotd status

# 查看某个学号当前缓存的 TD 次数（不访问服务器）
autotd user count 2xxxxxxx

# 实时查询服务器并刷新本地 TD 次数缓存
autotd user count 2xxxxxxx --refresh
```
