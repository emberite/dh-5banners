import { FACTION_TYPE, MODULE_ID, clampScore } from './rules.mjs';

/**
 * Which factions a character knows lives in the character's flags:
 *   flags.dh-5banners.factions.<factionItemId> = { score, notes, met }
 * The faction itself stays a world Item, so the GM's edits (relationships, description) show up
 * on every sheet at once.
 */
const FLAG = 'factions';

export function isFaction(doc) {
    return doc?.documentName === 'Item' && doc.type === FACTION_TYPE;
}

export function marksPerRank() {
    return game.settings.get(MODULE_ID, 'marksPerRank');
}

/** Raw flag map for an actor. */
export function factionFlags(actor) {
    return actor?.getFlag(MODULE_ID, FLAG) ?? {};
}

export function knowsFaction(actor, factionId) {
    return !!factionFlags(actor)[factionId];
}

/** The factions an actor has met, with the live world Item for each (missing items are skipped). */
export function knownFactions(actor) {
    return Object.entries(factionFlags(actor))
        .map(([id, data]) => ({ id, faction: game.items.get(id), score: data?.score ?? 0, notes: data?.notes ?? '', met: data?.met ?? 0 }))
        .filter(e => isFaction(e.faction))
        .sort((a, b) => a.faction.name.localeCompare(b.faction.name, game.i18n.lang));
}

/** Can the current user change this actor's reputation marks? */
export function canMarkReputation(actor) {
    if (game.user.isGM) return true;
    return !!actor?.isOwner && game.settings.get(MODULE_ID, 'playersMarkReputation');
}

/** The characters a drop on this actor should reach: the character itself, or a party's characters. */
export function charactersFor(actor) {
    if (!actor) return [];
    if (actor.type === 'character') return [actor];
    if (actor.type === 'party') {
        return (actor.system.partyMembers ?? []).filter(a => a?.type === 'character');
    }
    return [];
}

/** A faction dragged from a compendium is first brought into the world (once). */
export async function ensureWorldFaction(faction) {
    if (!faction.pack) return faction;
    const existing = game.items.find(i => i.type === FACTION_TYPE && i._stats?.compendiumSource === faction.uuid);
    if (existing) return existing;
    return game.items.importFromCompendium(game.packs.get(faction.pack), faction.id, {}, { keepId: true });
}

/**
 * Introduce characters to a faction: it appears on their Factions tab at Neutral, and their players
 * can open the faction's sheet. GM only, because it changes the faction's permissions.
 */
export async function introduce(faction, actors, { notify = true } = {}) {
    if (!game.user.isGM) {
        ui.notifications.warn('DH5B.Notify.GMOnly', { localize: true });
        return [];
    }
    faction = await ensureWorldFaction(faction);
    const added = [];
    const ownership = { ...faction.ownership };
    const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    for (const actor of actors) {
        if (actor?.type !== 'character') continue;
        // Players who own the character get to look at the faction.
        for (const user of game.users) {
            if (user.isGM || !actor.testUserPermission(user, 'OWNER')) continue;
            if ((ownership[user.id] ?? -1) < observer) ownership[user.id] = observer;
        }
        if (knowsFaction(actor, faction.id)) continue;
        await actor.update({ [`flags.${MODULE_ID}.${FLAG}.${faction.id}`]: { score: 0, notes: '', met: Date.now() } });
        added.push(actor);
    }
    if (!foundry.utils.equals(ownership, faction.ownership)) await faction.update({ ownership });
    if (notify) {
        if (added.length) {
            ui.notifications.info(game.i18n.format('DH5B.Notify.Introduced', { faction: faction.name, names: added.map(a => a.name).join(', ') }));
        } else if (actors.length) {
            ui.notifications.info(game.i18n.format('DH5B.Notify.AlreadyKnown', { faction: faction.name }));
        }
    }
    return added;
}

export async function forget(actor, factionId) {
    return actor.update({ [`flags.${MODULE_ID}.${FLAG}.${factionId}`]: _del });
}

export async function setScore(actor, factionId, score) {
    if (!canMarkReputation(actor) || !knowsFaction(actor, factionId)) return;
    const value = clampScore(score, marksPerRank());
    return actor.update({ [`flags.${MODULE_ID}.${FLAG}.${factionId}.score`]: value });
}

export async function setNotes(actor, factionId, notes) {
    if (!actor.isOwner || !knowsFaction(actor, factionId)) return;
    return actor.update({ [`flags.${MODULE_ID}.${FLAG}.${factionId}.notes`]: notes });
}

/** Every character in the world that knows a faction (for the faction sheet's Reputation tab). */
export function charactersKnowing(factionId) {
    return game.actors
        .filter(a => a.type === 'character' && knowsFaction(a, factionId))
        .map(actor => ({ actor, score: factionFlags(actor)[factionId]?.score ?? 0 }))
        .sort((a, b) => a.actor.name.localeCompare(b.actor.name, game.i18n.lang));
}

/** Characters with a player owner, i.e. the player characters. */
export function playerCharacters() {
    return game.actors.filter(a => a.type === 'character' && a.hasPlayerOwner);
}

/** When a faction is deleted, the GM tidies up relationships pointing at it. Character flags are left alone. */
export function registerCleanup() {
    Hooks.on('deleteItem', async item => {
        if (!isFaction(item) || item.parent || !game.user.isActiveGM) return;
        for (const other of game.items) {
            if (!isFaction(other)) continue;
            const relations = other.system.relations.filter(r => r.id !== item.id);
            if (relations.length !== other.system.relations.length) await other.update({ 'system.relations': relations });
        }
    });
}
