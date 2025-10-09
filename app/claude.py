#!/usr/bin/env python3
"""
Python helper to launch the 'claude' CLI with sane defaults and signal mirroring.

This mirrors the behaviour of app/claude.ts in the repository: it sets default
environment variables (if not present), runs the 'claude --dangerously-skip-permissions'
command forwarding additional args, uses the shell on Windows, forwards common signals
to the child process, and exits with the same code or signal as the child.

Usage:
  python claude.py [args...]

Add --dry-run to print the command and environment without executing it.
"""
import os
import sys
import shlex
import subprocess
import signal
from typing import List


def main(argv: List[str]) -> int:
    # Copy environment and set defaults if missing
    env = os.environ.copy()
    env.setdefault('ANTHROPIC_BASE_URL', 'http://localhost:4000/anthropic/claude')
    env.setdefault('ANTHROPIC_API_KEY', '')
    env.setdefault('ANTHROPIC_MODEL', '')

    dry_run = False
    if '--dry-run' in argv:
        dry_run = True
        argv = [a for a in argv if a != '--dry-run']

    print('Starting claude with environment:')
    print('  ANTHROPIC_BASE_URL=', env.get('ANTHROPIC_BASE_URL'))
    print('  ANTHROPIC_API_KEY=', '***' if env.get('ANTHROPIC_API_KEY') else '(missing)')
    print('  ANTHROPIC_MODEL=', env.get('ANTHROPIC_MODEL'))

    # Build command: default to `claude --dangerously-skip-permissions` then append passed args
    base_cmd = ['claude', '--dangerously-skip-permissions']
    cmd = base_cmd + argv

    use_shell = sys.platform.startswith('win')

    if dry_run:
        printable = ' '.join(shlex.quote(p) for p in cmd) if not use_shell else ' '.join(cmd)
        print('\n[DRY RUN] Command to run:')
        print(' ', printable)
        print('\n[DRY RUN] Environment overrides printed above. Exiting without running.')
        return 0

    # Spawn child process
    try:
        # On Windows, running via shell=True helps resolve .cmd/.exe in PATH similar to node's spawn
        proc = subprocess.Popen(cmd, env=env, shell=use_shell)
    except FileNotFoundError as e:
        print('Failed to start claude:', str(e), file=sys.stderr)
        return 1
    except Exception as e:
        print('Failed to start claude:', str(e), file=sys.stderr)
        return 1

    # Setup signal forwarding
    def _forward(signum, frame):
        try:
            if proc.poll() is None:
                # Send same signal to child
                proc.send_signal(signum)
        except Exception:
            pass

    for sig in ('SIGINT', 'SIGTERM', 'SIGHUP'):
        if hasattr(signal, sig):
            signal.signal(getattr(signal, sig), _forward)

    try:
        exit_code = proc.wait()
    except KeyboardInterrupt:
        # If parent is interrupted, ensure child is killed and re-raise to set exit code
        try:
            proc.kill()
        except Exception:
            pass
        raise

    # If process was terminated by signal, on POSIX return 128 + signum convention
    if exit_code < 0:
        signum = -exit_code
        print(f'claude process terminated with signal {signum}')
        # Mirror signal by exiting with 128+signum where appropriate
        # On Windows negative exit codes are uncommon; still follow POSIX convention
        return 128 + signum
    else:
        print(f'claude exited with code {exit_code}')
        return exit_code


if __name__ == '__main__':
    try:
        code = main(sys.argv[1:])
    except KeyboardInterrupt:
        # Translate to exit like Node did when receiving signals
        sys.exit(130)
    sys.exit(code or 0)
