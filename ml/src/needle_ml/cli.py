"""needle-ml command line: rebuild every artifact from the ESA CSVs."""
import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np

from . import classifier, data, fleet, forecast, metrics, replay

ARTIFACTS_ENV = "NEEDLE_ARTIFACTS_DIR"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def write_json(path, obj, compact=True):
    with open(path, "w") as f:
        if compact:
            json.dump(obj, f, separators=(",", ":"))
        else:
            json.dump(obj, f, indent=2)
            f.write("\n")


def build(data_path, out, grid="wide", skip_replay=False):
    t0 = time.time()
    src = data.data_dir(data_path)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    log(f"loading CSVs from {src}")
    tr = data.load(src, "train")
    te = data.load(src, "test")
    log(f"train {len(tr):,} rows, test {len(te):,} rows ({time.time() - t0:.0f} s)")

    fl = fleet.build(tr, te)
    write_json(out / "fleet.json", fl)
    log(f"wrote fleet.json: {len(fl['missions'])} missions, {len(fl['dots'])} dots, {len(fl['pcEvents'])} Pc events")

    preds, test_metrics = classifier.run(tr, te, grid=grid, log=log)
    preds.to_csv(out / "test_predictions.csv", index=False)
    log(f"wrote test_predictions.csv: {len(preds):,} rows ({time.time() - t0:.0f} s)")

    phys = metrics.physics_check(te)
    log(f"physics: {phys['within002']} of {phys['pcEvents']} Pc events within 0.02 orders of ESA, "
        f"{phys['within01']} within 0.1, median |error| {phys['medianAbsErr']}")

    # forecast ranges come from train events outside the replay, so the demo never sees its own outcomes
    chosen, _ = replay.choose_events(tr, np.random.default_rng(replay.SEED))
    fc = forecast.build(tr, exclude=chosen, log=log)
    write_json(out / "forecast.json", fc, compact=False)
    log(f"wrote forecast.json: held-out 10-90 coverage {fc['validation']['coverage10to90']}")

    if skip_replay:
        rp = json.loads((out / "replay.json").read_text())
        log("replay: skipped, counting the existing replay.json")
    else:
        rp = replay.build(tr, fl, fc=fc, log=log)
        write_json(out / "replay.json", rp)
        log(f"wrote replay.json ({time.time() - t0:.0f} s)")
    rs = replay.summary(rp)
    log(f"replay: {rs['events']} events, {rs['escalated']} escalated, {rs['coaMessages']} burn-option CDMs, "
        f"{rs['pcModelWithin01']} with Pc model within 0.1 orders, median 24 h wait ratio {rs['medianWaitRatio24h']}")

    write_json(out / "metrics.json", metrics.build(test_metrics, phys, rs), compact=False)
    log(f"wrote metrics.json; done in {time.time() - t0:.0f} s")


def main(argv=None):
    p = argparse.ArgumentParser(prog="needle-ml", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="regenerate fleet.json, replay.json, test_predictions.csv and metrics.json")
    b.add_argument("--data", default=os.environ.get(data.DATA_ENV), help=f"folder with the ESA CSVs (default ${data.DATA_ENV})")
    b.add_argument("--out", default=os.environ.get(ARTIFACTS_ENV, "../artifacts"),
                   help=f"artifacts folder (default ${ARTIFACTS_ENV} or ../artifacts)")
    b.add_argument("--grid", choices=sorted(classifier.GRIDS), default="wide",
                   help="threshold grid that writes test_predictions.csv; both are scored in metrics.json (default wide)")
    b.add_argument("--skip-replay", action="store_true", help="keep the existing replay.json (the slowest step)")
    args = p.parse_args(argv)
    try:
        build(args.data, args.out, grid=args.grid, skip_replay=args.skip_replay)
    except FileNotFoundError as e:
        p.exit(2, f"needle-ml: {e}\n")


if __name__ == "__main__":
    main()
