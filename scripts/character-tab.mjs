import { FACTION_TYPE, MODULE_ID, scoreAfterClick } from './rules.mjs';
import {
    canMarkReputation,
    charactersFor,
    factionFlags,
    forget,
    introduce,
    isFaction,
    knownFactions,
    marksPerRank,
    setScore
} from './factions.mjs';
import { TEMPLATES, knownIdsOf, relationChips, showReputationRule, trackContext } from './view.mjs';

const TAB_ID = 'factions';

/**
 * Adds the Factions tab to the Daggerheart character sheet (and so to the Core Rulebook module's
 * themed subclass of it). Everything is patched in memory at init, so the tab is gone as soon as
 * the module is disabled.
 */
export function registerCharacterTab() {
    const sheets = game.system.api?.applications?.sheets?.actors;
    const Character = sheets?.Character;
    if (!Character) {
        console.error(`${MODULE_ID} | Daggerheart character sheet not found, the Factions tab is unavailable`);
        return;
    }

    // Part, placed before the Effects tab.
    const parts = {};
    for (const [key, part] of Object.entries(Character.PARTS)) {
        if (key === 'effects') parts[TAB_ID] = { id: TAB_ID, scrollable: ['.dh5b-factions-list'], template: TEMPLATES.tab };
        parts[key] = part;
    }
    parts[TAB_ID] ??= { id: TAB_ID, scrollable: ['.dh5b-factions-list'], template: TEMPLATES.tab };
    Character.PARTS = parts;

    const tabs = Character.TABS.primary.tabs;
    if (!tabs.some(t => t.id === TAB_ID)) {
        const at = tabs.findIndex(t => t.id === 'effects');
        tabs.splice(at < 0 ? tabs.length : at, 0, { id: TAB_ID, label: 'DH5B.Tab.Label' });
    }

    Object.assign(Character.DEFAULT_OPTIONS.actions, {
        dh5bMark: onMark,
        dh5bStep: onStep,
        dh5bOpenFaction: onOpenFaction,
        dh5bForget: onForget,
        dh5bToggle: onToggle,
        dh5bRule: showReputationRule
    });

    const preparePart = Character.prototype._preparePartContext;
    Character.prototype._preparePartContext = async function (partId, context, options) {
        context = await preparePart.call(this, partId, context, options);
        if (partId === TAB_ID) context.dh5b = await prepareTab(this);
        return context;
    };

    const onDrop = Character.prototype._onDrop;
    Character.prototype._onDrop = async function (event) {
        if (await dropFaction(event, this.document)) {
            this.changeTab?.(TAB_ID, 'primary');
            return;
        }
        return onDrop.call(this, event);
    };

    // A faction dropped on the party sheet reaches every character in the party.
    const Party = sheets.Party;
    if (Party) {
        const partyDrop = Party.prototype._onDrop;
        Party.prototype._onDrop = async function (event) {
            if (await dropFaction(event, this.document)) return;
            return partyDrop.call(this, event);
        };
    }

    // Factions are never embedded on actors, whichever way they get dragged there.
    Hooks.on('preCreateItem', (item, data, options) => {
        if (item.type !== FACTION_TYPE || !item.parent) return;
        if (item.parent.documentName === 'Actor' && !options.dh5bSilent) {
            const source = game.items.get(item.id) ?? game.items.find(i => i.type === FACTION_TYPE && i.name === item.name);
            const targets = charactersFor(item.parent);
            if (source && targets.length && game.user.isGM) introduce(source, targets);
        }
        return false;
    });

    // Keep open character sheets in step with faction edits.
    const rerender = item => {
        if (!isFaction(item)) return;
        for (const app of foundry.applications.instances.values()) {
            if (app instanceof Character && app.rendered && factionFlags(app.document)[item.id]) app.render({ parts: [TAB_ID] });
        }
    };
    Hooks.on('updateItem', rerender);
    Hooks.on('deleteItem', item => isFaction(item) && rerender(item));
}

/** Handle a faction dropped on an actor sheet. Returns true if it was a faction. */
async function dropFaction(event, actor) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== 'Item' || !data.uuid) return false;
    const item = await fromUuid(data.uuid);
    if (!isFaction(item)) return false;
    event.preventDefault();
    event.stopPropagation();
    const targets = charactersFor(actor);
    if (targets.length) await introduce(item, targets);
    return true;
}

async function prepareTab(sheet) {
    const actor = sheet.document;
    const canMark = canMarkReputation(actor);
    const known = knownIdsOf(actor);
    const showReputation = game.settings.get(MODULE_ID, 'reputation');
    sheet._dh5bExpanded ??= new Set();
    const TextEditor = foundry.applications.ux.TextEditor.implementation;
    const entries = [];
    for (const { id, faction, score, notes } of knownFactions(actor)) {
        const expanded = sheet._dh5bExpanded.has(id);
        entries.push({
            id,
            uuid: faction.uuid,
            name: faction.name,
            img: faction.img,
            kind: faction.system.kind,
            motto: faction.system.motto,
            color: faction.system.color?.css ?? faction.system.color,
            canOpen: faction.testUserPermission(game.user, 'LIMITED'),
            track: trackContext(score, { canMark, factionId: id }),
            relations: relationChips(faction, game.user.isGM ? null : known).map(c => ({ ...c, unknown: !known.has(c.id) })),
            expanded,
            description: expanded ? await TextEditor.enrichHTML(faction.system.description, { relativeTo: faction }) : '',
            notes,
            notesName: `flags.${MODULE_ID}.factions.${id}.notes`
        });
    }
    return {
        entries,
        isGM: game.user.isGM,
        canMark,
        showReputation,
        editable: sheet.isEditable,
        perRank: marksPerRank()
    };
}

/* ---------- actions (this = the character sheet) ---------- */

async function onMark(event, target) {
    const id = target.closest('[data-faction-id]')?.dataset.factionId;
    const value = Number(target.dataset.value);
    if (!id || Number.isNaN(value)) return;
    const current = factionFlags(this.document)[id]?.score ?? 0;
    await setScore(this.document, id, scoreAfterClick(current, value));
}

async function onStep(event, target) {
    const id = target.closest('[data-faction-id]')?.dataset.factionId;
    const delta = Number(target.dataset.delta) || 0;
    if (!id) return;
    const current = factionFlags(this.document)[id]?.score ?? 0;
    await setScore(this.document, id, current + delta);
}

function onOpenFaction(event, target) {
    const id = target.closest('[data-faction-id]')?.dataset.factionId ?? target.dataset.factionId;
    const faction = game.items.get(id);
    if (faction?.testUserPermission(game.user, 'LIMITED')) faction.sheet.render({ force: true });
}

async function onForget(event, target) {
    if (!game.user.isGM) return;
    const id = target.closest('[data-faction-id]')?.dataset.factionId;
    const faction = game.items.get(id);
    const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: 'DH5B.Tab.Forget' },
        content: `<p>${game.i18n.format('DH5B.Tab.ForgetConfirm', { faction: faction?.name ?? id, actor: this.document.name })}</p>`
    });
    if (ok) await forget(this.document, id);
}

function onToggle(event, target) {
    const id = target.closest('[data-faction-id]')?.dataset.factionId;
    if (!id) return;
    this._dh5bExpanded ??= new Set();
    if (this._dh5bExpanded.has(id)) this._dh5bExpanded.delete(id);
    else this._dh5bExpanded.add(id);
    this.render({ parts: [TAB_ID] });
}
