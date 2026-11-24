import { MODULE_ID } from './rules.mjs';

/**
 * Modules that can't run alongside Five Banners. Foundry only labels manifest conflicts as
 * "Known Conflict" and loads both anyway, so the module checks for them itself and stays
 * inactive while any of them is enabled.
 */
export const CONFLICTS = ['dh-hotpot', 'dh-weredragon', 'dh-horizon'];

/** Active conflicting modules (valid from the init hook on). */
export function activeConflicts() {
    return CONFLICTS.map(id => game.modules.get(id)).filter(m => m?.active);
}

/**
 * Tell everyone Five Banners is off, and let the GM pick which side to disable.
 * Either choice saves the module list and reloads the world.
 */
export async function promptConflicts(conflicts) {
    const names = conflicts.map(m => m.title).join(', ');
    if (!game.user.isGM) {
        ui.notifications.error(game.i18n.format('DH5B.Conflict.Player', { modules: names }), { permanent: true });
        return;
    }
    const list = conflicts.map(m => `<li><strong>${m.title}</strong> <code>${m.id}</code></li>`).join('');
    const choice = await foundry.applications.api.DialogV2.wait({
        window: { title: 'DH5B.Conflict.Title', icon: 'fa-solid fa-triangle-exclamation' },
        classes: ['dh5b', 'dh5b-dialog'],
        position: { width: 480 },
        content: `<p>${game.i18n.localize('DH5B.Conflict.Body')}</p><ul>${list}</ul><p class="hint">${game.i18n.localize('DH5B.Conflict.Hint')}</p>`,
        buttons: [
            { action: 'others', label: game.i18n.format('DH5B.Conflict.DisableOthers', { modules: names }), icon: 'fa-solid fa-power-off', default: true },
            { action: 'self', label: 'DH5B.Conflict.DisableSelf', icon: 'fa-solid fa-flag' },
            { action: 'later', label: 'DH5B.Conflict.Later' }
        ],
        rejectClose: false
    });
    if (choice !== 'others' && choice !== 'self') {
        ui.notifications.error(game.i18n.format('DH5B.Conflict.Inactive', { modules: names }), { permanent: true });
        return;
    }
    const config = foundry.utils.deepClone(game.settings.get('core', 'moduleConfiguration'));
    if (choice === 'others') for (const m of conflicts) config[m.id] = false;
    else config[MODULE_ID] = false;
    await game.settings.set('core', 'moduleConfiguration', config);
    foundry.utils.debouncedReload();
}
