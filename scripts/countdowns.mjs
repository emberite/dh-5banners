/**
 * Faction objectives run on the Daggerheart system's own countdowns (the Countdowns tracker).
 * The faction only keeps the objective's definition and the id of the countdown it started;
 * progress lives in the system's "Countdowns" world setting.
 */

function settingKey() {
    return CONFIG.DH?.SETTINGS?.gameSettings?.Countdowns ?? 'Countdowns';
}

function systemId() {
    return CONFIG.DH?.id ?? 'daggerheart';
}

/** Full setting key as it appears in updateSetting hooks, e.g. "daggerheart.Countdowns". */
export function countdownSettingId() {
    return `${systemId()}.${settingKey()}`;
}

function countdownData() {
    return game.settings.get(systemId(), settingKey());
}

/** The system countdown with this id, or null if it was never started or has been deleted. */
export function getCountdown(id) {
    if (!id) return null;
    return countdownData()?.countdowns?.[id] ?? null;
}

/** Create a narrative countdown in the system tracker and return its id. GM only (it's a world setting). */
export async function createCountdown({ name, img, start, hidden }) {
    const data = countdownData();
    const id = foundry.utils.randomID();
    const countdown = {
        type: CONFIG.DH.GENERAL.countdownTypes.narrative.id,
        name,
        img,
        hidden,
        progress: { start, current: start }
    };
    data.updateSource({ countdowns: { [id]: countdown } });
    await game.settings.set(systemId(), settingKey(), data.toObject());
    return id;
}

/** Change fields of a running countdown (name, hidden…). Ignored if it's gone. */
export async function updateCountdown(id, changes) {
    const data = countdownData();
    if (!data.countdowns[id]) return;
    const update = {};
    for (const [k, v] of Object.entries(changes)) update[`countdowns.${id}.${k}`] = v;
    data.updateSource(update);
    await game.settings.set(systemId(), settingKey(), data.toObject());
}

export async function deleteCountdown(id) {
    const countdown = getCountdown(id);
    if (countdown) await countdown.delete();
}

/** Open the system's countdown editor (GM). */
export function openCountdownEditor() {
    const Edit = game.system.api?.applications?.ui?.CountdownEdit;
    if (Edit) new Edit().render(true);
}
