# Realistic Krathong artwork

Mode: built-in image generation (transparent background). No Higgsfield account or generation is used by visitors. Files are packaged with the app and do not require generation credits at runtime.

## Production assets

The 12 transparent WebP images total approximately 1.8 MB. Base images are 1024 px wide; individual botanical decorations are 512 px wide. WebP conversion preserves transparency and reduces mobile transfer size. Original subjects were not altered during format optimization.

| Path under `public/assets/realistic/` | Subject |
| --- | --- |
| `base-banana.webp` | Three-tier folded banana leaves, jasmine buds, marigold rim |
| `base-lotus.webp` | Pink lotus petals and jasmine on a banana-leaf base |
| `base-marigold.webp` | Dense yellow and orange marigolds with folded green leaves |
| `base-orchid.webp` | Violet orchids and white jasmine |
| `base-coconut.webp` | Natural coconut-shell base, pandan and jasmine |
| `base-swan.webp` | Sculptural folded-leaf swan with fresh flower details |
| `decor-lotus.webp` | Pink lotus flower head with a yellow center |
| `decor-rose.webp` | Coral-pink rose flower head |
| `decor-marigold.webp` | Orange marigold flower head |
| `decor-orchid.webp` | Purple, white and yellow orchid flower |
| `decor-jasmine.webp` | Cluster of three ivory jasmine flowers and buds |
| `decor-leaf.webp` | Three tightly folded banana-leaf spears |

## Generation briefs

Base brief: isolated highly photorealistic handmade Thai krathong, fixed low three-quarter front view around 20 degrees above the rim, entire base visible, warm soft studio lighting from upper left, realistic leaf veins, petal texture and material depth. A transparent background, no floor, water, lettering, borders, candles, incense, flames or people. Leave the center open for the separately rendered candle. Each asset uses the subject in the table above.

Decoration brief: photorealistic macro botanical cutout, a single compact subject, centered in a square frame with clear margins, soft neutral light from upper left. True transparent background with no halo, backdrop, floor, water, text or cast shadow. Each flower/leaf uses the subject in the table above.

These are generation brief summaries. The application composes the static artwork with editable vector wax candles, pearl gradients, crystal facets, incense, gold leaf, bead garlands, drawing strokes, surface masks, color filters, water reflections and CSS motion.

## Export

The souvenir embeds every used WebP image in its cloned SVG before drawing to canvas. Repeated assets are fetched once per export. Only the packaged allowlisted assets can be embedded. No user-supplied image URL, HTML or SVG is accepted.
