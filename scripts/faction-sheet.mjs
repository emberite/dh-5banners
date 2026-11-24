import { FACTION_TYPE, MODULE_ID, OBJECTIVE_LIMITS, OBJECTIVE_STEPS, clamp, scoreAfterClick, withRelation, withoutRelation } from './rules.mjs';
import { shapeBanners } from './banner-shape.mjs';
import { createCountdown, deleteCountdown, getCountdown, openCountdownEditor, updateCountdown } from './countdowns.mjs';
import { charactersFor, charactersKnowing, factionFlags, introduce, isFaction, playerCharacters, setScore } from './factions.mjs';
import { ratingChoices, relationChips, showReputationRule, trackContext } from './view.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const T = path => `modules/${MODULE_ID}/templates/faction/${path}.hbs`;

/** Sheet for the Faction item: banner, relationships, objective countdowns and who knows the faction. */
export class FactionSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ['dh5b', 'dh5b-faction-sheet'],
        position: { width: 640, height: 720 },
        window: { resizable: true },
        form: { submitOnChange: true, closeOnSubmit: false },
        actions: {
            editImage: FactionSheet.#onEditImage,
            openFaction: FactionSheet.#onOpenFaction,
            removeRelation: FactionSheet.#onRemoveRelation,
            addObjective: FactionSheet.#onAddObjective,
            removeObjective: FactionSheet.#onRemoveObjective,
            startCountdown: FactionSheet.#onStartCountdown,
            openCountdowns: () => openCountdownEditor(),
            toggleSecret: FactionSheet.#onToggleSecret,
            introduceParty: FactionSheet.#onIntroduceParty,
            openActor: FactionSheet.#onOpenActor,
            dh5bMark: FactionSheet.#onMark,
            dh5bStep: FactionSheet.#onStep,
            dh5bRule: () => showReputationRule()
        }
    };

    static PARTS = {
        header: { template: T('header') },
        tabs: { template: 'templates/generic/tab-navigation.hbs' },
        overview: { template: T('overview'), scrollable: [''] },
        relations: { template: T('relations'), scrollable: [''] },
        objectives: { template: T('objectives'), scrollable: [''] },
        reputation: { template: T('reputation'), scrollable: [''] },
        notes: { template: T('notes'), scrollable: [''] }
    };

    static TABS = {
        primary: {
            tabs: [
                { id: 'overview', icon: 'fa-solid fa-flag' },
                { id: 'relations', icon: 'fa-solid fa-handshake' },
                { id: 'objectives', icon: 'fa-solid fa-hourglass-half' },
                { id: 'reputation', icon: 'fa-solid fa-scale-balanced' },
                { id: 'notes', icon: 'fa-solid fa-feather' }
            ],
            initial: 'overview',
            labelPrefix: 'DH5B.Sheet.Tabs'
        }
    };

    /** GM-only tabs are dropped for players. */
    _configureRenderParts(options) {
        const parts = super._configureRenderParts(options);
        if (!game.user.isGM) delete parts.notes;
        return parts;
    }

    _prepareTabs(group) {
        const tabs = super._prepareTabs(group);
        if (!game.user.isGM) delete tabs.notes;
        return tabs;
    }

    /** Drag & drop works on the whole sheet (factions → relationships, characters → introduce). */
    _onRender(context, options) {
        super._onRender(context, options);
        shapeBanners(this.element);
        if (options.isFirstRender) {
            new foundry.applications.ux.DragDrop.implementation({
                dropSelector: null,
                permissions: { drop: () => this.isEditable },
                callbacks: { drop: this._onDropAny.bind(this) }
            }).bind(this.element);
        }

        for (const el of this.element.querySelectorAll('[data-rel-field]')) {
            el.addEventListener('change', ev => this.#onRelationChange(ev));
        }
        for (const el of this.element.querySelectorAll('[data-obj-field]')) {
            el.addEventListener('change', ev => this.#onObjectiveChange(ev));
        }
        this.element.querySelector('[data-add-relation]')?.addEventListener('change', ev => {
            const id = ev.currentTarget.value;
            if (id) this.setRelation(id, 0);
        });
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const item = this.document;
        const system = item.system;
        const TextEditor = foundry.applications.ux.TextEditor.implementation;
        const enrich = html => TextEditor.enrichHTML(html, { relativeTo: item, secrets: item.isOwner });
        const isGM = game.user.isGM;

        context.item = item;
        context.system = system;
        context.fields = system.schema.fields;
        context.isGM = isGM;
        context.editable = this.isEditable;
        context.color = system.color?.css ?? system.color;
        context.enriched = {
            description: await enrich(system.description),
            assets: await enrich(system.assets),
            problems: await enrich(system.problems),
            gmNotes: isGM ? await enrich(system.gmNotes) : ''
        };
        context.reputationOn = game.settings.get(MODULE_ID, 'reputation');

        // Relationships
        context.ratingChoices = ratingChoices();
        const chips = relationChips(item, isGM ? null : visibleFactionIds());
        context.relations = chips.map(c => ({
            ...c,
            choices: context.ratingChoices.map(o => ({ ...o, selected: o.value === c.value }))
        }));
        const related = new Set(system.relations.map(r => r.id));
        context.addable = game.items
            .filter(i => isFaction(i) && i.id !== item.id && !related.has(i.id))
            .map(i => ({ id: i.id, name: i.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
        context.mirror = game.settings.get(MODULE_ID, 'mirrorRelations');

        // Objectives: definitions here, progress in the system's countdowns once started.
        // Before a countdown starts, hidden objectives are GM-only; after, the countdown's own visibility decides.
        context.objectives = [];
        const counts = { major: 0, minor: 0 };
        for (const o of system.objectives) {
            const countdown = getCountdown(o.countdownId);
            const started = !!countdown;
            const start = started ? countdown.progress.start : o.max;
            const current = started ? countdown.progress.current : o.max;
            const done = started && current <= 0;
            const secret = started ? countdown.hidden : o.secret;
            if (!done) counts[o.kind]++;
            if (!isGM && (started ? !countdown.visible : o.secret)) continue;
            context.objectives.push({
                ...o,
                secret,
                started,
                done,
                start,
                current,
                pips: Array.from({ length: start }, (_, i) => ({ filled: started && i < start - current })),
                kindLabel: game.i18n.localize(`DH5B.Objectives.${o.kind}`)
            });
        }
        context.objectives.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'major' ? -1 : 1));
        context.canAddMajor = counts.major < OBJECTIVE_LIMITS.major;
        context.canAddMinor = counts.minor < OBJECTIVE_LIMITS.minor;

        // Who knows this faction (players only see their own characters)
        context.knownBy = charactersKnowing(item.id)
            .filter(({ actor }) => isGM || actor.isOwner)
            .map(({ actor, score }) => ({
                uuid: actor.uuid,
                id: actor.id,
                name: actor.name,
                img: actor.img,
                track: trackContext(score, { canMark: isGM, factionId: item.id, actorUuid: actor.uuid })
            }));
        context.canIntroduce = isGM && playerCharacters().some(a => !factionFlags(a)[item.id]);
        return context;
    }

    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        if (context.tabs?.[partId]) context.tab = context.tabs[partId];
        return context;
    }

    /* ---------- relationships ---------- */

    /** Set the relationship toward another faction (and mirror it if that option is on). */
    async setRelation(otherId, value, note) {
        const item = this.document;
        await item.update({ 'system.relations': withRelation(item.system.relations, otherId, value, note) });
        const other = game.items.get(otherId);
        if (game.settings.get(MODULE_ID, 'mirrorRelations') && isFaction(other) && other.isOwner) {
            const existing = other.system.relations.find(r => r.id === item.id);
            if (existing?.value !== value) await other.update({ 'system.relations': withRelation(other.system.relations, item.id, value) });
        }
    }

    async #onRelationChange(event) {
        const el = event.currentTarget;
        const id = el.closest('[data-relation-id]')?.dataset.relationId;
        if (!id) return;
        event.stopPropagation();
        const current = this.document.system.relations.find(r => r.id === id);
        if (el.dataset.relField === 'value') await this.setRelation(id, Number(el.value), current?.note);
        else await this.document.update({ 'system.relations': withRelation(this.document.system.relations, id, current?.value ?? 0, el.value) });
    }

    static async #onRemoveRelation(event, target) {
        const id = target.closest('[data-relation-id]')?.dataset.relationId;
        if (!id) return;
        await this.document.update({ 'system.relations': withoutRelation(this.document.system.relations, id) });
        const other = game.items.get(id);
        if (game.settings.get(MODULE_ID, 'mirrorRelations') && isFaction(other) && other.isOwner) {
            await other.update({ 'system.relations': withoutRelation(other.system.relations, this.document.id) });
        }
    }

    /* ---------- objectives ---------- */

    #objective(target) {
        const id = target.closest('[data-objective-id]')?.dataset.objectiveId;
        return this.document.system.objectives.find(o => o.id === id) ?? null;
    }

    #objectiveName(o) {
        return o.name || game.i18n.localize(`DH5B.Objectives.${o.kind}`);
    }

    async #updateObjective(id, changes) {
        const objectives = this.document.system.objectives.map(o => (o.id === id ? { ...o, ...changes } : { ...o }));
        for (const o of objectives) o.max = clamp(Math.round(Number(o.max) || 1), 1, 12);
        await this.document.update({ 'system.objectives': objectives });
    }

    async #onObjectiveChange(event) {
        const el = event.currentTarget;
        const o = this.#objective(el);
        if (!o) return;
        event.stopPropagation();
        const field = el.dataset.objField;
        await this.#updateObjective(o.id, { [field]: field === 'max' ? Number(el.value) : el.value });
        // A running countdown follows the objective's name.
        if (field === 'name' && getCountdown(o.countdownId)) {
            await updateCountdown(o.countdownId, { name: `${this.document.name}: ${this.#objectiveName({ ...o, name: el.value })}` });
        }
    }

    static async #onAddObjective(event, target) {
        const kind = target.dataset.kind === 'major' ? 'major' : 'minor';
        const objectives = [
            ...this.document.system.objectives.map(o => ({ ...o })),
            { id: foundry.utils.randomID(), name: '', kind, max: OBJECTIVE_STEPS[kind], secret: true, countdownId: '' }
        ];
        await this.document.update({ 'system.objectives': objectives });
    }

    /** Removing an objective also removes its countdown from the tracker (after asking, if one is running). */
    static async #onRemoveObjective(event, target) {
        const o = this.#objective(target);
        if (!o) return;
        const countdown = getCountdown(o.countdownId);
        if (countdown) {
            const ok = await foundry.applications.api.DialogV2.confirm({
                window: { title: 'DH5B.Objectives.Remove' },
                content: `<p>${game.i18n.format('DH5B.Objectives.RemoveConfirm', { name: this.#objectiveName(o) })}</p>`
            });
            if (!ok) return;
            await deleteCountdown(o.countdownId);
        }
        await this.document.update({ 'system.objectives': this.document.system.objectives.filter(x => x.id !== o.id).map(x => ({ ...x })) });
    }

    /** Start the objective as a narrative countdown in the system's Countdowns tracker. */
    static async #onStartCountdown(event, target) {
        if (!game.user.isGM) return;
        const o = this.#objective(target);
        if (!o || getCountdown(o.countdownId)) return;
        const countdownId = await createCountdown({
            name: `${this.document.name}: ${this.#objectiveName(o)}`,
            img: this.document.img,
            start: o.max,
            hidden: o.secret
        });
        await this.#updateObjective(o.id, { countdownId });
        ui.notifications.info(game.i18n.format('DH5B.Objectives.Started', { name: this.#objectiveName(o) }));
    }

    static async #onToggleSecret(event, target) {
        const o = this.#objective(target);
        if (!o) return;
        const countdown = getCountdown(o.countdownId);
        if (countdown) await updateCountdown(o.countdownId, { hidden: !countdown.hidden });
        else await this.#updateObjective(o.id, { secret: !o.secret });
    }

    /* ---------- reputation ---------- */

    static async #onIntroduceParty() {
        await introduce(this.document, playerCharacters());
        this.render();
    }

    static async #onMark(event, target) {
        const actor = await fromUuid(target.closest('[data-actor-uuid]')?.dataset.actorUuid);
        if (!actor) return;
        const current = factionFlags(actor)[this.document.id]?.score ?? 0;
        await setScore(actor, this.document.id, scoreAfterClick(current, Number(target.dataset.value)));
        this.render();
    }

    static async #onStep(event, target) {
        const actor = await fromUuid(target.closest('[data-actor-uuid]')?.dataset.actorUuid);
        if (!actor) return;
        const current = factionFlags(actor)[this.document.id]?.score ?? 0;
        await setScore(actor, this.document.id, current + (Number(target.dataset.delta) || 0));
        this.render();
    }

    static async #onOpenActor(event, target) {
        const actor = await fromUuid(target.closest('[data-actor-uuid]')?.dataset.actorUuid);
        actor?.sheet.render({ force: true });
    }

    /* ---------- misc ---------- */

    static async #onEditImage(event, target) {
        if (!this.isEditable) return;
        const fp = new foundry.applications.apps.FilePicker.implementation({
            type: 'image',
            current: this.document.img,
            callback: path => this.document.update({ img: path })
        });
        fp.render({ force: true });
    }

    static #onOpenFaction(event, target) {
        const id = target.closest('[data-faction-id]')?.dataset.factionId ?? target.closest('[data-relation-id]')?.dataset.relationId;
        const faction = game.items.get(id);
        if (faction?.testUserPermission(game.user, 'LIMITED')) faction.sheet.render({ force: true });
    }

    /** Factions dropped here become relationships; characters (or a party) dropped here meet the faction. */
    async _onDropAny(event) {
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
        if (!data?.uuid) return;
        const doc = await fromUuid(data.uuid);
        if (isFaction(doc) && doc.id !== this.document.id && !doc.pack) {
            if (!this.document.system.relations.some(r => r.id === doc.id)) await this.setRelation(doc.id, 0);
            this.changeTab('relations', 'primary');
        } else if (doc?.documentName === 'Actor') {
            const targets = charactersFor(doc);
            if (targets.length) {
                await introduce(this.document, targets);
                this.changeTab('reputation', 'primary');
                this.render();
            }
        }
    }
}

/** World factions the current user may look at. */
function visibleFactionIds() {
    return new Set(game.items.filter(i => i.type === FACTION_TYPE && i.testUserPermission(game.user, 'LIMITED')).map(i => i.id));
}
