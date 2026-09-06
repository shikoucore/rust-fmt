#!/usr/bin/env python3
"""Install rust-fmt-mf, the standalone macro formatter, so Vim and Neovim find
it on PATH. The VS Code extension bundles its own copy and needs none of this.

    curl -fsSL https://raw.githubusercontent.com/vremyavnikuda/rust-fmt/main/install.py | python3 -
    irm https://raw.githubusercontent.com/vremyavnikuda/rust-fmt/main/install.py | python -

    RUSTFMT_MF_VERSION=v0.1.12    pin a release instead of the latest one
    RUSTFMT_MF_BIN_DIR=/some/dir  install somewhere other than ~/.local/bin

One file rather than a shell script per platform: the download, the hash and
the Windows registry access are all in the standard library, so the platforms
differ in a handful of branches instead of two separate implementations that
drift apart. Python 3.8 or newer, nothing to install.
"""

import hashlib
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

REPO = "vremyavnikuda/rust-fmt"
NAME = "rust-fmt-mf"


class InstallError(Exception):
    """Something the user can act on, reported without a traceback."""


def platform_tag(sys_platform, machine):
    """The release asset suffix, matching the build matrix in release.yml."""
    arch = {
        "AMD64": "x64",
        "amd64": "x64",
        "x86_64": "x64",
        "ARM64": "arm64",
        "arm64": "arm64",
        "aarch64": "arm64",
    }.get(machine)
    if arch is None:
        raise InstallError("unsupported architecture " + machine)
    if sys_platform not in ("win32", "darwin", "linux"):
        raise InstallError("unsupported operating system " + sys_platform)
    return sys_platform + "-" + arch


def asset_name(tag):
    return NAME + "-" + tag + (".exe" if tag.startswith("win32") else "")


def detect_machine():
    machine = platform.machine()
    # A 32-bit Python on 64-bit Windows reports the architecture of its own
    # process; PROCESSOR_ARCHITEW6432 carries the machine's.
    if sys.platform == "win32" and machine.lower() in ("x86", "i386", "i686"):
        machine = os.environ.get("PROCESSOR_ARCHITEW6432") or machine
    return machine


def download(url, dest):
    request = urllib.request.Request(url, headers={"User-Agent": NAME + "-install"})
    try:
        with urllib.request.urlopen(request) as response:
            with open(dest, "wb") as out:
                shutil.copyfileobj(response, out)
    except urllib.error.HTTPError as error:
        raise InstallError("cannot download %s: HTTP %d" % (url, error.code)) from None
    except OSError as error:
        raise InstallError("cannot download %s: %s" % (url, error)) from None


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, "rb") as binary:
        for chunk in iter(lambda: binary.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify(path, published):
    """Check the download against the hash published beside it.

    The hash travels the same connection as the binary, so this rules out a
    truncated or corrupted download, not a substituted one. release.yml writes
    a bare hash; the first field is taken so the sha256sum format works too.
    """
    fields = published.split()
    expected = fields[0].lower() if fields else ""
    actual = sha256_of(path)
    if actual != expected:
        raise InstallError("checksum mismatch: expected %s, got %s" % (expected, actual))


def smoke_test(binary):
    """Run the binary before installing it, so a build for the wrong
    architecture or against a newer glibc never lands on PATH.

    stdin is closed explicitly: rust-fmt-mf reads it when given no arguments,
    and under `curl | python -` that stdin is the rest of this script.
    """
    try:
        finished = subprocess.run(
            [str(binary), "--help"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    except OSError as error:
        raise InstallError("the downloaded binary does not run: %s" % error) from None
    if finished.returncode != 0:
        detail = finished.stderr.decode("utf-8", "replace").strip()
        raise InstallError(
            "the downloaded binary does not run" + (": " + detail if detail else "")
        )


def install(staged, target):
    """Put the verified binary in place in one step.

    The copy lands next to the target so the rename stays on one filesystem and
    is therefore atomic; the temporary directory is often on another one, and a
    half-copied binary on PATH is worse than no binary at all.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    beside = target.with_name(target.name + ".new-%d" % os.getpid())
    shutil.copyfile(str(staged), str(beside))
    shutil.copymode(str(staged), str(beside))
    try:
        os.replace(str(beside), str(target))
    except OSError as error:
        beside.unlink()
        raise InstallError(
            "cannot write %s (%s); on Windows the file is locked while it runs"
            % (target, error)
        ) from None


def same_dir(left, right):
    def canonical(value):
        return os.path.normcase(os.path.normpath(os.path.expandvars(value)))

    return canonical(left) == canonical(right)


def path_hint(bin_dir, shell):
    name = os.path.basename(shell or "sh")
    if name == "fish":
        return "  fish_add_path " + bin_dir
    rc = "~/.zshrc" if name == "zsh" else "~/.bashrc"
    return "  echo 'export PATH=\"%s:$PATH\"' >> %s" % (bin_dir, rc)


def add_to_user_path(bin_dir):
    """Append bin_dir to the persistent user PATH on Windows.

    The value is read through winreg rather than the environment: the
    environment hands back a PATH with %USERPROFILE% and friends already
    expanded, and writing that back would freeze every such entry into a
    literal path. QueryValueEx returns the raw string and its type, so a
    REG_EXPAND_SZ PATH stays one.
    """
    import winreg

    with winreg.OpenKey(
        winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_READ | winreg.KEY_SET_VALUE
    ) as key:
        try:
            current, kind = winreg.QueryValueEx(key, "Path")
        except FileNotFoundError:
            current, kind = "", winreg.REG_EXPAND_SZ
        entries = [entry for entry in current.split(";") if entry]
        if any(same_dir(entry, bin_dir) for entry in entries):
            return False
        winreg.SetValueEx(key, "Path", 0, kind, ";".join(entries + [bin_dir]))
    broadcast_environment_change()
    return True


def broadcast_environment_change():
    """Tell running programs the environment moved; without it Explorer keeps
    handing the old PATH to every new terminal until the next sign-out."""
    try:
        import ctypes

        ctypes.windll.user32.SendMessageTimeoutW(
            0xFFFF, 0x001A, 0, "Environment", 0x0002, 5000, None
        )
    except Exception:
        pass


def announce_path(bin_dir):
    entries = [entry for entry in os.environ.get("PATH", "").split(os.pathsep) if entry]
    if any(same_dir(entry, bin_dir) for entry in entries):
        print("Ready: %s is on your PATH." % NAME)
        return
    print("")
    if os.name == "nt":
        added = add_to_user_path(bin_dir)
        what = "Added %s to" % bin_dir if added else "%s is already in" % bin_dir
        print("%s your PATH. Open a new terminal for it to take effect." % what)
        return
    print("%s is not on your PATH. Add it:" % bin_dir)
    print(path_hint(bin_dir, os.environ.get("SHELL", "")))


def main():
    tag = platform_tag(sys.platform, detect_machine())
    asset = asset_name(tag)
    version = os.environ.get("RUSTFMT_MF_VERSION") or "latest"
    bin_dir = os.environ.get("RUSTFMT_MF_BIN_DIR") or str(Path.home() / ".local" / "bin")
    base = (
        "https://github.com/%s/releases/latest/download" % REPO
        if version == "latest"
        else "https://github.com/%s/releases/download/%s" % (REPO, version)
    )
    target = Path(bin_dir) / (NAME + ".exe" if os.name == "nt" else NAME)

    print("Downloading %s (%s)" % (asset, version))
    tmp = Path(tempfile.mkdtemp(prefix=NAME + "-"))
    try:
        staged = tmp / asset
        download(base + "/" + asset, staged)
        checksum = tmp / (asset + ".sha256")
        try:
            download(base + "/" + asset + ".sha256", checksum)
        except InstallError:
            raise InstallError(
                "release %s publishes no %s.sha256. Releases cut before the "
                "installer carry no checksum; pin a newer one with "
                "RUSTFMT_MF_VERSION." % (version, asset)
            ) from None
        verify(staged, checksum.read_text())
        if os.name != "nt":
            staged.chmod(0o755)
        smoke_test(staged)
        install(staged, target)
    finally:
        shutil.rmtree(str(tmp), ignore_errors=True)

    print("Installed %s" % target)
    announce_path(bin_dir)


# Python compiles the whole file before running any of it, so a download cut
# short is a syntax error rather than a half-finished install.
if __name__ == "__main__":
    try:
        main()
    except InstallError as error:
        sys.exit("install: %s" % error)
    except KeyboardInterrupt:
        sys.exit(130)
