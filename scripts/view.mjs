import { MODULE_ID, RATINGS, progressOfScore, rankOfScore, ratingOf, trackOf } from './rules.mjs';
import { factionFlags, isFaction, marksPerRank } from './factions.mjs';

/** Shared bits of template context for the reputation track and relationship chips. */

export const TEMPLATES = {
    tab: `modules/${MODULE_ID}/templates/factions-tab.hbs`,
    track: `modules/${MODULE_ID}/templates/partials/track.hbs`,
    relation: `modules/${MODULE_ID}/templates/partials/relation-chip.hbs`
};

export function preloadTemplates() {
    return foundry.applications.handlebars.loadTemplates({
        'dh5b-track': TEMPLATES.track,
        'dh5b-relation': TEMPLATES.relation
    });
}

export function ratingLabel(value) {
    return game.i18n.localize(`DH5B.Rating.${ratingOf(value).key}`);
}

/** CSS tone for a rating: warm gold for allies, ember red for enemies. */
export function ratingTone(value) {
    if (value > 0) return 'pos';
    if (value < 0) return 'neg';
    return 'neutral';
}

export function ratingChoices() {
    return RATINGS.slice()
        .reverse()
        .map(r => ({ value: r.value, label: `${r.value > 0 ? '+' : r.value < 0 ? '−' : '±'}${Math.abs(r.value)} ${game.i18n.localize(`DH5B.Rating.${r.key}`)}` }));
}

/** Everything the track partial needs for one character × faction. */
export function trackContext(score, { canMark = false, factionId, actorUuid } = {}) {
    const per = marksPerRank();
    const rank = rankOfScore(score, per);
    const { into, next } = progressOfScore(score, per);
    const pips = trackOf(score, per).map(p => ({
        ...p,
        label: p.rank !== null ? `${p.rank > 0 ? '+' : '−'}${Math.abs(p.rank)} ${ratingLabel(p.rank)}` : null
    }));
    return {
        score,
        rank,
        rankLabel: ratingLabel(rank),
        rankSigned: rank > 0 ? `+${rank}` : rank < 0 ? `−${Math.abs(rank)}` : '0',
        tone: ratingTone(rank),
        negPips: pips.filter(p => p.side === 'neg'),
        posPips: pips.filter(p => p.side === 'pos'),
        progress: next !== null && per > 1 ? game.i18n.format('DH5B.Reputation.Progress', { into, per, next: ratingLabel(next) }) : null,
        canMark,
        factionId,
        actorUuid,
        per
    };
}

/** Relationship chips for a faction, as seen by a viewer who knows `knownIds` (null = sees all). */
export function relationChips(faction, knownIds = null) {
    const chips = [];
    for (const rel of faction.system.relations) {
        const other = game.items.get(rel.id);
        if (!isFaction(other)) continue;
        const known = !knownIds || knownIds.has(rel.id);
        if (!known && !game.user.isGM) continue;
        chips.push({
            id: other.id,
            uuid: other.uuid,
            name: other.name,
            img: other.img,
            color: other.system.color?.css ?? other.system.color,
            value: rel.value,
            signed: rel.value > 0 ? `+${rel.value}` : rel.value < 0 ? `−${Math.abs(rel.value)}` : '0',
            label: ratingLabel(rel.value),
            tone: ratingTone(rel.value),
            note: rel.note,
            unknown: !known
        });
    }
    return chips.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function knownIdsOf(actor) {
    return new Set(Object.keys(factionFlags(actor)));
}

/** The homebrew reputation rule, in a small themed dialog. */
export function showReputationRule() {
    const per = marksPerRank();
    const rows = RATINGS.slice()
        .reverse()
        .map(r => `<tr class="tone-${ratingTone(r.value)}"><td>${r.value > 0 ? '+' : r.value < 0 ? '−' : '±'}${Math.abs(r.value)}</td><td>${game.i18n.localize(`DH5B.Rating.${r.key}`)}</td><td>${game.i18n.localize(`DH5B.Rule.Effect.${r.key}`)}</td></tr>`)
        .join('');
    const content = `<div class="dh5b-rule">
        <p>${game.i18n.localize('DH5B.Rule.Intro')}</p>
        <p>${game.i18n.format(per > 1 ? 'DH5B.Rule.Marks' : 'DH5B.Rule.MarksOne', { per })}</p>
        <table><thead><tr><th></th><th>${game.i18n.localize('DH5B.Rule.Standing')}</th><th>${game.i18n.localize('DH5B.Rule.Effect.Title')}</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="hint">${game.i18n.localize('DH5B.Rule.Shifts')}</p>
    </div>`;
    return foundry.applications.api.DialogV2.prompt({
        window: { title: 'DH5B.Rule.Title', icon: 'fa-solid fa-scroll' },
        classes: ['dh5b', 'dh5b-dialog'],
        position: { width: 520 },
        content,
        ok: { label: 'DH5B.Rule.Close' }
    });
}
