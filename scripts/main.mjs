import { FACTION_TYPE, MODULE_ID } from './rules.mjs';
import * as rules from './rules.mjs';
import { FactionData } from './faction-model.mjs';
import { FactionSheet } from './faction-sheet.mjs';
import { registerCharacterTab } from './character-tab.mjs';
import { checkRingAssets, registerThemeOverride, registerTokenRing } from './theme.mjs';
import { introduce, forget, knownFactions, playerCharacters, registerCleanup, setScore } from './factions.mjs';
import { preloadTemplates, showReputationRule } from './view.mjs';
import { createAlthas } from './althas.mjs';
import { activeConflicts, promptConflicts } from './conflicts.mjs';
import { countdownSettingId } from './countdowns.mjs';

/** Conflicting modules found at init. While any is active, only the faction data type is registered. */
let conflicts = [];

/**
 * Load the stylesheet with a version query. Foundry links module CSS by bare path, and a caching
 * proxy would otherwise keep serving last release's styles. Same cascade layer Foundry uses for module styles.
 */
function loadStyles() {
    const version = game.modules.get(MODULE_ID)?.version ?? Date.now();
    const style = document.createElement('style');
    style.id = `${MODULE_ID}-styles`;
    style.textContent = `@import url("modules/${MODULE_ID}/styles/five-banners.css?v=${encodeURIComponent(version)}") layer(modules);`;
    document.head.append(style);
}

function registerSettings() {
    game.settings.register(MODULE_ID, 'sheetTheme', {
        name: 'DH5B.Settings.SheetTheme.Name',
        hint: 'DH5B.Settings.SheetTheme.Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });
    game.settings.register(MODULE_ID, 'tokenRing', {
        name: 'DH5B.Settings.TokenRing.Name',
        hint: 'DH5B.Settings.TokenRing.Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });
    game.settings.register(MODULE_ID, 'reputation', {
        name: 'DH5B.Settings.Reputation.Name',
        hint: 'DH5B.Settings.Reputation.Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
        onChange: rerenderSheets
    });
    game.settings.register(MODULE_ID, 'marksPerRank', {
        name: 'DH5B.Settings.MarksPerRank.Name',
        hint: 'DH5B.Settings.MarksPerRank.Hint',
        scope: 'world',
        config: true,
        type: new foundry.data.fields.NumberField({ required: true, integer: true, min: 1, max: 5, step: 1, initial: 3 }),
        default: 3,
        onChange: rerenderSheets
    });
    game.settings.register(MODULE_ID, 'playersMarkReputation', {
        name: 'DH5B.Settings.PlayersMark.Name',
        hint: 'DH5B.Settings.PlayersMark.Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: false,
        onChange: rerenderSheets
    });
    game.settings.register(MODULE_ID, 'mirrorRelations', {
        name: 'DH5B.Settings.Mirror.Name',
        hint: 'DH5B.Settings.Mirror.Hint',
        scope: 'world',
        config: true,
        type: Boolean,
        default: true
    });
}

/** Re-render open character and faction sheets after a setting change. */
function rerenderSheets() {
    for (const app of foundry.applications.instances.values()) {
        const doc = app.document;
        if (!app.rendered || !doc) continue;
        if ((doc.documentName === 'Actor' && doc.type === 'character') || doc.type === FACTION_TYPE) app.render();
    }
}

Hooks.once('init', () => {
    loadStyles();
    registerSettings();
    conflicts = activeConflicts();

    CONFIG.Item.dataModels[FACTION_TYPE] = FactionData;
    CONFIG.Item.typeIcons ??= {};
    CONFIG.Item.typeIcons[FACTION_TYPE] = 'fa-solid fa-flag';
    foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, MODULE_ID, FactionSheet, {
        types: [FACTION_TYPE],
        makeDefault: true,
        label: 'DH5B.Sheet.Label'
    });
    if (conflicts.length) {
        console.error(`${MODULE_ID} | inactive: disable ${conflicts.map(m => m.id).join(', ')} to use Five Banners`);
        return;
    }

    registerThemeOverride();
    registerTokenRing();
    registerCharacterTab();
    registerCleanup();
    preloadTemplates();

    game.modules.get(MODULE_ID).api = {
        introduce,
        forget,
        setScore,
        knownFactions,
        playerCharacters,
        createAlthas,
        showReputationRule,
        resetSettings,
        rules
    };
});

/** New factions get a banner instead of the generic item bag. */
Hooks.on('preCreateItem', (item, data) => {
    if (item.type !== FACTION_TYPE || data.img) return;
    item.updateSource({ img: 'icons/sundries/flags/banner-flag-red-white.webp' });
});

Hooks.once('ready', () => {
    if (conflicts.length) return promptConflicts(conflicts);
    checkRingAssets();
});

/** Objective progress lives in the system's countdowns: keep open faction sheets in step with the tracker. */
Hooks.on('updateSetting', setting => {
    if (conflicts.length || setting.key !== countdownSettingId()) return;
    for (const app of foundry.applications.instances.values()) {
        if (app.rendered && app.document?.type === FACTION_TYPE) app.render({ parts: ['objectives'] });
    }
});

/**
 * When the module is disabled, put every option back to its default, so re-enabling starts fresh.
 * Foundry saves the new module list before reloading, while this code is still loaded on every client:
 * the GM resets world options and each client resets its own. Theme and token ring overrides are never
 * written to Foundry's own settings, so they disappear with the module. Factions and reputation are kept.
 */
Hooks.on('updateSetting', setting => {
    if (setting.key !== 'core.moduleConfiguration') return;
    if (game.settings.get('core', 'moduleConfiguration')?.[MODULE_ID] !== false) return;
    resetSettings().catch(err => console.warn(`${MODULE_ID} | could not reset settings`, err));
});

export async function resetSettings() {
    for (const s of game.settings.settings.values()) {
        if (s.namespace !== MODULE_ID || !s.config) continue;
        if (s.scope === CONST.SETTING_SCOPES.WORLD && !game.user.isActiveGM) continue;
        await game.settings.set(MODULE_ID, s.key, s.default);
    }
}

/** GM-only "Five Banners" section in the Daggerheart sidebar menu. */
Hooks.on('renderDaggerheartMenu', (app, html) => {
    if (!game.user.isGM || conflicts.length) return;
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root || root.querySelector('.dh5b-menu')) return;
    const anchor = root.querySelectorAll('fieldset');
    const last = anchor[anchor.length - 1];
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'dh5b-menu';
    fieldset.innerHTML = `
        <legend>${game.i18n.localize('DH5B.Menu.Legend')}</legend>
        <div class="menu-options-container">
            <div class="menu-options-inner-container">
                <button type="button" data-dh5b="new"><i class="fa-solid fa-flag"></i> ${game.i18n.localize('DH5B.Menu.NewFaction')}</button>
                <button type="button" data-dh5b="althas"><i class="fa-solid fa-chess-rook"></i> ${game.i18n.localize('DH5B.Menu.Althas')}</button>
                <button type="button" data-dh5b="rule"><i class="fa-solid fa-scroll"></i> ${game.i18n.localize('DH5B.Reputation.RuleLink')}</button>
            </div>
        </div>`;
    fieldset.querySelector('[data-dh5b="new"]').addEventListener('click', async () => {
        const item = await Item.create({ name: game.i18n.localize('DH5B.Menu.NewFactionName'), type: FACTION_TYPE });
        item?.sheet.render({ force: true });
    });
    fieldset.querySelector('[data-dh5b="althas"]').addEventListener('click', () => createAlthas());
    fieldset.querySelector('[data-dh5b="rule"]').addEventListener('click', () => showReputationRule());
    if (last) last.after(fieldset);
    else root.append(fieldset);
});
