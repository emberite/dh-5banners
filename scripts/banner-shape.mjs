/**
 * Banner silhouettes. The Core Rulebook's nation banners are line art on transparency, each drawn
 * in its own shape (swallowtail, shield, pennant…). To fill a banner with its faction's color, we
 * trace the shape once per image: everything transparent that can be reached from the image's
 * edge is outside, the rest is the banner. Small gaps in the outline are closed first so hatching
 * inside the banner doesn't leak. The result is a PNG mask used with CSS mask-image.
 *
 * Images without enough transparency around them (square icons, photos) get no mask, and the
 * stylesheet falls back to a generic pennant shape.
 */

const cache = new Map();
const WORK_HEIGHT = 240; // trace at this height; plenty for a mask shown at ~100–130px
const INK_ALPHA = 6; // alpha that counts as part of the drawing
const CLOSE_RADIUS = 2; // px (at work size) to close gaps in the outline
const MIN_OUTSIDE = 0.005; // need at least this much transparent surround to call it a shape (opaque images have none)

/** Data URL of the banner's silhouette mask, or null if the image has no usable shape. Cached per src. */
export function bannerMask(src) {
    if (!src) return Promise.resolve(null);
    if (!cache.has(src)) cache.set(src, traceMask(src).catch(() => null));
    return cache.get(src);
}

async function traceMask(src) {
    const img = await loadImage(src);
    const scale = Math.min(1, WORK_HEIGHT / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    // Ink map, then close small gaps with a square dilation.
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) ink[i] = data[i * 4 + 3] > INK_ALPHA ? 1 : 0;
    const solid = dilate(ink, w, h, CLOSE_RADIUS);

    // Flood fill the outside from every edge pixel that isn't ink.
    const outside = new Uint8Array(w * h);
    const stack = [];
    const push = i => {
        if (!outside[i] && !solid[i]) {
            outside[i] = 1;
            stack.push(i);
        }
    };
    for (let x = 0; x < w; x++) {
        push(x);
        push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
        push(y * w);
        push(y * w + w - 1);
    }
    while (stack.length) {
        const i = stack.pop();
        const x = i % w;
        if (x > 0) push(i - 1);
        if (x < w - 1) push(i + 1);
        if (i >= w) push(i - w);
        if (i < w * (h - 1)) push(i + w);
    }

    let outsideCount = 0;
    for (let i = 0; i < w * h; i++) outsideCount += outside[i];
    if (outsideCount / (w * h) < MIN_OUTSIDE) return null;

    // The dilation grew the shape by CLOSE_RADIUS; shrink the outside region back by the same amount
    // (i.e. grow "outside" into the dilated rim) so the mask hugs the drawn outline.
    const grownOutside = dilate(outside, w, h, CLOSE_RADIUS, ink);

    const mask = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
        const inside = !grownOutside[i];
        mask.data[i * 4] = 255;
        mask.data[i * 4 + 1] = 255;
        mask.data[i * 4 + 2] = 255;
        mask.data[i * 4 + 3] = inside ? 255 : 0;
    }
    ctx.putImageData(mask, 0, 0);
    return canvas.toDataURL('image/png');
}

/** Square dilation of a binary map. Pixels set in `keep` are never added. */
function dilate(src, w, h, r, keep = null) {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            if (src[i]) {
                out[i] = 1;
                continue;
            }
            if (keep?.[i]) continue;
            let hit = 0;
            for (let dy = -r; dy <= r && !hit; dy++) {
                const yy = y + dy;
                if (yy < 0 || yy >= h) continue;
                for (let dx = -r; dx <= r; dx++) {
                    const xx = x + dx;
                    if (xx >= 0 && xx < w && src[yy * w + xx]) {
                        hit = 1;
                        break;
                    }
                }
            }
            out[i] = hit;
        }
    }
    return out;
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Give every banner element under `root` its own shape. Elements are `[data-dh5b-banner]`
 * wrappers containing the image; they get the `shaped` class and a --dh5b-mask variable.
 */
export function shapeBanners(root) {
    for (const el of root?.querySelectorAll?.('[data-dh5b-banner]') ?? []) {
        const src = el.querySelector('img')?.getAttribute('src');
        bannerMask(src).then(url => {
            el.classList.toggle('shaped', !!url);
            el.classList.remove('dh5b-shape-pending');
            if (url) el.style.setProperty('--dh5b-mask', `url("${url}")`);
            else el.style.removeProperty('--dh5b-mask');
        });
    }
}
