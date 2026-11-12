/** Accessible, touch-friendly left sidebar. No Live2D dependency. */
export function initPanel({ panel, toggle, body, win = window, doc = document }) {
  const openOnDesktop = win.matchMedia('(min-width: 851px) and (pointer: fine)').matches;

  function setCollapsed(collapsed) {
    panel.classList.toggle('is-collapsed', collapsed);
    body.inert = collapsed; // Remove hidden controls from keyboard focus order.
    body.setAttribute('aria-hidden', String(collapsed));
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const name = collapsed ? '설정 메뉴 열기' : '설정 메뉴 최소화';
    toggle.setAttribute('aria-label', name);
    toggle.title = name;
    const glyph = toggle.querySelector('#panel-toggle-icon');
    if (glyph) glyph.textContent = collapsed ? '☰' : '−';
  }

  setCollapsed(!openOnDesktop); // Keep the model unobstructed on mobile.
  toggle.addEventListener('click', () => setCollapsed(!panel.classList.contains('is-collapsed')));
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.classList.contains('is-collapsed')) {
      setCollapsed(true);
      toggle.focus();
    }
  });
  doc.addEventListener('pointerdown', (event) => {
    if (win.matchMedia('(max-width: 850px)').matches && !panel.contains(event.target)) {
      setCollapsed(true);
    }
  });
  return { setCollapsed };
}
