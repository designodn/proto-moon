# screenshot-testing memory — proto-moon

## Setup
- Serve from REPO ROOT: `python3 -m http.server 8080 --bind 127.0.0.1` (new-vision pages pull `../index.css`, `../assets/`).
- new-vision/lenta.html = vision feed. Congrats cards are the first 4 articles after the stories row.
- Viewport 390x844, isMobile, deviceScaleFactor 2.

## Scroll container
- On new-vision/lenta.html the SCROLLABLE element is `.phone-frame` (height 100dvh), NOT `.phone-frame__feed` (which is sized to full content height = not scrollable). Set `document.querySelector('.phone-frame').scrollTop = y` to scroll. `document.scrollingElement` is fixed at viewport height.

## Icons (.icon.__src / __slot-*)
- The glyph paints via `::before` pseudo-element (mask-image = var(--icon-src), background-color = currentColor). Computed style ON the element shows mask:none/bg:none — that's a false negative. Always check `getComputedStyle(el, '::before')`. White-on-gradient gift icon confirmed via ::before maskImage + bg rgb(255,255,255).

## Avatars
- `.avatar img { width:100%; height:100% }` and `.avatar` is box-sizing:border-box. If any parent rule injects padding onto the avatar, the content box shrinks and the img shrinks with it.
- Selector `.feed-congrats.__birthday .avatar img` matches MULTIPLE imgs (big 72px + stacked __size-36 friend avatars). Use `:scope > .avatar.__size-72 img` to target the hero avatar.

## Findings logged (2026-06-16, congrats cards)
- BUG: rule `.feed-congrats > :not(.media) { padding: 0 16px }` (nv-feed-congrats.css:20) also hits the direct-child `.avatar.__size-72` → 16px L/R padding on a border-box 72px avatar = 40px content box → hero photo clamped to 40px wide and offset. Removing padding restores 72x72.
- BUG: `assets/new-vision/birthday-nikolay.png` is a 2180-byte, fully-transparent placeholder (center + quadrants alpha=0). Renders as empty grey circle even at correct size. The other 3 illustrations (gift-jam 1.4MB, gift-bonsai 855KB, postcard-dog 472KB) are real and paint fine.
- Pravatar/picsum (`i.pravatar.cc`, `picsum.photos`) external avatars/photos fail in sandbox with ERR_CERT_AUTHORITY_INVALID — small friend-avatar circles show broken-image glyph. This is sandbox-network, not a code bug. Ignore for layout verdicts.
- Gradient buttons OK: `.nv-gift-btn` = linear-gradient(175deg,#8d41ff→#f987a2→#f79369), white text; `.__create` = orange linear-gradient(95deg,#ff9a3d→...). 358x44.
- Title font confirmed OK Sans: `"OK Sans Text","OK Sans Display",Onest,system-ui...` at 24px. Not serif.
- Inner gift card: border 2px solid rgba(131,102,86,.08), radius 20px. Media full-bleed via width calc(100% + 32px) + negative margin → media slightly WIDER than card (e.g. 386 vs 390 minus the 16px island gutter; renders edge-to-edge inside card, looks correct). mediaFullWidth check returns false because media extends past card content box by design (negative margin) — not a bug.

## nv-breadcrumbs (tag line) — 2026-06-16, reordered 23-feed lenta
- Component CSS: `new-vision/components/nv-breadcrumbs.css` (imported in new-vision.css). `.nv-breadcrumbs__label` = font-weight 700, 15px/20px, OK Sans. Confirmed 700 on all 14 instances.
- ARROW `›` is a `::after` pseudo on `.nv-breadcrumbs__tag:not(:last-child)` (content "›", fw700, 17px, secondary color rgba(46,47,51,.88)). Do NOT probe `::before` of the 2nd tag — that's empty (false negative). Verified arrow paints on every multi-tag crumb.
- No horizontal padding in the component itself (by design — container puts it). Container `.feed-* > *` adds 16px left → leftInset measured 16px (single, NOT double 32px). Good. Some crumbs report paddingLeft:0 + leftInset 16 (padding from parent island), others paddingLeft:16 — both land at 16px effective. No double-gutter found.
- Dzen crumb: optional `.nv-breadcrumbs__badge` img (16x16, ../assets/new-vision/dzen-badge.png, 200) before "Дзен". Renders.

## New feeds verified (all PASS, layout-wise)
- Dzen post: dzen-heart.png loads (natural 360x270 = 4:3), renders 390x293 in `.media.__aspect-4-3`. Real anatomical-heart art, not placeholder.
- Advice (`.feed-advice`): 3 `.nv-advice-card` beige cards, inner scroller overflowX:auto, scrollWidth 599 > clientW 390, scrollLeft 0→200 moves => horizontally scrollable confirmed. cardH 186.
- Moment (2nd `.feed-stories`): title + 5 `.avatar.__size-56 __ring-active/__ring-viewed __has-caption` story circles in `.feed-stories__list`. Rings + captions render; photos pravatar (cert-broken).
- Gift-create congrats: gift-jam.png loads 386x386 (`.media.__aspect-1-1`), orange gradient `.nv-gift-btn.__create` (linear-gradient 95deg #ff9a3d→). Received-gift: gift-bonsai.png loads 386x386, purple gradient nv-gift-btn (linear-gradient 175deg #8d41ff→).
- Birthday avatar 72px BUG IS FIXED (commit 72d17f2): hero `.feed-congrats.__birthday > .avatar.__size-72` measures 72x72 now, and source switched from the empty birthday-nikolay.png placeholder to pravatar img=68. No more clamped 40px circle.
- Group feed (`.feed-group`): community header + "X друзей подписаны" + Подписаться. Layout intact; cover & friend avatars pravatar/cert-broken.
- 3 nv-gift-btn all 358x44, white text, correct gradients.

## Gotchas
- PNG-asset emptiness is invisible to `img.complete/naturalWidth` (returns loaded:true for transparent PNG). Decode IDAT alpha to catch placeholder/empty assets.
- `.feed-advice` inner scroller = `.nv-advice-card`'s direct parent. To test h-scroll set that parent's scrollLeft, not the article's.
- Full lenta scrollHeight ~10907px at 390w. Scroll via `.phone-frame.scrollTop` still holds for this reordered version.
