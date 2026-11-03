# Needle demo script

A spoken walkthrough for judges at the table: about 3 minutes of talk and demo, then questions. Open https://needle-lyart.vercel.app before they arrive. Every number below is checked in [`ml/METHODOLOGY.md`](../../ml/METHODOLOGY.md) or the [`submission/`](../../submission/README.md) folder.

## 1. The problem (30 s)

> Satellite operators get a conjunction message every few hours for every close approach. Most of them never need action, but each one has to be checked by hand.
>
> Read the brief's rules on ESA's test set, and 186 events come out Critical. Only 23 of those have a collision probability at or above 1 in 10,000. The other 163 are flagged on miss distance alone, and two-thirds of those have a probability below one in a million.
>
> So the question isn't "which events are close". It's "which events will still need a burn when closest approach comes, and when do I have to decide".

## 2. What Needle does (30 s)

> Needle is a triage console. Two days before closest approach, it predicts each event's final tier with a probability. It ranks open events by the decision they need and the deadline for that decision. It forecasts the final miss distance with a lower and an upper limit. And when the risk is real, it plans a burn that still works if the miss shrinks.

## 3. Demo (90 s)

1. **Next decision bar (top).** "This is the one thing to decide now. The most urgent event, its Pc, and how long until the cheapest burn no longer fits our 10 mm/s budget."
2. **Queue, Decide tab.** "Sorted by deadline, not by alarm volume. Watch holds events that are close but not dangerous. Passed holds what's done."
3. **Workspace.** The console opens on event #6341 at run 5.
   - Forecast at closest approach: "Today it's 334 m. Our likely final distance is 378 m, and 8 out of 10 similar past events ended between 231 m and 2.08 km. That range held for 79.9% of held-out events. There's a 72% chance it ends under 1 km, and a 62% chance it ends Critical."
   - Message history: "Pc and miss distance for every message so far. Right of the 'now' line is the forecast. For Pc, the dashed line is the worst likely value, 1 in 10,000. The shading shows a 53% chance the risk drops to almost zero, and the marker an 11% chance it's still high at closest approach."
   - Encounter plane: "Where the object passes now, and after the burn."
   - Cost of waiting: "Waiting a day costs a median 1.25 times the Δv. That curve sets the deadline."
4. **Options, then Review and approve.**
   - "The planner proposes; the checks are deterministic; the operator approves."
   - Example to quote: event 891, Pc 1.3e-3 at 503 m. A 7.0 mm/s retrograde burn moves it to 1,056 m and Pc 9.1e-5.
   - "The recommended burn is sized so even the pessimistic forecast still clears 1 km. In most cases that costs nothing extra."
5. **Timeline at the bottom: press Play.** "This is a replay of 280 real ESA message histories over 21 days of 8-hour screening runs. Events appear, escalate, get decided and pass. The marker at the end of each open bar is the chance that event ends Critical."
6. **Next 24 h panel.** "The brief's 24-hour warnings: what reaches closest approach in the next day, how many come within 1 km, and which of those actually matter."
7. **Globe.** "Context only. The data has no orbits or clock times, so the orientation is illustrative."

## 4. Results (30 s)

> Following the brief, we held out 20% of the training events. 167 of them end Critical. Two days out, we flag 150 of those 167, with 17 missed and 33 false alarms. Of the 17 misses, 16 still sit on the watch list as Elevated.
>
> We tested honestly. A simple baseline, "keep the latest tier", catches 149. Our model ties it. All 18 events the baseline misses turn Critical because the miss distance drops under 1 km in the last two days, and nothing two days out predicts that. So we don't oversell a model. We give operators a calibrated probability and a forecast range. That range held for 79.9% of 2,529 held-out events, against the 80% it claims.
>
> Our physics model reproduces ESA's own Pc to within 0.02 orders of magnitude on 20 of the 23 high-risk test events.

## 5. Close (15 s)

> Everything is on GitHub at Ducksss/needle: the data, our predictions, the held-out labels and a scoring script, so you can check every number yourselves.

## Likely questions

**Did train and test leak?**
No. The split is by event. Test labels never touched training. No test row matches any train row, and event IDs are never joined across files. Methodology §7 has the checks.

**Why doesn't the model beat the baseline?**
Most late escalations are the miss distance dropping under 1 km in the final two days. Messages from two or more days out carry no signal for that. ESA's own competition on this dataset found the same: the winner beat the latest-risk baseline only narrowly. We report that rather than hide it.

**Why Pc first and not miss distance?**
A 900 m pass with tiny uncertainty and a 900 m pass with huge uncertainty are different risks. Pc folds in the uncertainty. Distance alone floods the queue: 163 of 186 test Criticals are distance-only.

**Can you forecast Pc too?**
Not as a single number, because it swings by orders of magnitude. We forecast three things instead: a worst likely value, the chance it drops to almost zero, and the chance it's still at or above 1e-4 at closest approach. On held-out events the worst likely value held 89.9% of the time over 4,355 forecasts. The predicted chance of dropping to almost zero averaged 75.5%, against 76.0% observed. Of events at Pc ≥ 1e-4 now, only about 1 in 10 are still that high at closest approach.

**Why not plan seven days out?**
The data starts about seven days out, and the forecast range is widest there. Waiting a day costs about 25% more Δv, so the decision deadline balances a cheaper burn now against more certainty later.

**What's simulated?**
- The 21-day calendar is simulated; message timing within each event is real.
- High-risk events are over-sampled about seven times, so the demo has enough to show.
- The burn model ignores drag, J2 and execution error.
- The spacecraft (1,000 kg, 1 N, Isp 220 s) is assumed.

The console labels each of these on screen.
