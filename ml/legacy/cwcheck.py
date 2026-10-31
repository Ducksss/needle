import numpy as np
MU = 398600.4418e9  # m^3/s^2
def rk4(state, dt, steps):
    def f(s):
        r = s[:3]; return np.concatenate([s[3:], -MU * r / np.linalg.norm(r) ** 3])
    for _ in range(steps):
        k1 = f(state); k2 = f(state + dt / 2 * k1); k3 = f(state + dt / 2 * k2); k4 = f(state + dt * k3)
        state = state + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
    return state
for name, a_km, dv_rtn, lead_d in [("#891 retrograde 7 mm/s", 7070.0, (0, -0.007, 0), 2.18), ("#1984 20 deg tilt 21 mm/s", 6686.0, (0.021*np.sin(np.radians(20)), 0.021*np.cos(np.radians(20)), 0), 2.1)]:
    a = a_km * 1000; v = np.sqrt(MU / a); n = np.sqrt(MU / a ** 3); t = lead_d * 86400
    s0 = np.array([a, 0, 0, 0, v, 0.0])
    s1 = s0.copy(); s1[3:] += np.array([dv_rtn[0], dv_rtn[1], dv_rtn[2]])  # at t0: R = x, T = y, N = z
    dt = 5.0; steps = int(t / dt)
    ref = rk4(s0, dt, steps); bur = rk4(s1, dt, steps)
    r = ref[:3]; vv = ref[3:]
    R = r / np.linalg.norm(r); N = np.cross(r, vv); N /= np.linalg.norm(N); T = np.cross(N, R)
    d = bur[:3] - ref[:3]
    num = np.array([d.dot(R), d.dot(T), d.dot(N)])
    sn, cs = np.sin(n * t), np.cos(n * t)
    dvr, dvt, dvn = dv_rtn
    cw = np.array([dvr / n * sn + 2 * dvt / n * (1 - cs), 2 * dvr / n * (cs - 1) + dvt / n * (4 * sn - 3 * n * t), dvn / n * sn])
    print(name, "| numerical RTN (m):", num.round(1), "| CW (m):", cw.round(1), "| along-track error:", f"{abs(num[1]-cw[1])/abs(cw[1])*100:.2f}%")
