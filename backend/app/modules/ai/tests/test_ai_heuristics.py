"""The plain rules of I-15: the TF-IDF duplicate search (D-013) and the keyword rules behind the mock and the fallbacks. Pure."""

import uuid

import pytest

from app.modules.ai.domain import heuristics, similarity


def ids(n: int) -> list[uuid.UUID]:
    return [uuid.UUID(int=i + 1) for i in range(n)]


# Duplicate search ----------------------------------------------------------------------------------------------------------------------------

def test_terms_are_lower_case_words_without_stop_words_plus_their_bigrams() -> None:
    assert similarity.terms("The Checkout total, IS wrong!") == ["checkout", "total", "wrong", "checkout total", "total wrong"]
    assert similarity.terms("") == [] and similarity.terms("the and of") == []


def test_the_title_counts_twice_in_the_text_of_a_bug() -> None:
    assert similarity.document("Payment fails", "500 error", ["Open checkout", "Press Pay"]) == "Payment fails Payment fails 500 error Open checkout Press Pay"


def test_an_identical_bug_scores_one_and_an_unrelated_one_is_left_out() -> None:
    a, b = ids(2)
    text = similarity.document("Checkout total ignores discount code", "The total goes up", ["Apply code"])
    found = similarity.find_duplicates(text, [(a, text), (b, "Tooltip clipped on the parcel list at narrow widths")])
    assert found == [similarity.Candidate(a, 1.0)]


def test_candidates_are_best_first_at_most_five_scores_have_two_decimals_and_the_threshold_applies() -> None:
    pool = [(u, f"checkout total wrong discount code {'extra ' * i} word{i}") for i, u in enumerate(ids(8))]
    found = similarity.find_duplicates("checkout total wrong discount code", pool)
    assert len(found) == 5 and [c.score for c in found] == sorted((c.score for c in found), reverse=True)
    assert all(similarity.MIN_SCORE <= c.score <= 1 and c.score == round(c.score, 2) for c in found)
    assert similarity.find_duplicates("checkout total", [(ids(1)[0], "payment gateway timeout in staging")]) == []


def test_equal_scores_keep_the_order_given_which_is_newest_first() -> None:
    first, second = ids(2)
    found = similarity.find_duplicates("login button broken", [(first, "login button broken"), (second, "login button broken")])
    assert [c.bug_id for c in found] == [first, second]


def test_a_rare_shared_word_counts_more_than_a_common_one() -> None:
    a, b = ids(2)
    pool = [(a, "page shows error after save"), (b, "page shows error after zeppelin")] + [(u, "page shows error after save") for u in ids(10)[2:]]
    found = similarity.find_duplicates("zeppelin page", pool)
    assert found and found[0].bug_id == b


def test_nothing_to_compare_is_an_empty_list() -> None:
    assert similarity.find_duplicates("", [(ids(1)[0], "anything")]) == []
    assert similarity.find_duplicates("the and of", [(ids(1)[0], "anything")]) == []
    assert similarity.find_duplicates("checkout total", []) == []


def test_only_the_first_two_thousand_bugs_are_read() -> None:
    pool = [(uuid.UUID(int=i + 1), "unrelated words here") for i in range(2000)] + [(uuid.UUID(int=99999), "checkout total wrong")]
    assert similarity.find_duplicates("checkout total wrong", pool) == []


# Keyword rules -----------------------------------------------------------------------------------------------------------------------------

@pytest.mark.parametrize(("text", "severity"), [
    ("App crash on start", "critical"), ("Possible DATA LOSS", "critical"), ("payment page broken", "critical"), ("Security hole", "critical"),
    ("Server error on save", "high"), ("Upload fails", "high"), ("Returns 500", "high"), ("Typo in the footer", "low"),
    ("Button alignment is off", "low"), ("The colours look dull", "medium"), ("", "medium"),
    ("Typo, but the payment fails", "critical"),  # the worst keyword wins
])
def test_severity_by_keyword(text, severity) -> None:
    assert heuristics.severity_for(text) == severity


def test_first_sentence_and_numbered_steps() -> None:
    assert heuristics.first_sentence("\n  Total is wrong after changing the address. Then it gets worse.") == "Total is wrong after changing the address."
    assert heuristics.first_sentence("x" * 500, 120) == "x" * 120 and heuristics.first_sentence("  \n ") == ""
    assert heuristics.steps_from("1. Open the cart\n2) Apply SAVE10\n- Change the address") == ["Open the cart", "Apply SAVE10", "Change the address"]
    assert heuristics.steps_from("Open the cart. Apply SAVE10. Look at the total.") == ["Open the cart.", "Apply SAVE10.", "Look at the total."]
    assert heuristics.steps_from("Total is wrong\n1. Open the cart\n2. Press Pay") == ["Open the cart", "Press Pay"]  # the title line is not a step
    assert heuristics.steps_from("Open the cart\nPress Pay") == ["Open the cart", "Press Pay"]
    assert heuristics.steps_from("") == [] and len(heuristics.steps_from("\n".join(f"step {i}" for i in range(40)))) == 20


def test_environment_hint_error_lines_and_exception_type() -> None:
    assert heuristics.environment_hint("seen on PROD yesterday") == "prod" and heuristics.environment_hint("seen in production") is None
    assert heuristics.environment_hint("device") is None  # a word that only contains "dev" is not an environment
    log = "start\nERROR failed to connect\nTraceback (most recent call last):\nKeyError: 'id'\nFATAL shutting down\nok"
    assert heuristics.error_lines(log) == ["ERROR failed to connect", "KeyError: 'id'", "FATAL shutting down"]
    assert heuristics.first_exception(log) == "KeyError" and heuristics.first_exception("all fine") is None
    assert len(heuristics.error_lines("\n".join(f"error {i}" for i in range(30)))) == 10
