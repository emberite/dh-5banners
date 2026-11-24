import { FACTION_TYPE } from './rules.mjs';

const ART = 'modules/daggerheart-core/assets/art';

/**
 * The five nations of Althas as starter factions: names, banner art from the Core Rulebook module
 * and the relationship ratings from the Five Banners Burning campaign frame. Descriptions are left
 * for the GM; the rulebook has the details.
 */
const NATIONS = [
    { key: 'armada', name: 'Armada', kind: 'DH5B.Althas.Federation', color: '#2f6f86', img: `${ART}/frame-250-fivebanners-armadabanner.webp` },
    { key: 'hilltop', name: 'Hilltop', kind: 'DH5B.Althas.Theocracy', color: '#c9a227', img: `${ART}/frame-250-fivebanners-hilltopbanner.webp` },
    { key: 'jesthaen', name: 'Jesthaen', kind: 'DH5B.Althas.Republic', color: '#a8322d', img: `${ART}/frame-250-fivebanners-jesthaenbanner.webp` },
    { key: 'polaris', name: 'Polaris', kind: 'DH5B.Althas.Magocracy', color: '#4b5fb3', img: `${ART}/frame-250-fivebanners-polarisbanner.webp` },
    { key: 'voldaen', name: 'Voldaen', kind: 'DH5B.Althas.Monarchy', color: '#6b3d8f', img: `${ART}/frame-250-fivebanners-voldaenbanner.webp` }
];

/** Core Rulebook, Five Banners Burning → Faction Relationships. Symmetric. */
const RELATIONS = {
    armada: { jesthaen: 2, polaris: 1, voldaen: -1, hilltop: -2 },
    hilltop: { voldaen: 2, armada: -2, jesthaen: -2, polaris: -3 },
    jesthaen: { armada: 2, polaris: 1, hilltop: -2, voldaen: -3 },
    polaris: { armada: 1, jesthaen: 1, voldaen: -2, hilltop: -3 },
    voldaen: { hilltop: 2, armada: -1, polaris: -2, jesthaen: -3 }
};

/** Create (or complete) the five nations in an Items folder. Existing nations with the same name are reused. */
export async function createAlthas() {
    if (!game.user.isGM) return;
    const folderName = game.i18n.localize('DH5B.Althas.Folder');
    const folder =
        game.folders.find(f => f.type === 'Item' && f.name === folderName) ??
        (await Folder.create({ name: folderName, type: 'Item', color: '#cb5b1a' }));

    const ids = {};
    const toCreate = [];
    for (const n of NATIONS) {
        const existing = game.items.find(i => i.type === FACTION_TYPE && i.name === n.name);
        if (existing) ids[n.key] = existing.id;
        else {
            const _id = foundry.utils.randomID();
            ids[n.key] = _id;
            toCreate.push({
                _id,
                name: n.name,
                type: FACTION_TYPE,
                img: n.img,
                folder: folder.id,
                system: { kind: game.i18n.localize(n.kind), color: n.color }
            });
        }
    }
    if (toCreate.length) await Item.createDocuments(toCreate, { keepId: true });

    // Fill in relationships that aren't set yet; the GM's own edits win.
    for (const n of NATIONS) {
        const item = game.items.get(ids[n.key]);
        if (!item) continue;
        const relations = item.system.relations.map(r => ({ ...r }));
        for (const [otherKey, value] of Object.entries(RELATIONS[n.key])) {
            const otherId = ids[otherKey];
            if (otherId && !relations.some(r => r.id === otherId)) relations.push({ id: otherId, value, note: '' });
        }
        if (relations.length !== item.system.relations.length) await item.update({ 'system.relations': relations });
    }
    ui.notifications.info(game.i18n.format('DH5B.Althas.Created', { count: toCreate.length }));
    ui.items?.activate?.();
    return NATIONS.map(n => game.items.get(ids[n.key]));
}
