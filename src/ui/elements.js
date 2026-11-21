export function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

export function button(text, className = 'primary-button', action, symbol) {
  const node = el('button', className);
  node.type = 'button';
  if (symbol) node.append(icon(symbol));
  node.append(document.createTextNode(text));
  if (action) node.addEventListener('click', action);
  return node;
}
