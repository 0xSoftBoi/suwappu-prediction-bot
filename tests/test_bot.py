import argparse
import sys
import types
import unittest


# Unit-test the repository's pure read-side analysis without requiring the SDK
# package. CI separately installs/imports the pinned SDK as its compatibility gate.
if "suwappu" not in sys.modules:
    suwappu_stub = types.ModuleType("suwappu")
    suwappu_stub.create_client = lambda **_: None
    sys.modules["suwappu"] = suwappu_stub

import bot


class ReadCountTests(unittest.TestCase):
    def test_accepts_bounded_counts(self) -> None:
        self.assertEqual(bot.bounded_count("1"), 1)
        self.assertEqual(bot.bounded_count("100"), 100)

    def test_rejects_bad_counts(self) -> None:
        for value in ("0", "101", "2.5", "-1", "nope"):
            with self.assertRaises(argparse.ArgumentTypeError):
                bot.bounded_count(value)


class SnapshotTests(unittest.TestCase):
    def test_builds_market_health_without_inventing_execution(self) -> None:
        snapshot = bot.build_market_health_snapshot(
            {
                "id": "market-1",
                "question": "Will the example happen?",
                "active": True,
                "end_date": "2027-01-01T00:00:00Z",
                "volume": 125000,
                "liquidity": 20000,
            },
            {
                "outcomes": [
                    {
                        "outcome": "Yes",
                        "tokenId": "yes-token",
                        "bids": [
                            {"price": "0.40", "size": "10"},
                            {"price": "0.42", "size": "5"},
                        ],
                        "asks": [
                            {"price": "0.47", "size": "3"},
                            {"price": "0.46", "size": "2"},
                        ],
                    }
                ]
            },
            {"prices": [{"outcome": "Yes", "tokenId": "yes-token", "mid": "0.44"}]},
            {"trades": [{"timestamp": "2026-08-07T12:00:00Z"}]},
            "2026-08-07T12:01:00Z",
        )

        self.assertEqual(snapshot["outcomes"][0]["bestBid"], 0.42)
        self.assertEqual(snapshot["outcomes"][0]["bestAsk"], 0.46)
        self.assertEqual(snapshot["outcomes"][0]["spread"], 0.04)
        self.assertEqual(snapshot["outcomes"][0]["bidDepthWithinOneCentShares"], 5)
        self.assertEqual(snapshot["outcomes"][0]["askDepthWithinOneCentShares"], 5)
        self.assertEqual(snapshot["recentTrades"]["count"], 1)
        self.assertEqual(snapshot["warnings"], [])


if __name__ == "__main__":
    unittest.main()
