import { button, el, icon } from './elements.js';

export class ModalManager {
  constructor({ onChange, onClose } = {}) {
    this.dialog = document.getElementById('game-modal');
    this.onChange = onChange;
    this.onClose = onClose;
    this.kind = null;
    this.revision = 0;
    this.handleCancel = (event) => { event.preventDefault(); this.close(); };
    this.handleBackdrop = (event) => {
      if (event.target !== this.dialog) return;
      const rect = this.dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
    };
    this.dialog.addEventListener('cancel', this.handleCancel);
    this.dialog.addEventListener('click', this.handleBackdrop);
  }

  open({ kind, title, subtitle, content, footer, dismissible = true, symbol = 'crown' }) {
    clearTimeout(this.closeTimer);
    const revision = ++this.revision;
    if (!this.dialog.open) this.returnFocus = document.activeElement;
    this.kind = kind;
    this.dismissible = dismissible;
    this.dialog.dataset.kind = kind;
    this.dialog.classList.remove('is-closing', 'is-open');
    this.dialog.replaceChildren();
    const header = el('header', 'modal-header');
    const copy = el('div', 'modal-heading');
    const heading = el('h1', '', title);
    heading.id = 'modal-title';
    copy.append(heading);
    if (subtitle) {
      const description = el('p', '', subtitle);
      description.id = 'modal-description';
      copy.append(description);
      this.dialog.setAttribute('aria-describedby', description.id);
    } else this.dialog.removeAttribute('aria-describedby');
    const emblem = el('span', `modal-emblem modal-emblem--${symbol}`);
    emblem.append(icon(symbol));
    header.append(emblem, copy);
    if (dismissible) {
      const close = button('', 'modal-close', () => this.close(), 'close');
      close.setAttribute('aria-label', 'بستن پنجره');
      header.append(close);
    }
    content.classList.add('modal-body');
    this.dialog.append(header, content);
    if (footer) { footer.classList.add('modal-footer'); this.dialog.append(footer); }
    this.onChange?.(true, kind);
    if (!this.dialog.open) this.dialog.showModal();
    requestAnimationFrame(() => {
      if (revision !== this.revision) return;
      this.dialog.classList.add('is-open');
      const target = content.querySelector('[autofocus]') ?? this.dialog.querySelector('button, input');
      target?.focus({ preventScroll: true });
    });
  }

  close(force = false) {
    if (!this.kind || (!force && !this.dismissible) || this.dialog.classList.contains('is-closing')) return false;
    const kind = this.kind;
    const revision = ++this.revision;
    this.dialog.classList.add('is-closing');
    this.dialog.classList.remove('is-open');
    this.closeTimer = setTimeout(() => {
      if (revision !== this.revision) return;
      this.dialog.close();
      this.kind = null;
      this.dialog.removeAttribute('data-kind');
      this.onChange?.(false, kind);
      if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
      this.onClose?.(kind);
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
    return true;
  }

  dispose() {
    clearTimeout(this.closeTimer);
    this.revision++;
    this.dialog.removeEventListener('cancel', this.handleCancel);
    this.dialog.removeEventListener('click', this.handleBackdrop);
    if (this.dialog.open) this.dialog.close();
  }
}
