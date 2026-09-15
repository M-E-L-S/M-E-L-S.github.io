# Canvas UI Flame Wrap

Source: https://github.com/DavidHDev/canvas-ui/blob/8aec65707b298a227472c117b892b5695955216c/src/lib/FlameWrap/FlameWrapVanilla.ts

Documentation: https://canvasui.dev/docs/components/flame-wrap

The upstream TypeScript source is vendored in `FlameWrapVanilla.ts` with local
compatibility fixes: only capture actual canvas descendants and report
capture/upload success or failure.
`flame-wrap.js` is the same WebGL engine with TypeScript annotations stripped
using Node's `stripTypeScriptTypes`, exports removed, and a classic-script wrapper
exposing `window.CanvasUIFlameWrap`. Shaders and effect defaults are unchanged.
No build step or third-party network request is needed when opening this website.

See `CanvasUI-LICENSE.md` for the upstream license. Site-specific layout,
settings, feature detection and lifecycle are in `../src/scripts/appearance.js`.
The adapter adds the `drawable` attribute required by newer HTML-in-Canvas
implementations and measures layout height independently of snapshot geometry.

## Canvas UI Particle Object

Source: https://github.com/DavidHDev/canvas-ui/blob/8aec65707b298a227472c117b892b5695955216c/src/lib/ParticleObject/ParticleObjectVanilla.ts

Documentation: https://canvasui.dev/docs/components/particle-object

`particle-object.js` and `rect-cache.js` are the official TypeScript sources
with type annotations stripped for direct browser use. The particle renderer has
a site-specific text-readability adjustment: a higher rasterization resolution,
a per-fragment glyph mask that preserves counters and clips resting points to the
actual silhouette, stratified sampling, and planar image homes. Displaced points
escape the mask during interaction; idle drift and random sizes remain enabled.
Small text uses regular strokes without outline expansion. Three.js and its addons
are resolved through the pinned import map in `../src/site.html`. The homepage adapter
in `../src/scripts/particle-title.js` supplies an SVG text asset and owns preference,
fallback, theme, visibility, and lifecycle handling.

## Feature activation is per origin

Canvas UI's site layout injects an Origin Trial token from
`NEXT_PUBLIC_HTML_IN_CANVAS_OT_TOKEN`; copying its component does not copy that
activation. A browser that displays the source site's full demo may still hide
`drawElementImage` / `requestPaint` on this site's origin.

For Edge, register the actual deployed origin in Microsoft's `html-in-canvas`
Origin Trial, then place its `<meta http-equiv="origin-trial" content="...">`
in `../src/site.html`'s head before application scripts. GitHub Pages supports this
meta-based activation. A token issued for canvasui.dev or another origin cannot
be reused. The Edge trial currently expires on October 20, 2026.

References:
- https://github.com/DavidHDev/canvas-ui/blob/main/src/app/layout.tsx
- https://developer.chrome.com/blog/html-in-canvas-origin-trial
- https://learn.microsoft.com/en-us/microsoft-edge/origin-trials/
