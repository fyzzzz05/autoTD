# Background Run Design

## Goal

Make `autotd run` start the timed checker in the background, keep terminal output quiet after startup, provide `autotd --stop` to close the background checker, and make TD server connection failures easier to diagnose.

## Confirmed Behavior

- `autotd run --once` runs one batch in the foreground and prints the existing summary.
- `autotd run` enables scheduled checking and starts a detached background worker.
- The background worker writes logs to `~/.autoTD/logs/YYYY-MM-DD-daytime-log.txt` without streaming scheduler output to the terminal.
- `autotd --stop` reads the pid file from `~/.autoTD/autotd.pid`, sends a termination signal, and removes stale pid files.
- New installs use the real TD server address from the project config template instead of `127.0.0.1`.
- Existing installs that still point at `127.0.0.1` receive a clear error telling the user to check `~/.autoTD/config.json`, network access, and the TD server endpoint.

## Components

- `auto_td.background`: owns pid file read/write, detached worker startup, process status checks, and stop behavior.
- `auto_td.cli`: exposes top-level `--stop`, hidden background worker mode, and routes `run` to foreground or background behavior.
- `auto_td.scheduler`: keeps polling behavior but accepts a stop callback and logs scheduler failures through the configured logger.
- `auto_td.logging_utils`: can configure file-only logging for the detached worker.
- `auto_td.client`: wraps low-level socket connection failures with actionable context.

## Testing

Tests cover connection failure messages, default template server values, background start routing, top-level stop routing, pid file behavior, and file-only logging. Existing runner, scheduler, storage, and CLI tests remain the regression suite.
