/**
 * Faction and reputation rules. No Foundry dependencies, so they're easy to reason about and test.
 *
 * Relationships between factions use the Five Banners Burning scale from the Core Rulebook:
 * Nemeses (−3) to Close Allies (+3).
 *
 * Reputation (homebrew) puts each character on the same scale with every faction they've met.
 * It moves in marks: every `marksPerRank` marks in one direction shift the rating one step.
 */

export const MODULE_ID = 'dh-5banners';
export const FACTION_TYPE = `${MODULE_ID}.faction`;

/** Rating steps, lowest to highest. `key` is the localization key under DH5B.Rating. */
export const RATINGS = [
    { value: -3, key: 'nemeses' },
    { value: -2, key: 'enemies' },
    { value: -1, key: 'unfriendly' },
    { value: 0, key: 'neutral' },
    { value: 1, key: 'friendly' },
    { value: 2, key: 'allies' },
    { value: 3, key: 'closeAllies' }
];

export const MAX_RATING = 3;

export function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
}

/** Rating entry for a value (clamped to −3..+3). */
export function ratingOf(value) {
    const v = clamp(Math.round(Number(value) || 0), -MAX_RATING, MAX_RATING);
    return RATINGS.find(r => r.value === v);
}

/** Largest reputation score (marks) a character can reach in either direction. */
export function maxScore(marksPerRank) {
    return MAX_RATING * Math.max(1, marksPerRank);
}

export function clampScore(score, marksPerRank) {
    const max = maxScore(marksPerRank);
    return clamp(Math.round(Number(score) || 0), -max, max);
}

/** Reputation rating (−3..+3) for a score: full steps only, rounded toward Neutral. */
export function rankOfScore(score, marksPerRank) {
    const per = Math.max(1, marksPerRank);
    return Math.trunc(clampScore(score, per) / per);
}

/** Marks collected toward the next step, e.g. "2 of 3 toward Allies". */
export function progressOfScore(score, marksPerRank) {
    const per = Math.max(1, marksPerRank);
    const s = clampScore(score, per);
    const rank = rankOfScore(s, per);
    const into = Math.abs(s) - Math.abs(rank) * per;
    const next = Math.abs(rank) >= MAX_RATING || into === 0 ? null : rank + Math.sign(s);
    return { rank, into, per, next };
}

/**
 * The pips of a reputation track, laid out left (−) to right (+), Neutral in the middle.
 * Each pip knows the score it stands for and whether it's filled.
 */
export function trackOf(score, marksPerRank) {
    const per = Math.max(1, marksPerRank);
    const s = clampScore(score, per);
    const max = maxScore(per);
    const pips = [];
    for (let v = -max; v <= max; v++) {
        if (v === 0) continue;
        const filled = v < 0 ? s <= v : s >= v;
        const stepEnd = v % per === 0;
        pips.push({ value: v, filled, side: v < 0 ? 'neg' : 'pos', stepEnd, rank: stepEnd ? v / per : null });
    }
    return pips;
}

/**
 * Clicking a pip sets the score to it. Clicking the outermost filled pip again steps back one mark
 * toward Neutral, so a single click can always undo the last mark.
 */
export function scoreAfterClick(current, clicked) {
    if (current === clicked) return clicked - Math.sign(clicked);
    return clicked;
}

/** Normalize a relationship list: one entry per other faction, values clamped, self removed. */
export function normalizeRelations(relations, selfId) {
    const seen = new Set();
    const out = [];
    for (const r of relations ?? []) {
        if (!r?.id || r.id === selfId || seen.has(r.id)) continue;
        seen.add(r.id);
        out.push({ id: r.id, value: clamp(Math.round(Number(r.value) || 0), -MAX_RATING, MAX_RATING), note: r.note ?? '' });
    }
    return out;
}

/** Set (or add) the relationship toward `otherId` in a list, returning a new list. */
export function withRelation(relations, otherId, value, note) {
    const list = (relations ?? []).map(r => ({ ...r }));
    const existing = list.find(r => r.id === otherId);
    if (existing) {
        existing.value = clamp(Math.round(Number(value) || 0), -MAX_RATING, MAX_RATING);
        if (note !== undefined) existing.note = note;
    } else {
        list.push({ id: otherId, value: clamp(Math.round(Number(value) || 0), -MAX_RATING, MAX_RATING), note: note ?? '' });
    }
    return list;
}

export function withoutRelation(relations, otherId) {
    return (relations ?? []).filter(r => r.id !== otherId).map(r => ({ ...r }));
}

/** Objective countdowns: majors take 10 steps, minors 4 to 6 (Core Rulebook, Objective Countdowns). */
export const OBJECTIVE_STEPS = { major: 10, minor: 4 };
export const OBJECTIVE_LIMITS = { major: 1, minor: 2 };
