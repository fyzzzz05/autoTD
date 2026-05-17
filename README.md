# autoTD

[![PyPI](https://img.shields.io/pypi/v/autotd-buaa)](https://pypi.org/project/autotd-buaa/)
[![Python](https://img.shields.io/pypi/pyversions/autotd-buaa)](https://pypi.org/project/autotd-buaa/)

`autoTD` 是一个用于 BUAA TD 打卡流程管理与执行的 Python CLI 工具。

> 运行大多数功能需要校园网环境（或可访问校园网的 VPN）。

## Quickstart

```bash
python -m pip install autotd-buaa
autotd init
autotd --help
```

## Example

```bash
# 1) 使用 quick 模式添加用户
autotd user add 22375080 --quick 沙河

# 2) 前台执行一次
autotd run --once

# 3) 查看当前状态与缓存次数
autotd status
autotd user count 22375080
```
