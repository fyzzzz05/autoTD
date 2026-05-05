# Background Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `autotd run` launch a quiet background timed checker with `autotd --stop`, and make connection-refused failures actionable.

**Architecture:** Add a small background process manager that stores a pid file in the app home and starts a detached Python worker. The CLI keeps `run --once` as the foreground path, while plain `run` enables schedule and delegates to the background manager.

**Tech Stack:** Python standard library, argparse, unittest, setuptools build metadata.

---

### Task 1: Tests For Connection And Template Defaults

**Files:**
- Modify: `tests/test_protocol_runner_scheduler.py`
- Modify: `tests/test_storage_cli.py`

- [ ] **Step 1: Write the failing connection error test**

Add a fake socket factory whose `connect` raises `ConnectionRefusedError`, then assert `TDClient.request()` raises `ConnectionError` mentioning the host, port, and config file.

- [ ] **Step 2: Write the failing template default test**

Initialize a temporary `AppStorage`, load the generated config, and assert `server.ip == "10.212.28.38"` and `server.port == 8888`.

- [ ] **Step 3: Run the two tests**

Run: `python3 -m unittest tests.test_protocol_runner_scheduler tests.test_storage_cli -v`

Expected before implementation: failures for the missing friendly error and localhost template default.

### Task 2: Tests For Background CLI Behavior

**Files:**
- Modify: `tests/test_storage_cli.py`
- Create: `tests/test_background.py`

- [ ] **Step 1: Write the failing CLI tests**

Assert `cli.main(["run"])` calls the background starter, enables the schedule, does not call `run_all_users`, and prints no batch summary. Assert `cli.main(["--stop"])` calls the background stopper without requiring a subcommand.

- [ ] **Step 2: Write the failing background manager tests**

Assert `start_scheduler_process()` writes `autotd.pid` and launches `[sys.executable, "-m", "auto_td.cli", "--daemon-worker"]` with stdio sent to `DEVNULL`. Assert `stop_scheduler_process()` terminates the pid and removes the pid file.

- [ ] **Step 3: Run the new tests**

Run: `python3 -m unittest tests.test_background tests.test_storage_cli -v`

Expected before implementation: failures for missing `auto_td.background` and missing CLI routing.

### Task 3: Implement Background Manager And CLI Routing

**Files:**
- Create: `src/auto_td/background.py`
- Modify: `src/auto_td/storage.py`
- Modify: `src/auto_td/cli.py`
- Modify: `src/auto_td/scheduler.py`
- Modify: `src/auto_td/logging_utils.py`

- [ ] **Step 1: Add pid path support**

Add `self.pid_path = self.home / "autotd.pid"` to `AppStorage`.

- [ ] **Step 2: Add background process manager**

Implement dataclass results, JSON pid read/write, process start with detached `subprocess.Popen`, duplicate process detection, SIGTERM stop, and stale pid cleanup.

- [ ] **Step 3: Add quiet daemon worker**

Add hidden `--daemon-worker` CLI path that configures file-only logging, installs SIGTERM/SIGINT handlers, and runs `run_forever()` until stopped.

- [ ] **Step 4: Route run and stop**

Make `autotd run --once` call the existing foreground runner. Make `autotd run` enable schedule and start the background process. Make `autotd --stop` call the stopper.

- [ ] **Step 5: Run background CLI tests**

Run: `python3 -m unittest tests.test_background tests.test_storage_cli -v`

Expected after implementation: all listed tests pass.

### Task 4: Implement Connection Error And Defaults

**Files:**
- Modify: `src/auto_td/client.py`
- Modify: `src/auto_td/templates/config.json`

- [ ] **Step 1: Wrap socket connect errors**

Catch `ConnectionRefusedError`, `TimeoutError`, and `OSError` around `sock.connect()` and raise `ConnectionError` with endpoint and config guidance.

- [ ] **Step 2: Update packaged config template**

Change the default server IP to `10.212.28.38`, keep port `8888`, and keep timeout `10`.

- [ ] **Step 3: Run protocol and storage tests**

Run: `python3 -m unittest tests.test_protocol_runner_scheduler tests.test_storage_cli -v`

Expected after implementation: all listed tests pass.

### Task 5: Docs, Version, Build, And Publish

**Files:**
- Modify: `pyproject.toml`
- Modify: `src/auto_td/__init__.py`
- Modify: `README.md`
- Modify: `examples.md`

- [ ] **Step 1: Bump version**

Set package version and `__version__` to `0.1.2`.

- [ ] **Step 2: Update docs**

Document `autotd run`, `autotd run --once`, `autotd --stop`, logs, and connection-refused diagnosis.

- [ ] **Step 3: Run full tests**

Run: `python3 -m unittest discover -s tests -v`

Expected: all tests pass.

- [ ] **Step 4: Build distributions**

Run: `python3 -m build`

Expected: new `dist/autotd_buaa-0.1.2.tar.gz` and wheel.

- [ ] **Step 5: Upload packages**

Use `/Users/denerate/ELSE/TestPyPI-api-key.txt` for TestPyPI, then `/Users/denerate/ELSE/PyPI-api-key.txt` for PyPI with `python3 -m twine upload`.
