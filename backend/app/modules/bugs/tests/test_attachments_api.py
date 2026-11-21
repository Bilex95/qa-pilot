"""API-073 to API-076 (I-05): attachments. Happy, invalid, forbidden and cross tenant for every endpoint, plus the rules on top
(D-009 limits, type by extension and by the first bytes, random storage names, authenticated download, ownership on delete).
Files go to a temporary folder. Unauthorized and the generic cross tenant org check are covered for every route by
app/core/tests/test_contract.py."""

import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.bugs.domain import attachments as rules
from app.modules.bugs.tests.test_bugs_api import ALL_ROLES, code, make_bug, make_project

O = "/api/v1/orgs"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF = b"%PDF-1.7\n" + b"x" * 64
UPLOADERS = ["org_admin", "qa_lead", "qa_engineer", "developer"]


@pytest.fixture(autouse=True)
def uploads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path))
    return tmp_path


@pytest.fixture()
def bug(client, world):  # type: ignore[no-untyped-def]
    return make_bug(client, world.a, make_project(client, world.a))


def url(tenant, bug, tail="attachments"):  # type: ignore[no-untyped-def]
    return f"{O}/{tenant.org.id}/bugs/{bug['id']}/{tail}"


def attach(client, tenant, bug, name="screen.png", data=PNG, role="qa_engineer", content_type="application/octet-stream"):  # type: ignore[no-untyped-def]
    return client.post(url(tenant, bug), files={"file": (name, data, content_type)}, headers=tenant.h(role))


def upload(client, tenant, bug, **kw):  # type: ignore[no-untyped-def]
    r = attach(client, tenant, bug, **kw)
    assert r.status_code == 201, r.text
    return r.json()


def files_on_disk(root: Path) -> list[Path]:
    return [p for p in root.rglob("*") if p.is_file()]


# API-074 upload ----------------------------------------------------------------------------

@pytest.mark.parametrize("role", UPLOADERS)
def test_everyone_but_a_viewer_uploads(client, world, bug, role) -> None:
    made = upload(client, world.a, bug, role=role)
    assert made["filename"] == "screen.png" and made["content_type"] == "image/png" and made["size_bytes"] == len(PNG)
    assert made["uploaded_by_id"] == str(world.a.users[role].id) and made["uploaded_by_name"] == f"{role} a"
    assert made["bug_id"] == bug["id"] and set(made) == {"id", "bug_id", "filename", "content_type", "size_bytes",
                                                          "uploaded_by_id", "uploaded_by_name", "created_at"}


def test_a_viewer_cannot_upload_but_a_viewer_can_comment_and_read(client, world, bug) -> None:
    r = attach(client, world.a, bug, role="viewer")
    assert r.status_code == 403 and code(r) == "forbidden"
    assert client.get(url(world.a, bug), headers=world.a.h("viewer")).json() == []


@pytest.mark.parametrize(("name", "data"), [
    ("shot.png", PNG), ("photo.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 16), ("photo.JPEG", b"\xff\xd8\xff\xdb" + b"\x00" * 16),
    ("anim.gif", b"GIF89a" + b"\x00" * 16), ("pic.webp", b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 16),
    ("report.pdf", PDF), ("notes.txt", "Plain notes with accents: é ü ñ\n".encode()), ("app.log", b"2026-11-22 ERROR boom\n"),
    ("data.json", b'{"a": 1}'), ("rows.csv", b"a,b\n1,2\n"), ("bundle.zip", b"PK\x03\x04" + b"\x00" * 16),
    ("clip.mp4", b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 16), ("clip.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 16),
])
def test_every_allowed_type_is_accepted(client, world, bug, name, data) -> None:
    made = upload(client, world.a, bug, name=name, data=data)
    assert made["content_type"] == rules.TYPES[name.rsplit(".", 1)[1].lower()]


def test_the_content_type_comes_from_the_extension_not_from_the_browser(client, world, bug) -> None:
    made = upload(client, world.a, bug, name="notes.txt", data=b"hello", content_type="text/html")
    assert made["content_type"] == "text/plain"


@pytest.mark.parametrize(("name", "data"), [
    ("tool.exe", b"MZ\x90\x00"), ("page.html", b"<html><script>alert(1)</script></html>"), ("logo.svg", b"<svg onload=alert(1)>"),
    ("script.js", b"alert(1)"), ("noextension", PNG), (".png", PNG), ("shot.png.exe", PNG),
    ("fake.png", PDF), ("fake.pdf", PNG), ("fake.jpg", b"GIF89a" + b"\x00" * 8), ("fake.zip", b"%PDF-1.4 not a zip"),
    ("fake.mp4", b"not a video at all"), ("binary.txt", b"abc\x00def"), ("latin1.csv", b"caf\xe9,1\n"),
    ("fake.webp", b"RIFF\x24\x00\x00\x00WAVEfmt "),
])
def test_other_types_and_files_that_are_not_what_their_name_says_are_415(client, world, bug, name, data) -> None:
    r = attach(client, world.a, bug, name=name, data=data)
    assert r.status_code == 415 and code(r) == "unsupported_type", (name, r.text)
    assert client.get(url(world.a, bug), headers=world.a.h("viewer")).json() == []


def test_a_file_over_10_mb_is_413_and_exactly_10_mb_is_fine(client, world, bug, uploads) -> None:
    limit = 10 * 1024 * 1024
    r = attach(client, world.a, bug, data=PNG + b"\x00" * (limit - len(PNG) + 1))
    assert r.status_code == 413 and code(r) == "file_too_large"
    assert files_on_disk(uploads) == []
    assert upload(client, world.a, bug, data=PNG + b"\x00" * (limit - len(PNG)))["size_bytes"] == limit


def test_an_empty_file_and_a_missing_file_are_422(client, world, bug) -> None:
    assert attach(client, world.a, bug, name="empty.txt", data=b"").status_code == 422
    r = client.post(url(world.a, bug), data={"note": "no file here"}, headers=world.a.h("qa_lead"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_the_eleventh_file_is_409_too_many_files(client, world, bug) -> None:
    for i in range(rules.MAX_FILES_PER_BUG):
        upload(client, world.a, bug, name=f"shot{i}.png")
    r = attach(client, world.a, bug, name="one-too-many.png")
    assert r.status_code == 409 and code(r) == "too_many_files"
    other = make_bug(client, world.a, make_project(client, world.a, key="API"), title="A different bug")
    assert attach(client, world.a, other).status_code == 201  # the limit is per bug


def test_a_name_with_folders_is_cleaned_and_the_stored_name_is_random(client, world, bug, uploads) -> None:
    made = upload(client, world.a, bug, name="../../etc/passwd.txt", data=b"root")
    assert made["filename"] == "passwd.txt"
    made2 = upload(client, world.a, bug, name="C:\\Users\\me\\desktop\\shot.png")
    assert made2["filename"] == "shot.png"
    stored = files_on_disk(uploads)
    assert len(stored) == 2 and all(p.parent.name == str(world.a.org.id) for p in stored)
    assert all(p.name not in {"passwd.txt", "shot.png"} and len(p.name) == 32 for p in stored)


def test_a_very_long_name_is_cut_and_keeps_its_extension(client, world, bug) -> None:
    made = upload(client, world.a, bug, name="a" * 400 + ".png")
    assert len(made["filename"]) == 255 and made["filename"].endswith(".png")


def test_uploading_to_a_foreign_or_missing_bug_is_a_404_and_stores_nothing(client, world, bug, uploads) -> None:
    foreign = make_bug(client, world.b, make_project(client, world.b))
    r = attach(client, world.a, foreign, role="org_admin")
    assert r.status_code == 404 and code(r) == "not_found"
    assert attach(client, world.a, {"id": str(uuid.uuid4())}).status_code == 404
    client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("qa_lead"))
    assert attach(client, world.a, bug).status_code == 404
    assert files_on_disk(uploads) == []


def test_an_upload_writes_an_audit_event_and_a_timeline_entry(client, world, bug, db) -> None:
    made = upload(client, world.a, bug, name="shot.png")
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "attachment.uploaded"))
    assert event is not None and event.entity_id == made["id"] and event.org_id == world.a.org.id
    assert event.data["filename"] == "shot.png" and event.data["key"] == bug["key"] and event.data["size_bytes"] == len(PNG)
    trail = client.get(url(world.a, bug, "activity"), headers=world.a.h("viewer")).json()["items"]
    assert trail[0]["kind"] == "attachment_added" and trail[0]["new_value"] == "shot.png"


# API-073 list ------------------------------------------------------------------------------

def test_attachments_are_listed_oldest_first_for_every_role(client, world, bug) -> None:
    upload(client, world.a, bug, name="one.png")
    upload(client, world.a, bug, name="two.pdf", data=PDF, role="developer")
    for role in ALL_ROLES:
        items = client.get(url(world.a, bug), headers=world.a.h(role)).json()
        assert [a["filename"] for a in items] == ["one.png", "two.pdf"], role
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['key']}", headers=world.a.h("viewer")).json()["attachment_count"] == 2


def test_listing_the_files_of_a_foreign_bug_is_a_404(client, world) -> None:
    foreign = make_bug(client, world.b, make_project(client, world.b))
    assert client.get(url(world.a, foreign), headers=world.a.h("org_admin")).status_code == 404


# API-075 download --------------------------------------------------------------------------

@pytest.mark.parametrize("role", ALL_ROLES)
def test_everyone_downloads_and_the_headers_force_a_save(client, world, bug, role) -> None:
    made = upload(client, world.a, bug, name="Checkout summary.pdf", data=PDF)
    r = client.get(f"{O}/{world.a.org.id}/attachments/{made['id']}/download", headers=world.a.h(role))
    assert r.status_code == 200 and r.content == PDF
    assert r.headers["content-disposition"].startswith("attachment;") and "Checkout%20summary.pdf" in r.headers["content-disposition"]
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["cache-control"] == "private, no-store"


def test_a_text_file_is_never_served_as_html(client, world, bug) -> None:
    made = upload(client, world.a, bug, name="notes.txt", data=b"<script>alert(1)</script>")
    r = client.get(f"{O}/{world.a.org.id}/attachments/{made['id']}/download", headers=world.a.h("viewer"))
    assert r.headers["content-type"].startswith("text/plain") and r.headers["content-disposition"].startswith("attachment")


def test_a_download_needs_a_token(client, world, bug) -> None:
    made = upload(client, world.a, bug)
    assert client.get(f"{O}/{world.a.org.id}/attachments/{made['id']}/download").status_code == 401


def test_another_orgs_file_is_a_404_through_every_path(client, world) -> None:
    foreign_bug = make_bug(client, world.b, make_project(client, world.b))
    theirs = upload(client, world.b, foreign_bug, role="qa_lead")
    r = client.get(f"{O}/{world.a.org.id}/attachments/{theirs['id']}/download", headers=world.a.h("org_admin"))
    assert r.status_code == 404 and code(r) == "not_found"
    assert client.delete(f"{O}/{world.a.org.id}/attachments/{theirs['id']}", headers=world.a.h("org_admin")).status_code == 404
    assert client.get(f"{O}/{world.b.org.id}/attachments/{theirs['id']}/download", headers=world.b.h("viewer")).status_code == 200


def test_a_missing_file_on_disk_is_a_404_not_a_crash(client, world, bug, uploads) -> None:
    made = upload(client, world.a, bug)
    for p in files_on_disk(uploads):
        p.unlink()
    assert client.get(f"{O}/{world.a.org.id}/attachments/{made['id']}/download", headers=world.a.h("viewer")).status_code == 404


def test_a_missing_attachment_id_is_a_404(client, world) -> None:
    assert client.get(f"{O}/{world.a.org.id}/attachments/{uuid.uuid4()}/download", headers=world.a.h("viewer")).status_code == 404


def test_the_files_of_a_deleted_bug_cannot_be_downloaded(client, world, bug) -> None:
    made = upload(client, world.a, bug)
    client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("qa_lead"))
    assert client.get(f"{O}/{world.a.org.id}/attachments/{made['id']}/download", headers=world.a.h("viewer")).status_code == 404


# API-076 delete ----------------------------------------------------------------------------

@pytest.mark.parametrize("role", ["qa_engineer", "developer"])
def test_qa_engineer_and_developer_delete_their_own_file(client, world, bug, uploads, role) -> None:
    made = upload(client, world.a, bug, role=role)
    assert len(files_on_disk(uploads)) == 1
    assert client.delete(f"{O}/{world.a.org.id}/attachments/{made['id']}", headers=world.a.h(role)).status_code == 204
    assert client.get(url(world.a, bug), headers=world.a.h("viewer")).json() == [] and files_on_disk(uploads) == []


@pytest.mark.parametrize("role", ["qa_engineer", "developer", "viewer"])
def test_those_roles_cannot_delete_someone_elses_file(client, world, bug, uploads, role) -> None:
    made = upload(client, world.a, bug, role="qa_lead")
    r = client.delete(f"{O}/{world.a.org.id}/attachments/{made['id']}", headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"
    assert len(files_on_disk(uploads)) == 1 and len(client.get(url(world.a, bug), headers=world.a.h("viewer")).json()) == 1


@pytest.mark.parametrize("role", ["org_admin", "qa_lead"])
def test_leads_delete_any_file(client, world, bug, uploads, db, role) -> None:
    made = upload(client, world.a, bug, role="developer")
    assert client.delete(f"{O}/{world.a.org.id}/attachments/{made['id']}", headers=world.a.h(role)).status_code == 204
    assert files_on_disk(uploads) == []
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "attachment.deleted"))
    assert event is not None and event.entity_id == made["id"] and event.actor_id == world.a.users[role].id
    assert event.data["filename"] == "screen.png"
    trail = client.get(url(world.a, bug, "activity"), headers=world.a.h("viewer")).json()["items"]
    assert trail[0]["kind"] == "attachment_removed" and trail[0]["old_value"] == "screen.png"


def test_deleting_twice_is_a_404_and_a_slot_is_freed(client, world, bug) -> None:
    ids = [upload(client, world.a, bug, name=f"s{i}.png")["id"] for i in range(rules.MAX_FILES_PER_BUG)]
    assert attach(client, world.a, bug).status_code == 409
    assert client.delete(f"{O}/{world.a.org.id}/attachments/{ids[0]}", headers=world.a.h("qa_engineer")).status_code == 204
    assert client.delete(f"{O}/{world.a.org.id}/attachments/{ids[0]}", headers=world.a.h("qa_engineer")).status_code == 404
    assert attach(client, world.a, bug).status_code == 201


# The pure rules ----------------------------------------------------------------------------

def test_clean_filename_drops_folders_and_control_characters() -> None:
    assert rules.clean_filename("../../a/b\\c.txt") == "c.txt"
    assert rules.clean_filename("we\x00ird\x07name.png") == "weirdname.png"
    assert rules.clean_filename("  spaced name .log  ") == "spaced name .log"
    assert rules.clean_filename("") == ""


def test_a_multi_byte_character_cut_at_the_end_of_the_sample_is_still_text() -> None:
    sample = ("é" * 5000).encode()[: rules.SNIFF_BYTES - 1]  # an odd length ends inside a two byte character
    assert len(sample) % 2 == 1 and rules.check("long.txt", sample) is not None
