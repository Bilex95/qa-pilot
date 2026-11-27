"""API-069 to API-072 (I-05): comments. Happy, invalid, forbidden and cross tenant for every endpoint, plus the rules on top
(Viewers comment, nobody edits another person's words, only an Org Admin deletes any, soft delete, counts, audit).
Unauthorized and the generic cross tenant org check are covered for every route by app/core/tests/test_contract.py."""

import uuid

import pytest
from sqlalchemy import select

from app.modules.audit.infrastructure.models import AuditEvent
from app.modules.bugs.tests.test_bugs_api import ALL_ROLES, code, make_bug, make_project

O = "/api/v1/orgs"


def url(tenant, bug, tail="comments"):  # type: ignore[no-untyped-def]
    return f"{O}/{tenant.org.id}/bugs/{bug['id']}/{tail}"


def comment_url(tenant, comment):  # type: ignore[no-untyped-def]
    return f"{O}/{tenant.org.id}/comments/{comment['id']}"


def say(client, tenant, bug, text, role="qa_engineer"):  # type: ignore[no-untyped-def]
    r = client.post(url(tenant, bug), json={"body": text}, headers=tenant.h(role))
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture()
def bug(client, world):  # type: ignore[no-untyped-def]
    return make_bug(client, world.a, make_project(client, world.a))


# API-070 add -------------------------------------------------------------------------------

@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_role_comments_viewers_included(client, world, bug, role) -> None:
    made = say(client, world.a, bug, "Seen on staging too.", role=role)
    assert made["body"] == "Seen on staging too." and made["bug_id"] == bug["id"] and made["edited_at"] is None
    assert made["author_id"] == str(world.a.users[role].id) and made["author_name"] == f"{role} a"


def test_a_comment_is_plain_text_with_line_breaks_kept_as_written(client, world, bug) -> None:
    text = "Line one\n\nLine two <b>not bold</b> & more"
    assert say(client, world.a, bug, f"  {text}  ")["body"] == text  # trimmed at the ends only, never rewritten


@pytest.mark.parametrize("body", ["", "   \n  ", "x" * 5001])
def test_a_comment_of_one_to_5000_characters_only(client, world, bug, body) -> None:
    r = client.post(url(world.a, bug), json={"body": body}, headers=world.a.h("viewer"))
    assert r.status_code == 422 and code(r) == "validation_error"


def test_5000_characters_are_accepted(client, world, bug) -> None:
    assert len(say(client, world.a, bug, "x" * 5000)["body"]) == 5000


def test_unknown_fields_and_a_missing_body_are_refused(client, world, bug) -> None:
    assert client.post(url(world.a, bug), json={}, headers=world.a.h("qa_lead")).status_code == 422
    assert client.post(url(world.a, bug), json={"body": "ok", "author_id": str(uuid.uuid4())},
                       headers=world.a.h("qa_lead")).status_code == 422


def test_commenting_on_a_bug_that_is_gone_or_foreign_is_a_404(client, world, bug) -> None:
    assert client.post(url(world.a, {"id": str(uuid.uuid4())}), json={"body": "hi"}, headers=world.a.h("qa_lead")).status_code == 404
    foreign = make_bug(client, world.b, make_project(client, world.b))
    r = client.post(url(world.a, foreign), json={"body": "hi"}, headers=world.a.h("org_admin"))
    assert r.status_code == 404 and code(r) == "not_found"
    client.delete(f"{O}/{world.a.org.id}/bugs/{bug['id']}", headers=world.a.h("qa_lead"))
    assert client.post(url(world.a, bug), json={"body": "hi"}, headers=world.a.h("qa_lead")).status_code == 404


# API-069 list ------------------------------------------------------------------------------

def test_comments_are_listed_newest_first_with_names_and_a_page(client, world, bug) -> None:
    for i in range(3):
        say(client, world.a, bug, f"comment {i}", role=["qa_engineer", "developer", "viewer"][i])
    page = client.get(url(world.a, bug), headers=world.a.h("viewer")).json()
    assert [c["body"] for c in page["items"]] == ["comment 2", "comment 1", "comment 0"]
    assert [c["author_name"] for c in page["items"]] == ["viewer a", "developer a", "qa_engineer a"]
    assert page["total"] == 3 and page["page"] == 1
    second = client.get(url(world.a, bug), params={"page": 2, "page_size": 2}, headers=world.a.h("viewer")).json()
    assert [c["body"] for c in second["items"]] == ["comment 0"] and second["total"] == 3
    assert client.get(url(world.a, bug), params={"page_size": 101}, headers=world.a.h("viewer")).status_code == 422


def test_listing_comments_of_another_orgs_bug_is_a_404(client, world) -> None:
    foreign = make_bug(client, world.b, make_project(client, world.b))
    assert client.get(url(world.a, foreign), headers=world.a.h("org_admin")).status_code == 404


def test_the_bug_detail_counts_comments(client, world, bug) -> None:
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['key']}", headers=world.a.h("viewer")).json()["comment_count"] == 0
    first = say(client, world.a, bug, "one")
    say(client, world.a, bug, "two", role="viewer")
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['key']}", headers=world.a.h("viewer")).json()["comment_count"] == 2
    client.delete(comment_url(world.a, first), headers=world.a.h("qa_engineer"))
    assert client.get(f"{O}/{world.a.org.id}/bugs/{bug['key']}", headers=world.a.h("viewer")).json()["comment_count"] == 1


# API-071 edit ------------------------------------------------------------------------------

@pytest.mark.parametrize("role", ALL_ROLES)
def test_everyone_edits_their_own_comment(client, world, bug, role) -> None:
    mine = say(client, world.a, bug, "first words", role=role)
    r = client.patch(comment_url(world.a, mine), json={"body": "better words"}, headers=world.a.h(role))
    assert r.status_code == 200 and r.json()["body"] == "better words" and r.json()["edited_at"] is not None


@pytest.mark.parametrize("role", ["org_admin", "qa_lead", "qa_engineer", "developer", "viewer"])
def test_nobody_edits_another_persons_comment_an_org_admin_included(client, world, bug, role) -> None:
    theirs = say(client, world.a, bug, "not yours", role="qa_engineer" if role != "qa_engineer" else "developer")
    r = client.patch(comment_url(world.a, theirs), json={"body": "hijacked"}, headers=world.a.h(role))
    assert r.status_code == 403 and code(r) == "forbidden"
    assert client.get(url(world.a, bug), headers=world.a.h("viewer")).json()["items"][0]["body"] == "not yours"


def test_saving_the_same_words_is_not_an_edit(client, world, bug) -> None:
    mine = say(client, world.a, bug, "same")
    r = client.patch(comment_url(world.a, mine), json={"body": "same"}, headers=world.a.h("qa_engineer"))
    assert r.status_code == 200 and r.json()["edited_at"] is None


def test_an_edit_is_validated_like_a_new_comment(client, world, bug) -> None:
    mine = say(client, world.a, bug, "words")
    for body in ["", "  ", "x" * 5001]:
        assert client.patch(comment_url(world.a, mine), json={"body": body}, headers=world.a.h("qa_engineer")).status_code == 422


def test_editing_a_missing_or_foreign_comment_is_a_404(client, world, bug) -> None:
    assert client.patch(f"{O}/{world.a.org.id}/comments/{uuid.uuid4()}", json={"body": "x"},
                        headers=world.a.h("qa_lead")).status_code == 404
    foreign_bug = make_bug(client, world.b, make_project(client, world.b))
    theirs = say(client, world.b, foreign_bug, "secret", role="qa_lead")
    r = client.patch(f"{O}/{world.a.org.id}/comments/{theirs['id']}", json={"body": "x"}, headers=world.a.h("org_admin"))
    assert r.status_code == 404 and code(r) == "not_found"


# API-072 delete ----------------------------------------------------------------------------

@pytest.mark.parametrize("role", ALL_ROLES)
def test_everyone_deletes_their_own_comment(client, world, bug, role) -> None:
    mine = say(client, world.a, bug, "oops", role=role)
    assert client.delete(comment_url(world.a, mine), headers=world.a.h(role)).status_code == 204
    assert client.get(url(world.a, bug), headers=world.a.h("viewer")).json()["total"] == 0
    assert client.delete(comment_url(world.a, mine), headers=world.a.h(role)).status_code == 404  # already gone


def test_only_an_org_admin_deletes_someone_elses_comment(client, world, bug, db) -> None:
    for role in ["qa_lead", "qa_engineer", "developer", "viewer"]:
        theirs = say(client, world.a, bug, f"words of someone else {role}", role="qa_engineer" if role == "developer" else "developer")
        assert client.delete(comment_url(world.a, theirs), headers=world.a.h(role)).status_code == 403, role
    assert client.get(url(world.a, bug), headers=world.a.h("viewer")).json()["total"] == 4
    target = client.get(url(world.a, bug), headers=world.a.h("viewer")).json()["items"][0]
    assert client.delete(comment_url(world.a, target), headers=world.a.h("org_admin")).status_code == 204
    event = db.scalar(select(AuditEvent).where(AuditEvent.action == "comment.deleted"))
    assert event is not None and event.entity_id == target["id"] and event.data["key"] == bug["key"]
    assert event.actor_id == world.a.users["org_admin"].id and event.data["author_id"] == target["author_id"]
    assert "words" not in str(event.data)  # the audit trail names the comment, it does not copy what was said


def test_deleting_a_foreign_comment_is_a_404_and_changes_nothing(client, world) -> None:
    foreign_bug = make_bug(client, world.b, make_project(client, world.b))
    theirs = say(client, world.b, foreign_bug, "secret", role="qa_lead")
    r = client.delete(f"{O}/{world.a.org.id}/comments/{theirs['id']}", headers=world.a.h("org_admin"))
    assert r.status_code == 404 and code(r) == "not_found"
    assert client.get(url(world.b, foreign_bug), headers=world.b.h("viewer")).json()["total"] == 1
