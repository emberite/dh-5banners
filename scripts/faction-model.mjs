import { MAX_RATING } from './rules.mjs';

const fields = foundry.data.fields;

/** Data for the Faction item type. */
export class FactionData extends foundry.abstract.TypeDataModel {
    /** The Daggerheart system reads item metadata in a few places; keep it from treating factions as gear. */
    static get metadata() {
        return {
            label: 'TYPES.Item.dh-5banners.faction',
            type: 'faction',
            hasDescription: true,
            hasResource: false,
            isInventoryItem: false,
            hasActions: false,
            hasAttribution: false,
            isQuantifiable: false
        };
    }

    get metadata() {
        return this.constructor.metadata;
    }

    static defineSchema() {
        return {
            kind: new fields.StringField({ required: true, blank: true, initial: '' }),
            motto: new fields.StringField({ required: true, blank: true, initial: '' }),
            color: new fields.ColorField({ required: true, nullable: false, initial: '#cb5b1a' }),
            description: new fields.HTMLField({ required: true, blank: true, initial: '' }),
            assets: new fields.HTMLField({ required: true, blank: true, initial: '' }),
            problems: new fields.HTMLField({ required: true, blank: true, initial: '' }),
            gmNotes: new fields.HTMLField({ required: true, blank: true, initial: '' }),
            relations: new fields.ArrayField(
                new fields.SchemaField({
                    id: new fields.StringField({ required: true, blank: false }),
                    value: new fields.NumberField({ required: true, integer: true, min: -MAX_RATING, max: MAX_RATING, initial: 0 }),
                    note: new fields.StringField({ required: true, blank: true, initial: '' })
                })
            ),
            objectives: new fields.ArrayField(
                new fields.SchemaField({
                    id: new fields.StringField({ required: true, blank: false }),
                    name: new fields.StringField({ required: true, blank: true, initial: '' }),
                    kind: new fields.StringField({ required: true, choices: ['major', 'minor'], initial: 'minor' }),
                    max: new fields.NumberField({ required: true, integer: true, min: 1, max: 12, initial: 4 }),
                    value: new fields.NumberField({ required: true, integer: true, min: 0, max: 12, initial: 4 }),
                    secret: new fields.BooleanField({ initial: true })
                })
            )
        };
    }

    /* Small shims for system code that calls these on every item. */
    getRollData() {
        return {};
    }

    getLinkedItems() {
        return [];
    }

    async getEnrichedDescription() {
        return foundry.applications.ux.TextEditor.implementation.enrichHTML(this.description, { relativeTo: this.parent });
    }
}
