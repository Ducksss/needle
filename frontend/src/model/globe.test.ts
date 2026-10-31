import { geoOrthographic, geoRotation } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { realData } from '../test/fixtures';
import { EARTH_R, RE, VIEW, VIEW0, buildGlobeScene, d3Rotation, phaseAt, project } from './globe';
import { initialSelection } from './replay';
import { NO_DECISIONS, runCtx, snapshot } from './run';

describe('globe projection', () => {
  it('matches the d3 orthographic projection used for the map, at any spin', () => {
    for (const v of [VIEW0, { yaw: 2.1, tilt: -0.4 }, { yaw: -5, tilt: 1.2 }]) {
      const d3p = geoOrthographic().scale(EARTH_R).translate([VIEW / 2, VIEW / 2]).rotate(d3Rotation(v)).clipAngle(90);
      for (let i = 0; i < 50; i++) {
        const lon = ((i * 37) % 360) - 180;
        const lat = ((i * 23) % 170) - 85;
        const l = (lon * Math.PI) / 180;
        const p = (lat * Math.PI) / 180;
        const ours = project([RE * Math.cos(p) * Math.cos(l), RE * Math.cos(p) * Math.sin(l), RE * Math.sin(p)], v);
        const theirs = d3p([lon, lat])!;
        expect(theirs[0]).toBeCloseTo(ours[0], 6);
        expect(theirs[1]).toBeCloseTo(ours[1], 6);
        const [rl, rp] = geoRotation(d3Rotation(v))([lon, lat]).map((d) => (d * Math.PI) / 180);
        const front = Math.cos(rp) * Math.cos(rl);
        if (Math.abs(front) > 1e-6) expect(front > 0).toBe(ours[3] < 0);
      }
    }
  });

  it('offsets pulses so lights do not flash together', () => {
    expect(phaseAt(0, 1800, 0.25)).toBeCloseTo(0.25);
    expect(phaseAt(900, 1800, 0.75)).toBeCloseTo(0.25);
    expect(phaseAt(-100, 1000, 0)).toBeCloseTo(0.9);
  });
});

describe('buildGlobeScene', () => {
  const data = realData();
  const rp = data.replay;
  const start = initialSelection(rp.events, rp.runH, rp.runs);
  const ctx = runCtx(rp, start.run, 10, NO_DECISIONS);
  const snap = snapshot(ctx);
  const sel = snap.rows.find((r) => r.e.id === start.sel)!;

  it('draws every mission orbit, with the selected one flagged and the others carrying a satellite', () => {
    const g = buildGlobeScene({ missions: data.fleet.missions, open: snap.open, sel, opt: null });
    expect(g.orbits).toHaveLength(data.fleet.missions.length);
    expect(g.orbits.filter((o) => o.selected).map((o) => o.icon)).toEqual([null]);
    expect(g.orbits.filter((o) => !o.selected).every((o) => o.icon)).toBe(true);
  });

  it('puts every other open event on the globe and the selected one facing the opening view', () => {
    const g = buildGlobeScene({ missions: data.fleet.missions, open: snap.open, sel, opt: null });
    expect(g.dots).toHaveLength(snap.open.length - 1);
    expect(g.sel?.open).toBe(true);
    expect(project(g.sel!.ev, VIEW0)[2]).toBe(true);
    expect(g.sel?.ahead.length).toBeGreaterThan(0);
    expect(g.sel?.prop).toEqual([]);
  });

  it('has no selection layer for an unreported event', () => {
    const g = buildGlobeScene({ missions: data.fleet.missions, open: snap.open, sel: null, opt: null });
    expect(g.sel).toBeNull();
    expect(g.dots).toHaveLength(snap.open.length);
  });
});
