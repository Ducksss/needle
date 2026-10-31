# Working in this repo

- Stay inside your segment folder (`ml/`, `api/` or `frontend/`). Read `contracts/README.md` first and code against it. If the contract is wrong, say so in your pull request; do not edit `contracts/` from a segment branch.
- Never commit the ESA CSVs. Put them in `data/` (git-ignored) or point at them with `NEEDLE_DATA_DIR`.
- The brief allows only these columns for the scored model: event_id, time_to_tca, miss_distance, relative_speed, relative_position_r, relative_position_t, relative_position_n, c_object_type, c_sigma_r, t_sigma_r, max_risk_estimate, F10, AP. The physics Pc and burn planner may use the full CDM, and the UI must label it as the physics model.
- Branches: `PinZheng/<topic>`. Commit subjects: `<area>(<type>): <short summary>`, for example `frontend(feat): add 24 h warnings panel`. Commit bodies hold summary, rationale and validation. Keep commit attribution user-owned.
- Pull requests follow `.github/pull_request_template.md` and target `main`.
- No decorative comment separators (`// ----`, `# ====`). Plain comments and blank lines.
- UI changes are verified by screenshots that you look at, not by DOM checks. Save them under `frontend/docs/screenshots/`.
- Report numbers only after you have re-run them. State what is simulated or assumed.
