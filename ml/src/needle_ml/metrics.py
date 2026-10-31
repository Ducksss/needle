"""metrics.json: classifier test scores, physics Pc check and replay counts."""
from datetime import datetime

import numpy as np

from .data import latest_cdm
from .physics import encounter


def physics_check(te):
    """Physics Pc (span hard-body radius) against ESA `risk` for the Pc-confirmed test events (latest CDM)."""
    last = latest_cdm(te)
    pc_ev = last[last.risk >= -4].sort_values("risk", ascending=False)
    rows = []
    for eid, r in pc_ev.iterrows():
        enc = encounter(r)
        model = float(np.log10(enc.pc_model)) if enc.pc_model > 0 else None
        rows.append({"id": int(eid), "risk": round(float(r.risk), 3), "model": None if model is None else round(model, 3),
                     "err": None if model is None else round(model - float(r.risk), 3),
                     "hbrSpan": round(float(enc.hbr_span), 1), "hbrEff": round(float(enc.hbr_eff), 2)})
    errs = np.array([abs(x["err"]) for x in rows if x["err"] is not None])
    return {"pcEvents": len(rows),
            # 0.02 orders at two-decimal precision, as the legacy check reported it
            "within002": int((np.round(errs, 2) <= 0.02).sum()),
            "within01": int((errs < 0.1).sum()),
            "medianAbsErr": round(float(np.median(errs)), 3) if len(errs) else None,
            "model": "encounter plane, full CDM covariances, hard-body radius = mean object span",
            "events": rows}


def build(test_metrics, physics, replay_summary, generated_at=None):
    return {"generatedAt": generated_at or datetime.now().astimezone().isoformat(timespec="seconds"),
            "source": "needle-ml build (ml/src/needle_ml)",
            "test": test_metrics, "physics": physics, "replay": replay_summary}
