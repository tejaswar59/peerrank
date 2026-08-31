"""Unit tests for app/scoring.py — pure, no DB, no app import needed."""
from app.scoring import compute_ranking


def names(rows):
    return [r["member_id"] for r in rows]


# ---------- points formula: rank i of L earns (L - i) + 1 ----------
def test_points_formula_single_ballot():
    rows = compute_ranking([[1, 2, 3]], [1, 2, 3])
    # L=3 -> place 0:4, 1:3, 2:2
    assert [(r["member_id"], r["points"], r["rank"]) for r in rows] == [
        (1, 4, 1), (2, 3, 2), (3, 2, 3),
    ]


def test_points_accumulate_across_ballots():
    # Two identical ballots -> double points, order unchanged.
    rows = compute_ranking([[1, 2, 3], [1, 2, 3]], [1, 2, 3])
    assert [(r["member_id"], r["points"]) for r in rows] == [(1, 8), (2, 6), (3, 4)]


def test_ids_not_on_roster_are_ignored():
    rows = compute_ranking([[1, 99, 2]], [1, 2])
    assert names(rows) == [1, 2]


def test_empty_inputs():
    assert compute_ranking([], []) == []
    # Roster with no ballots: everyone 0 points, join-order fallback, shifted >= 1.
    rows = compute_ranking([], [5, 6, 7])
    assert names(rows) == [5, 6, 7]
    assert all(r["points"] >= 1 for r in rows)


# ---------- tiebreak level 1: total points ----------
def test_tiebreak_1_total_points_wins():
    # member 3 joins first but is ranked last on both ballots.
    rows = compute_ranking([[1, 2, 3], [2, 1, 3]], [3, 1, 2])
    assert names(rows)[-1] == 3


# ---------- tiebreak level 2: more high placements ----------
def test_tiebreak_2_high_placements_beats_equal_points():
    # ballots [1,2,3] and [3,2,1]: every member totals 6 points.
    # m1: one 1st + one 3rd. m3: one 3rd + one 1st. m2: two 2nds.
    # Marginal placement counts put the members with a 1st ahead of the m2.
    rows = compute_ranking([[1, 2, 3], [3, 2, 1]], [1, 2, 3])
    assert names(rows) == [1, 3, 2], "member with two 2nd places must lose to members with a 1st"


# ---------- tiebreak level 3: Copeland head-to-head ----------
def test_tiebreak_3_copeland_overrides_join_order():
    # m1 and m2 both have exactly two 1st places (identical placement vectors and
    # identical point totals), but m1 beat two distinct opponents (Copeland +2)
    # while m2 beat the same opponent twice (Copeland +1).
    # Join order deliberately puts m2 FIRST, so if Copeland were absent the
    # result would be [2, 1, ...]. Copeland must flip it.
    ballots = [[1, 3], [1, 4], [2, 3], [2, 3]]
    rows = compute_ranking(ballots, [2, 1, 3, 4])
    assert names(rows)[:2] == [1, 2], "Copeland must outrank join order"


# ---------- tiebreak level 4: rock-paper-scissors cycle -> join order ----------
CYCLE_BALLOTS = [[1, 2], [2, 3], [3, 1]]  # 1>2, 2>3, 3>1


def test_rps_cycle_collapses_to_join_order():
    rows = compute_ranking(CYCLE_BALLOTS, [1, 2, 3])
    assert names(rows) == [1, 2, 3]
    # all three tie on points and placements; only join order separates them
    rows2 = compute_ranking(CYCLE_BALLOTS, [3, 1, 2])
    assert names(rows2) == [3, 1, 2], "join order is the disclosed fallback"


def test_rps_cycle_is_deterministic_and_total():
    first = compute_ranking(CYCLE_BALLOTS, [1, 2, 3])
    for _ in range(20):
        assert compute_ranking(CYCLE_BALLOTS, [1, 2, 3]) == first
    # no ties in the output: ranks are 1..n and points strictly decreasing
    assert [r["rank"] for r in first] == [1, 2, 3]
    pts = [r["points"] for r in first]
    assert pts == sorted(pts, reverse=True) and len(set(pts)) == 3


def test_result_independent_of_ballot_order():
    import itertools
    base = compute_ranking(CYCLE_BALLOTS, [1, 2, 3])
    for perm in itertools.permutations(CYCLE_BALLOTS):
        assert compute_ranking(list(perm), [1, 2, 3]) == base


def test_display_points_always_unique_and_positive():
    # Everyone identical -> uniqueness pass must still emit distinct, >=1 points.
    rows = compute_ranking([[1, 2, 3], [1, 2, 3]], [1, 2, 3, 4, 5])
    pts = [r["points"] for r in rows]
    assert len(set(pts)) == len(pts)
    assert min(pts) >= 1
    assert pts == sorted(pts, reverse=True)


def test_display_names_passed_through():
    rows = compute_ranking([[1, 2]], [1, 2], {1: "Alice", 2: "Bob"})
    assert [r["display_name"] for r in rows] == ["Alice", "Bob"]
