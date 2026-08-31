"""Command line entry point.

  python -m fleet_analytics ingest --file data/raw/fleet_raw_sample.xlsx
  python -m fleet_analytics analyze
  python -m fleet_analytics report [--out data/exports]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .db import REPO_ROOT, get_engine


def _cmd_ingest(args) -> int:
    from .ingest import ValidationError, ingest_file

    path = Path(args.file)
    if not path.is_absolute():
        path = REPO_ROOT / path
    if not path.exists():
        print(f"file not found: {path}", file=sys.stderr)
        return 2
    try:
        counts = ingest_file(get_engine(), path)
    except ValidationError as e:
        print(f"INGEST REJECTED — {e}", file=sys.stderr)
        return 1
    print("ingested:", json.dumps(counts))
    return 0


def _cmd_analyze(args) -> int:
    from .metrics import compute_all, load_frames

    metrics = compute_all(load_frames(get_engine()))
    k = metrics["fleet_kpis"]
    print(f"As of {metrics['as_of']}  ({k['assets']} assets)")
    print(f"  avg utilization      {k['avg_utilization_pct']} %")
    print(f"  avg availability      {k['avg_availability_pct']} %")
    print(f"  fuel cost/engine-hr   ${k['avg_fuel_cost_per_engine_hour']}")
    print(f"  unplanned downtime    {k['total_unplanned_downtime_hours']} h (30d)")
    print(f"  overdue for service   {k['assets_overdue_service']}")
    print()
    print(f"  {'asset':8} {'util%':>7} {'avail%':>7} {'L/eng-h':>8} {'hrs->svc':>9}")
    for tag in sorted(metrics["maintenance"]):
        u = metrics["utilization"][tag]["avg_utilization_pct_30d"]
        a = metrics["downtime"][tag]["availability_pct_30d"]
        lph = metrics["fuel"][tag]["litres_per_engine_hour"]
        nxt = metrics["maintenance"][tag]["hours_to_next_service"]
        flag = "  OVERDUE" if metrics["maintenance"][tag]["service_overdue"] else ""
        print(f"  {tag:8} {u!s:>7} {a!s:>7} {lph!s:>8} {nxt!s:>9}{flag}")
    if args.json:
        print(json.dumps(metrics, indent=2))
    return 0


def _cmd_report(args) -> int:
    from .report import build_report

    path = build_report(get_engine(), out_dir=args.out)
    print(f"wrote {path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="fleet-analytics", description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)

    pi = sub.add_parser("ingest", help="load a raw Excel workbook into Postgres")
    pi.add_argument("--file", required=True, help="path to the .xlsx (relative to repo root is fine)")
    pi.set_defaults(func=_cmd_ingest)

    pa = sub.add_parser("analyze", help="print fleet metrics to stdout")
    pa.add_argument("--json", action="store_true", help="also dump the full metrics JSON")
    pa.set_defaults(func=_cmd_analyze)

    pr = sub.add_parser("report", help="write the stakeholder Excel summary")
    pr.add_argument("--out", default=None, help="output directory (default: data/exports)")
    pr.set_defaults(func=_cmd_report)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
