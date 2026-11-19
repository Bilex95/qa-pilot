"""I-24: the backend fails fast with a clear message when `db` does not resolve, after a retry window."""

import socket

import pytest

from app.core import db_preflight
from app.core.db_preflight import wait_for_host


class FakeTime:
    """A clock and a sleep that advance together, so the 30 second window runs instantly."""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def clock(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def test_resolves_on_the_first_try() -> None:
    t = FakeTime()
    assert wait_for_host("db", 5432, resolve=lambda *a: None, sleep=t.sleep, clock=t.clock) == (True, 1)
    assert t.sleeps == []


def test_retries_until_the_host_resolves() -> None:
    t = FakeTime()
    calls = {"n": 0}

    def resolve(*_: object) -> None:
        calls["n"] += 1
        if calls["n"] < 4:
            raise socket.gaierror("Temporary failure in name resolution")

    assert wait_for_host("db", 5432, resolve=resolve, sleep=t.sleep, clock=t.clock) == (True, 4)
    assert t.sleeps == [1.0, 1.0, 1.0]


def test_gives_up_after_about_thirty_seconds() -> None:
    t = FakeTime()

    def resolve(*_: object) -> None:
        raise socket.gaierror("Name or service not known")

    resolved, attempts = wait_for_host("db", 5432, resolve=resolve, sleep=t.sleep, clock=t.clock)
    assert resolved is False
    assert 30 <= t.now <= 31 and attempts == 31


def test_main_prints_a_clear_message_and_fails(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:secret@db:5432/app")
    monkeypatch.setattr(db_preflight, "wait_for_host", lambda host, port: (False, 31))
    assert db_preflight.main() == 1
    err = capsys.readouterr().err
    assert "host 'db' does not resolve after 30 s" in err and "--force-recreate" in err
    assert "secret" not in err  # never echo the password from the URL


def test_main_succeeds_and_stays_quiet_when_it_resolves_at_once(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@db:5432/app")
    monkeypatch.setattr(db_preflight, "wait_for_host", lambda host, port: (True, 1))
    assert db_preflight.main() == 0
    assert capsys.readouterr().out == ""


@pytest.mark.parametrize("url", ["", "not a url", "sqlite://"])
def test_main_rejects_an_unusable_url(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str], url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", url)
    assert db_preflight.main() == 1
    assert "DATABASE_URL" in capsys.readouterr().err
