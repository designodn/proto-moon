/**
 * OK Design System — IconGlyph (Web Component)
 *
 * Auto-selects the right SVG source file based on the requested size:
 *   - size 12      → assets/icons/{name}_12.svg
 *   - size 16 / 20 → assets/icons/{name}_16_20.svg
 *   - size 24 / 32 / 48 → assets/icons/{name}_24.svg   (24 stretched up)
 *
 * The SVG is applied as a CSS mask and recolored with currentColor,
 * stretched to 100% / 100% so it always fills the container.
 *
 * USAGE:
 *   <icon-glyph name="heart" size="16"></icon-glyph>
 *   <icon-glyph name="heart" class="__size-24"></icon-glyph>
 *   <icon-glyph name="heart"></icon-glyph>   // defaults to 24
 *
 * SIZE source priority (first match wins):
 *   1. `size` attribute (number)
 *   2. `.__size-N` class
 *   3. Default: 24
 *
 * The component sets explicit width/height inline ONLY when `size` is
 * given via attribute. Use `.__size-N` (or your own CSS) when you want
 * the container to drive the box, e.g. inside another component.
 *
 * Path override: set `--icon-glyph-base-path` on the host to point to a
 * different asset folder (default: `assets/icons/`).
 */
class IconGlyph extends HTMLElement {
  static get observedAttributes() { return ['name', 'size']; }

  connectedCallback() { this._update(); }
  attributeChangedCallback() { this._update(); }

  _resolveSize() {
    const sizeAttr = parseInt(this.getAttribute('size'), 10);
    if (sizeAttr && !isNaN(sizeAttr)) return { size: sizeAttr, fromAttr: true };
    for (const c of this.classList) {
      const m = /^__size-(\d+)$/.exec(c);
      if (m) return { size: parseInt(m[1], 10), fromAttr: false };
    }
    return { size: 24, fromAttr: false };
  }

  _variantFor(size) {
    if (size === 12) return '12';
    if (size === 16 || size === 20) return '16_20';
    return '24';
  }

  _update() {
    const name = this.getAttribute('name');
    if (!name) return;
    const { size, fromAttr } = this._resolveSize();
    const variant = this._variantFor(size);
    const base = getComputedStyle(this).getPropertyValue('--icon-glyph-base-path').trim() || 'assets/icons/';
    const url = `${base}${name}_${variant}.svg`;
    this.style.setProperty('--icon-glyph-src', `url('${url}')`);
    if (fromAttr) {
      this.style.width = size + 'px';
      this.style.height = size + 'px';
    }
  }
}

if (!customElements.get('icon-glyph')) {
  customElements.define('icon-glyph', IconGlyph);
}
