// An input field on the page (docs/spec/ui.md 界面-31): a real text box over the field's text, in the text's face, size,
// colour and alignment, its placeholder the field's placeholder; a tap on the field focuses it. The field's own text
// and placeholder are not drawn while the box is there.
import { refNode } from './node.js';
import { faceOf } from './text.js';
import { rgba } from './paint.js';

/** @typedef {import('./node.js').UiNode} UiNode */
/**
 * What the page gives an input field: its value, a placeholder (else the field's), a length limit (else the field's;
 * 0 none), what to do on each change and on Enter.
 * @typedef {{ value: string, placeholder?: string, maxLength?: number, onChange: (value: string) => void, onEnter?: (value: string) => void }} InputOptions
 */

/**
 * A text box's style from the field's text: face, size, colour, alignment, caret colour; nothing of its own drawn.
 * @param {UiNode} s @param {Record<string, any>} tc the text @param {number[] | undefined} caret @param {string} sample
 */
function boxStyle(s, tc, caret, sample) {
  const [family, weight, caps] = faceOf(s.scr.ctx.fonts, tc.font, sample, tc.style ?? 0);
  return { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', margin: '0', padding: '0', border: '0',
    outline: 'none', background: 'transparent', pointerEvents: 'auto', boxSizing: 'border-box', fontFamily: family, fontWeight: String(weight),
    textTransform: caps ? 'uppercase' : 'none',
    fontSize: `${tc.size ?? 20}px`, color: rgba(tc.color ?? [0, 0, 0, 1]), textAlign: ['left', 'center', 'right'][(tc.align ?? 0) % 3],
    caretColor: rgba(caret ?? [0, 0, 0, 1]) };
}

/** A placeholder node's text, or none. @param {UiNode | null} ph */
const placeholderOf = (ph) => ph?.n.comps.text?.text ?? '';

/**
 * A text box with a value, a placeholder and a length limit (0 none).
 * @param {Document} doc @param {string} value @param {string} placeholder @param {number} limit
 */
function newBox(doc, value, placeholder, limit) {
  const box = /** @type {HTMLInputElement} */ (doc.createElement('input'));
  box.type = 'text';
  box.value = value;
  box.placeholder = placeholder;
  if (limit > 0) box.maxLength = limit;
  return box;
}

/**
 * Puts a text box over a node with an input field.
 * @param {UiNode} s the field's node @param {InputOptions} o @returns {{ set: (value: string) => void, focus: () => void, el: HTMLInputElement } | null}
 */
export function attachInput(s, o) {
  const f = s.n.comps.input, text = f ? refNode(s, f.text) : null;
  if (!f || !text) return null;
  const ph = f.placeholder ? refNode(s, f.placeholder) : null, tc = text.n.comps.text ?? {};
  const box = newBox(s.scr.ctx.doc, o.value, o.placeholder ?? placeholderOf(ph), o.maxLength ?? f.limit ?? 0);
  Object.assign(box.style, boxStyle(s, tc, f.caret, box.value || box.placeholder));
  for (const n of [text, ph]) if (n?.t) n.t.style.visibility = 'hidden';
  text.el.appendChild(box);
  box.addEventListener('input', () => o.onChange(box.value));
  box.addEventListener('keydown', (e) => { if (/** @type {KeyboardEvent} */ (e).key === 'Enter') o.onEnter?.(box.value); });
  s.el.addEventListener('click', () => box.focus());
  return { el: box, set: (value) => { box.value = value; }, focus: () => box.focus() };
}
