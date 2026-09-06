import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import install  # noqa: E402


class AssetTests(unittest.TestCase):
    """Every name here is one release.yml uploads; a mismatch is a 404 for
    every user on that platform, which no other test would catch."""

    def test_matches_the_release_matrix(self):
        cases = {
            ("linux", "x86_64"): "rust-fmt-mf-linux-x64",
            ("linux", "aarch64"): "rust-fmt-mf-linux-arm64",
            ("darwin", "x86_64"): "rust-fmt-mf-darwin-x64",
            ("darwin", "arm64"): "rust-fmt-mf-darwin-arm64",
            ("win32", "AMD64"): "rust-fmt-mf-win32-x64.exe",
            ("win32", "ARM64"): "rust-fmt-mf-win32-arm64.exe",
        }
        for (sys_platform, machine), expected in cases.items():
            tag = install.platform_tag(sys_platform, machine)
            self.assertEqual(install.asset_name(tag), expected)

    def test_unsupported_architecture(self):
        with self.assertRaises(install.InstallError):
            install.platform_tag("linux", "riscv64")

    def test_unsupported_operating_system(self):
        with self.assertRaises(install.InstallError):
            install.platform_tag("freebsd", "x86_64")


class VerifyTests(unittest.TestCase):
    def setUp(self):
        handle, path = tempfile.mkstemp()
        with os.fdopen(handle, "wb") as binary:
            binary.write(b"not really a binary")
        self.path = path
        self.digest = install.sha256_of(path)
        self.addCleanup(os.unlink, path)

    def test_accepts_a_bare_hash(self):
        install.verify(self.path, self.digest + "\n")

    def test_accepts_the_sha256sum_format(self):
        install.verify(self.path, self.digest + "  rust-fmt-mf-linux-x64\n")

    def test_accepts_an_uppercase_hash(self):
        install.verify(self.path, self.digest.upper())

    def test_rejects_a_mismatch(self):
        with self.assertRaises(install.InstallError):
            install.verify(self.path, "0" * 64)

    def test_rejects_an_empty_checksum_file(self):
        with self.assertRaises(install.InstallError):
            install.verify(self.path, "\n")


class PathHintTests(unittest.TestCase):
    BIN = "/home/me/.local/bin"

    def test_fish(self):
        self.assertIn("fish_add_path", install.path_hint(self.BIN, "/usr/bin/fish"))

    def test_zsh(self):
        self.assertIn("~/.zshrc", install.path_hint(self.BIN, "/bin/zsh"))

    def test_unset_shell_falls_back_instead_of_failing(self):
        self.assertIn("~/.bashrc", install.path_hint(self.BIN, ""))


class SameDirTests(unittest.TestCase):
    def test_trailing_separator(self):
        self.assertTrue(install.same_dir("/home/me/.local/bin/", "/home/me/.local/bin"))

    def test_different_directories(self):
        self.assertFalse(install.same_dir("/usr/bin", "/home/me/.local/bin"))


if __name__ == "__main__":
    unittest.main()
