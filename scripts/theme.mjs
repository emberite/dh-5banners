import { MODULE_ID } from './rules.mjs';

/** The Core Rulebook module's Five Banners Burning sheet theme. */
export const SHEET_THEME = 'five-banners';

/** Ring config id for the Core Rulebook module's Five Banners Burning token ring. */
export const RING_ID = 'dh5bFiveBannersBurning';
export const RING_SPRITESHEET = 'modules/daggerheart-core/assets/dynamic/five-banners-burning/rings.json';

/**
 * Sheet theme override. Nothing is written to the users' own theme choices (core.sheetThemes);
 * the override only exists while this module's code is loaded, so disabling the module restores
 * whatever each user picked before.
 */
export function registerThemeOverride() {
    const Config = foundry.applications.apps.DocumentSheetConfig;
    const original = Config.getSheetThemeForDocument;
    Config.getSheetThemeForDocument = function (document) {
        const picked = original.call(this, document);
        if (!game.settings.get(MODULE_ID, 'sheetTheme')) return picked;
        try {
            const { documentName, type = CONST.BASE_DOCUMENT_TYPE } = document;
            const { defaultClass } = this.getSheetClassesForSubType(documentName, type);
            const sheetClass = document.getFlag?.('core', 'sheetClass') || defaultClass;
            const themes = CONFIG[documentName]?.sheetClasses?.[type]?.[sheetClass]?.themes ?? {};
            if (SHEET_THEME in themes) return SHEET_THEME;
        } catch (err) {
            console.warn(`${MODULE_ID} | could not resolve sheet theme`, err);
        }
        return picked;
    };
}

/**
 * Register the Five Banners Burning token ring and, while the option is on, use it instead of
 * the ring chosen in Foundry's settings. Foundry picks the ring right after this hook from the
 * "dynamicTokenRing" setting; redirecting that one call keeps the setting itself untouched.
 */
export function registerTokenRing() {
    Hooks.once('initializeDynamicTokenRingConfig', ringConfig => {
        const data = new foundry.canvas.placeables.tokens.DynamicRingData({
            id: RING_ID,
            label: 'DH5B.Ring.Label',
            spritesheet: RING_SPRITESHEET,
            effects: {
                RING_PULSE: 'TOKEN.RING.EFFECTS.RING_PULSE',
                RING_GRADIENT: 'TOKEN.RING.EFFECTS.RING_GRADIENT',
                BKG_WAVE: 'TOKEN.RING.EFFECTS.BKG_WAVE',
                INVISIBILITY: 'TOKEN.RING.EFFECTS.INVISIBILITY'
            }
        });
        ringConfig.addConfig(RING_ID, data);
        if (!game.settings.get(MODULE_ID, 'tokenRing')) return;
        ringConfig.useConfig = function (id) {
            delete this.useConfig; // one-shot: back to the prototype method
            return this.useConfig(RING_ID) || this.useConfig(id);
        };
    });
}

/** Warn the GM once if the installed Core Rulebook module doesn't ship the Five Banners ring art. */
export async function checkRingAssets() {
    if (!game.user.isGM || !game.settings.get(MODULE_ID, 'tokenRing')) return;
    try {
        const res = await fetch(RING_SPRITESHEET, { method: 'HEAD' });
        if (res.ok) return;
    } catch {
        /* fall through */
    }
    ui.notifications.warn('DH5B.Notify.RingMissing', { localize: true, permanent: true });
}
