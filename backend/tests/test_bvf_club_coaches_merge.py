import os
import sys
import unittest
from types import SimpleNamespace

_BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.services.bvf_club_coaches_merge import merge_club_coaches_for_carding  # noqa: E402


def _user(uid: int, name: str, bvf_coach_id=None):
    return SimpleNamespace(
        id=uid,
        name=name,
        role=SimpleNamespace(value="coach"),
        bvf_coach_id=bvf_coach_id,
        bvf_first_coach_proxy_id=None,
    )


class BvfClubCoachesMergeTests(unittest.TestCase):
    def test_dedupe_by_bvf_id(self):
        platform = [_user(1, "Анатоли Пенев", 55)]
        sek = [{"id": 55, "name": "Anatoli Penev"}]
        merged = merge_club_coaches_for_carding(platform, sek)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["id"], 1)
        self.assertEqual(merged[0]["bvf_coach_id"], 55)

    def test_dedupe_by_name(self):
        platform = [_user(2, "Гергана Кинова")]
        sek = [{"id": 77, "name": "Гергана  Кинова"}]
        merged = merge_club_coaches_for_carding(platform, sek)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["id"], 2)
        self.assertEqual(merged[0]["bvf_coach_id"], 77)

    def test_sek_only_extra_row(self):
        platform = [_user(1, "Coach A")]
        sek = [{"id": 99, "name": "Danail Petrov"}]
        merged = merge_club_coaches_for_carding(platform, sek)
        self.assertEqual(len(merged), 2)
        sek_only = [m for m in merged if m.get("sek_only")]
        self.assertEqual(len(sek_only), 1)
        self.assertFalse(sek_only[0]["selectable"])


if __name__ == "__main__":
    unittest.main()
