# autoTD

[![PyPI](https://img.shields.io/pypi/v/autotd-buaa)](https://pypi.org/project/autotd-buaa/)
[![Python](https://img.shields.io/pypi/pyversions/autotd-buaa)](https://pypi.org/project/autotd-buaa/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

`autoTD` is a Python CLI tool for managing and running BUAA TD check-in workflows.

> Note: Most runtime flows require campus network access (or VPN).

## Quickstart

```bash
python -m pip install autotd-buaa
autotd init
autotd --help
```

## Example

```bash
# 1) Add one user with quick campus preset
autotd user add 22375080 --quick 沙河

# 2) Run once in foreground
autotd run --once

# 3) Check current status / latest count cache
autotd status
autotd user count 22375080
```
