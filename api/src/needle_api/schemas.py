"""Pydantic models for the shapes in contracts/README.md.

Artifact models allow extra keys so an additive change in an ML build does not
take the API down; missing or mistyped contract keys fail validation at load.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Tier = Literal["Safe", "Elevated", "Critical"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)


class Mission(Contract):
    mid: int = Field(description="ESA mission_id")
    label: str = Field(description="Display label, ESA-01..ESA-19, ordered by risk")
    alt: float = Field(description="Altitude, km, from t_j2k_sma")
    inc: float = Field(description="Inclination, deg")
    evTrain: int
    evTest: int
    pc: int = Field(description="Test events in the pc bucket (latest CDM)")
    hidden: int
    distance: int
    critical: int = Field(description="Test events in the Critical tier (latest CDM)")
    elevated: int
    safe: int
    topId: int | None = None
    topRisk: float | None = None
    topMiss: float | None = None


class PcEvent(Contract):
    id: int
    sat: str
    obj: str
    risk: float = Field(description="log10 Pc")
    miss: float = Field(description="Miss distance, m")
    tca: float = Field(description="Days to closest approach")
    speed: float = Field(description="Relative speed, m/s")
    r: float
    t: float
    n: float
    sr: float
    st: float
    sn: float


Dot = tuple[int, float, float, Literal[0, 1, 2, 3], int]


class Fleet(Contract):
    missions: list[Mission]
    dots: list[Dot] = Field(
        description="[missionIndex, chaserAltKm, chaserIncDeg, code, eventId]; code 0 none, 1 distance, 2 hidden, 3 pc"
    )
    pcEvents: list[PcEvent]


class Ellipse(Contract):
    a: float = Field(description="Semi-major axis, m")
    b: float = Field(description="Semi-minor axis, m")
    deg: float = Field(description="Orientation, deg")


class BurnOption(Contract):
    key: str = Field(description="coa1 Recommended, coa2 More margin, coa3 Wait 24 h")
    feasible: bool
    dv: float | None = Field(default=None, description="Delta-v, mm/s")
    alpha: float | None = Field(default=None, description="In-plane angle from velocity toward radial-out, deg")
    beta: float | None = Field(default=None, description="Out-of-plane angle, deg")
    leadH: float | None = Field(default=None, description="Hours between burn and closest approach")
    pcAfter: float | None = None
    missAfter: float | None = Field(default=None, description="m")
    dR: float | None = Field(default=None, description="Displacement at closest approach, m")
    dT: float | None = None
    dN: float | None = None
    burnS: float | None = Field(default=None, description="Burn seconds at 1 N")
    propG: float | None = Field(default=None, description="Propellant, g")
    dA: float | None = Field(default=None, description="Semi-major axis change, m")
    m2After: tuple[float, float] | None = None


WaitPoint = tuple[float, float | None]


class CoaPoint(Contract):
    risk: float
    miss: float
    tca: float = Field(description="Days before closest approach at this CDM")
    relSpeed: float
    crossDeg: float
    altKm: float
    m2: tuple[float, float] = Field(description="Encounter-plane miss vector, m")
    ell: Ellipse
    hbrEff: float
    pcModelOk: bool
    wait: list[WaitPoint] = Field(description="[hoursAfterCdm, dvMmS | null]; null = over 80 mm/s")
    opts: list[BurnOption]


class ReplayEvent(Contract):
    id: int
    sat: str
    mi: int = Field(description="Index into fleet.missions")
    obj: str
    inc: float
    tca: float = Field(description="Closest approach, hours from replay start")
    m: list[tuple[float, float, float]] = Field(description="[arrivalH, risk, missM] per CDM, oldest first")
    coa: dict[str, CoaPoint] = Field(description="Keyed by CDM index for CDMs with Pc >= 1e-4 and >= 3 h to TCA")


class Replay(Contract):
    runs: int
    runH: float
    windowH: float
    note: str
    events: list[ReplayEvent]


class Method(Contract):
    name: str
    accuracy: float
    macroF1: float
    criticalRecall: float
    criticalPrecision: float
    confusion: list[list[int]] | None = None


class HeldOutMetrics(Contract):
    rows: int
    methods: list[Method]


class PhysicsMetrics(Contract):
    pcEvents: int
    within002: int
    medianAbsErr: float | None = None


class ReplayMetrics(Contract):
    events: int
    escalated: int
    coaMessages: int
    pcModelWithin01: int
    medianWaitRatio24h: float


class Metrics(Contract):
    generatedAt: str
    test: HeldOutMetrics
    physics: PhysicsMetrics
    replay: ReplayMetrics


class PredictionRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, allow_inf_nan=False)

    row: int
    event_id: int
    time_to_tca: float
    miss_distance_m: float
    pred_log10_pc: float
    p_pc_below_1e_6: float = Field(alias="p_pc_below_1e-6")
    p_pc_1e_6_to_1e_4: float = Field(alias="p_pc_1e-6_to_1e-4")
    p_pc_at_least_1e_4: float = Field(alias="p_pc_at_least_1e-4")
    pred_tier: Tier
    reason: str


class PredictionPage(BaseModel):
    total: int = Field(description="Rows matching the filters, before pagination")
    rows: list[PredictionRow]


class Health(BaseModel):
    status: Literal["ok", "degraded"]
    artifacts: dict[str, bool]
    errors: dict[str, str] = Field(default_factory=dict, description="Why an artifact failed to load")
    ml: bool = Field(description="Whether needle_ml is importable, so /api/pc and /api/coa can answer")


class Cdm(BaseModel):
    """One CDM with ESA column names. Extra ESA columns are passed through to needle_ml."""

    model_config = ConfigDict(extra="allow", allow_inf_nan=False)

    time_to_tca: float
    risk: float
    miss_distance: float
    relative_position_r: float
    relative_position_t: float
    relative_position_n: float
    relative_velocity_r: float
    relative_velocity_t: float
    relative_velocity_n: float
    t_j2k_sma: float
    t_span: float
    c_span: float
    t_sigma_r: float
    t_sigma_t: float
    t_sigma_n: float
    t_ct_r: float
    t_cn_r: float
    t_cn_t: float
    c_sigma_r: float
    c_sigma_t: float
    c_sigma_n: float
    c_ct_r: float
    c_cn_r: float
    c_cn_t: float


class CoaRequest(BaseModel):
    cdm: Cdm
    budgetMmS: float = Field(default=10.0, gt=0, le=1000, description="Delta-v budget, mm/s")


class PcResult(Contract):
    log10Pc: float
    missM: float
    m2: tuple[float, float]
    ell: Ellipse
    hbr: float
    model: str = Field(description='"encounter-plane"')


class CoaResult(Contract):
    opts: list[BurnOption]
    wait: list[WaitPoint]
