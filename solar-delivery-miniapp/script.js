/* ===== TELEGRAM WEB APP INIT ===== */
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.enableClosingConfirmation();
}

/* ===== DYNAMIC MENU (API → fallback data.js) ===== */
let dynamicMenu = null;

function getCategories() {
  if (dynamicMenu) return dynamicMenu.categories.filter(c => c.active !== false);
  return CATEGORIES;
}

function getItems(catId) {
  if (dynamicMenu) return dynamicMenu.items.filter(i => i.categoryId === catId && i.active !== false);
  return MENU[catId] || [];
}

function findItemAny(id) {
  if (dynamicMenu) return dynamicMenu.items.find(i => i.id === id) || null;
  return findItem(id);
}

function getAllItems() {
  if (dynamicMenu) return dynamicMenu.items.filter(i => i.active !== false);
  return Object.values(MENU).flat();
}

async function loadMenuFromAPI() {
  try {
    const res = await fetch('/api/menu');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    dynamicMenu = await res.json();
  } catch {
    dynamicMenu = null;
  }
}

/* ===== STATE ===== */
const state = {
  city:           localStorage.getItem('selectedCity') || null,
  cart:           JSON.parse(localStorage.getItem('cart') || '{}'),
  promo:          null,
  promoDiscount:  0,
  deliveryMode:   'delivery',
  activeCategory: null,
  itemModal:      { item: null, qty: 1 },
};

/* ===== HELPERS ===== */
function fmt(n) { return n.toLocaleString('ru-RU') + ' ₽'; }

function saveCart() {
  localStorage.setItem('cart', JSON.stringify(state.cart));
}

function getCartCount() {
  return Object.values(state.cart).reduce((s, v) => s + v, 0);
}

function getSubtotal() {
  let total = 0;
  for (const [id, qty] of Object.entries(state.cart)) {
    const item = findItemAny(id);
    if (item) total += item.price * qty;
  }
  return total;
}

function getDeliveryPrice(subtotal) {
  if (state.deliveryMode === 'pickup') return 0;
  return subtotal >= DELIVERY_INFO.freeDeliveryFrom ? 0 : DELIVERY_INFO.deliveryCost;
}

function getTotal() {
  const sub      = getSubtotal();
  const delivery = getDeliveryPrice(sub);
  const discount = Math.min(state.promoDiscount, sub + delivery);
  return Math.max(0, sub + delivery - discount);
}

function findItem(id) {
  for (const items of Object.values(MENU)) {
    const found = items.find(i => i.id === id);
    if (found) return found;
  }
  return null;
}

/* ===== RENDER CITY LIST ===== */
function renderCityList() {
  const list = document.getElementById('cityList');
  list.innerHTML = '';
  CITIES.forEach(city => {
    const li = document.createElement('li');
    li.className = 'city-item' + (state.city === city.id ? ' selected' : '');
    li.innerHTML = `<span class="city-item-icon">📍</span><span>${city.name}</span>`;
    li.addEventListener('click', () => selectCity(city.id, city.name));
    list.appendChild(li);
  });
}

/* ===== SELECT CITY ===== */
function selectCity(id, name) {
  state.city = id;
  localStorage.setItem('selectedCity', id);
  document.getElementById('headerCityName').textContent = name;
  closeModal('cityModal');
  showMenu();
  renderAddressesList();
  tg?.HapticFeedback?.impactOccurred('light');
}

/* ===== SHOW MENU ===== */
function showMenu() {
  document.getElementById('cityPrompt').style.display = 'none';
  document.getElementById('menuWrapper').style.display = 'block';
  renderCategories();
  renderMenuContent();
}

/* ===== RENDER CATEGORIES ===== */
function renderCategories() {
  const cats   = getCategories();
  const scroll = document.getElementById('categoriesScroll');
  scroll.innerHTML = '';
  if (!state.activeCategory && cats.length) state.activeCategory = cats[0].id;
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className    = 'cat-tab' + (state.activeCategory === cat.id ? ' active' : '');
    btn.textContent  = cat.name;
    btn.dataset.catId = cat.id;
    btn.addEventListener('click', () => {
      state.activeCategory = cat.id;
      setActiveCatTab(cat.id);
      scrollToSection(cat.id);
    });
    scroll.appendChild(btn);
  });
}

function setActiveCatTab(catId) {
  document.querySelectorAll('.cat-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.catId === catId);
  });
  const active = document.querySelector(`.cat-tab[data-cat-id="${catId}"]`);
  active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function scrollToSection(catId) {
  const section = document.getElementById('section-' + catId);
  if (!section) return;
  const offset = 145;
  const top    = section.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

/* ===== RENDER MENU CONTENT ===== */
function renderMenuContent() {
  const content = document.getElementById('menuContent');
  content.innerHTML = '';
  const cats = getCategories();
  if (!cats.length) return;

  cats.forEach(cat => {
    const items = getItems(cat.id);
    if (!items.length) return;

    const section = document.createElement('section');
    section.className = 'menu-section fade-in';
    section.id        = 'section-' + cat.id;

    const title = document.createElement('div');
    title.className   = 'menu-section-title';
    title.textContent = cat.name;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'menu-items-grid';
    items.forEach(item => grid.appendChild(createMenuCard(item)));
    section.appendChild(grid);
    content.appendChild(section);
  });

  setupScrollSpy();
}

/* ===== CREATE MENU CARD ===== */
function createMenuCard(item) {
  const card    = document.createElement('div');
  card.className = 'menu-card';
  card.id        = 'card-' + item.id;

  const mediaPart = item.image
    ? `<div class="menu-card-media"><img class="menu-card-photo" src="${item.image}" alt="${item.name}" loading="lazy" /></div>`
    : `<div class="menu-card-emoji">${item.emoji}</div>`;

  card.innerHTML = `
    ${mediaPart}
    <div class="menu-card-body">
      <div class="menu-card-name">${item.name}</div>
      ${item.weight ? `<div class="menu-card-weight">${item.weight}</div>` : ''}
      <div class="menu-card-footer">
        <div class="menu-card-price">${fmt(item.price)}</div>
        <div class="card-actions" id="card-actions-${item.id}"></div>
      </div>
    </div>`;

  card.addEventListener('click', e => {
    if (!e.target.closest('.card-actions')) openItemModal(item);
  });
  updateCardActions(item.id);
  return card;
}

function updateCardActions(itemId) {
  const wrap = document.getElementById('card-actions-' + itemId);
  if (!wrap) return;
  const qty  = state.cart[itemId] || 0;
  const card = document.getElementById('card-' + itemId);

  if (qty === 0) {
    card?.classList.remove('in-cart');
    wrap.innerHTML = `<button class="btn-add" data-id="${itemId}" aria-label="Добавить">+</button>`;
    wrap.querySelector('.btn-add').addEventListener('click', e => {
      e.stopPropagation();
      addToCart(itemId);
    });
  } else {
    card?.classList.add('in-cart');
    wrap.innerHTML = `
      <div class="card-qty-controls">
        <button class="card-qty-btn" data-id="${itemId}" data-action="dec" aria-label="Уменьшить">−</button>
        <span class="card-qty-val">${qty}</span>
        <button class="card-qty-btn" data-id="${itemId}" data-action="inc" aria-label="Увеличить">+</button>
      </div>`;
    wrap.querySelector('[data-action="dec"]').addEventListener('click', e => {
      e.stopPropagation(); decFromCart(itemId);
    });
    wrap.querySelector('[data-action="inc"]').addEventListener('click', e => {
      e.stopPropagation(); addToCart(itemId);
    });
  }
}

/* ===== CART LOGIC ===== */
function addToCart(id) {
  state.cart[id] = (state.cart[id] || 0) + 1;
  saveCart();
  updateCardActions(id);
  updateCartFab();
  updateCartSheet();
  tg?.HapticFeedback?.impactOccurred('light');
}

function decFromCart(id) {
  if (!state.cart[id]) return;
  state.cart[id]--;
  if (state.cart[id] === 0) delete state.cart[id];
  saveCart();
  updateCardActions(id);
  updateCartFab();
  updateCartSheet();
  tg?.HapticFeedback?.impactOccurred('light');
}

function setCartQty(id, qty) {
  if (qty <= 0) { delete state.cart[id]; } else { state.cart[id] = qty; }
  saveCart();
  updateCardActions(id);
  updateCartFab();
  updateCartSheet();
}

/* ===== CART FAB ===== */
function updateCartFab() {
  const fab   = document.getElementById('cartFab');
  const count = getCartCount();
  if (count === 0) { fab.style.display = 'none'; return; }
  fab.style.display = 'flex';
  document.getElementById('cartFabCount').textContent = count;
  document.getElementById('cartFabTotal').textContent = fmt(getSubtotal());
}

/* ===== CART SHEET ===== */
function updateCartSheet() {
  const list      = document.getElementById('cartItemsList');
  const emptyEl   = document.getElementById('cartEmpty');
  const summaryEl = document.getElementById('cartSummary');
  const count     = getCartCount();

  if (count === 0) {
    list.innerHTML = '';
    list.style.display  = 'none';
    emptyEl.style.display   = 'flex';
    summaryEl.style.display = 'none';
    return;
  }

  emptyEl.style.display   = 'none';
  list.style.display      = 'block';
  summaryEl.style.display = 'block';
  list.innerHTML = '';

  for (const [id, qty] of Object.entries(state.cart)) {
    const item = findItemAny(id);
    if (!item) continue;
    const row = document.createElement('div');
    row.className = 'cart-item';

    const thumbPart = item.image
      ? `<img class="cart-item-thumb" src="${item.image}" alt="${item.name}" />`
      : `<div class="cart-item-emoji">${item.emoji}</div>`;

    row.innerHTML = `
      ${thumbPart}
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${fmt(item.price * qty)}</div>
      </div>
      <div class="cart-item-controls">
        <button class="cart-qty-btn ${qty === 1 ? 'remove' : ''}" data-id="${id}" data-action="dec">${qty === 1 ? '🗑' : '−'}</button>
        <span class="cart-qty-val">${qty}</span>
        <button class="cart-qty-btn" data-id="${id}" data-action="inc">+</button>
      </div>`;
    row.querySelector('[data-action="dec"]').addEventListener('click', () => decFromCart(id));
    row.querySelector('[data-action="inc"]').addEventListener('click', () => addToCart(id));
    list.appendChild(row);
  }

  updateCartSummary();
}

function updateCartSummary() {
  const sub      = getSubtotal();
  const delivery = getDeliveryPrice(sub);
  const total    = getTotal();

  document.getElementById('subtotalVal').textContent = fmt(sub);

  const deliveryRow = document.getElementById('deliveryRow');
  if (state.deliveryMode === 'pickup') {
    deliveryRow.style.display = 'none';
  } else {
    deliveryRow.style.display = 'flex';
    document.getElementById('deliveryVal').textContent = delivery === 0 ? 'Бесплатно' : fmt(delivery);
  }

  const promoRow = document.getElementById('promoRow');
  if (state.promoDiscount > 0) {
    promoRow.style.display = 'flex';
    document.getElementById('promoDiscount').textContent = '−' + fmt(state.promoDiscount);
  } else {
    promoRow.style.display = 'none';
  }

  document.getElementById('totalVal').textContent = fmt(total);

  const hint = document.getElementById('freeDeliveryHint');
  if (state.deliveryMode === 'delivery' && sub < DELIVERY_INFO.freeDeliveryFrom && sub > 0) {
    const diff = DELIVERY_INFO.freeDeliveryFrom - sub;
    hint.textContent = `Добавьте ещё ${fmt(diff)} и доставка будет бесплатной! 🎉`;
  } else {
    hint.textContent = '';
  }
}

function updateCheckoutSummary() {
  const sub      = getSubtotal();
  const delivery = getDeliveryPrice(sub);
  const total    = getTotal();

  document.getElementById('checkoutSubtotal').textContent = fmt(sub);

  const checkDelivRow = document.getElementById('checkoutDeliveryRow');
  if (state.deliveryMode === 'pickup') {
    checkDelivRow.style.display = 'none';
  } else {
    checkDelivRow.style.display = 'flex';
    document.getElementById('checkoutDelivery').textContent = delivery === 0 ? 'Бесплатно' : fmt(delivery);
  }

  const checkPromoRow = document.getElementById('checkoutPromoRow');
  if (state.promoDiscount > 0) {
    checkPromoRow.style.display = 'flex';
    document.getElementById('checkoutPromoDiscount').textContent = '−' + fmt(state.promoDiscount);
  } else {
    checkPromoRow.style.display = 'none';
  }

  document.getElementById('checkoutTotal').textContent       = fmt(total);
  document.getElementById('submitOrderTotal').textContent    = fmt(total);
}

/* ===== ITEM MODAL (user view) ===== */
function openItemModal(item) {
  state.itemModal = { item, qty: state.cart[item.id] || 1 };

  const emojiEl = document.getElementById('itemModalEmoji');
  if (item.image) {
    emojiEl.innerHTML = `<img src="${item.image}" class="item-modal-photo" alt="${item.name}" />`;
  } else {
    emojiEl.textContent = item.emoji;
  }

  document.getElementById('itemModalTitle').textContent  = item.name;
  document.getElementById('itemModalName').textContent   = item.name;
  document.getElementById('itemModalWeight').textContent = item.weight || '';
  document.getElementById('itemModalPrice').textContent  = fmt(item.price);
  document.getElementById('itemModalQty').textContent    = state.itemModal.qty;
  openModal('itemModal');
  tg?.HapticFeedback?.impactOccurred('light');
}

document.getElementById('itemModalMinus').addEventListener('click', () => {
  if (state.itemModal.qty > 1) {
    state.itemModal.qty--;
    document.getElementById('itemModalQty').textContent   = state.itemModal.qty;
    document.getElementById('itemModalPrice').textContent = fmt(state.itemModal.item.price * state.itemModal.qty);
  }
});

document.getElementById('itemModalPlus').addEventListener('click', () => {
  state.itemModal.qty++;
  document.getElementById('itemModalQty').textContent   = state.itemModal.qty;
  document.getElementById('itemModalPrice').textContent = fmt(state.itemModal.item.price * state.itemModal.qty);
});

document.getElementById('itemModalAdd').addEventListener('click', () => {
  setCartQty(state.itemModal.item.id, state.itemModal.qty);
  closeModal('itemModal');
  tg?.HapticFeedback?.notificationOccurred('success');
});

/* ===== MODAL OPEN / CLOSE ===== */
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
  document.body.style.overflow = '';
}

/* ===== CITY MODAL ===== */
document.getElementById('cityBtn').addEventListener('click', () => { renderCityList(); openModal('cityModal'); });
document.getElementById('selectCityPromptBtn').addEventListener('click', () => { renderCityList(); openModal('cityModal'); });
document.getElementById('cityModalClose').addEventListener('click', () => closeModal('cityModal'));

/* ===== ADDRESSES MODAL ===== */
function renderAddressesList() {
  const list  = document.getElementById('addressesList');
  list.innerHTML = '';
  const addrs = (state.city && ADDRESSES[state.city]) || [];
  if (addrs.length === 0) {
    const li = document.createElement('li');
    li.className = 'address-item';
    li.innerHTML = '<span>Нет пунктов самовывоза в вашем городе</span>';
    list.appendChild(li);
    return;
  }
  addrs.forEach(addr => {
    const li = document.createElement('li');
    li.className = 'address-item';
    li.innerHTML = `<span class="address-item-icon">📍</span><span>${addr}</span>`;
    list.appendChild(li);
  });
}

document.getElementById('showAddressesBtn').addEventListener('click', () => { renderAddressesList(); openModal('addressesModal'); });
document.getElementById('addressesModalClose').addEventListener('click', () => closeModal('addressesModal'));

/* ===== BONUS MODAL ===== */
function renderBonusLevels() {
  const wrap = document.getElementById('bonusLevels');
  wrap.innerHTML = '';
  BONUS_PROGRAM.forEach(lvl => {
    const card = document.createElement('div');
    card.className      = 'bonus-level-card';
    card.style.background = lvl.color;
    card.innerHTML = `
      <div class="bonus-level-name">${lvl.level}</div>
      <div class="bonus-level-percent">${lvl.percent}%</div>
      <div class="bonus-level-min">${lvl.minAmount === 0 ? 'Базовый' : 'от ' + lvl.minAmount.toLocaleString('ru-RU') + ' ₽'}</div>`;
    wrap.appendChild(card);
  });
}

document.getElementById('showBonusBtn').addEventListener('click', () => { renderBonusLevels(); openModal('bonusModal'); });
document.getElementById('bonusModalClose').addEventListener('click', () => closeModal('bonusModal'));
document.getElementById('itemModalClose').addEventListener('click', () => closeModal('itemModal'));

/* ===== CART FAB CLICK ===== */
document.getElementById('cartFab').addEventListener('click', () => {
  updateCartSheet();
  openModal('cartOverlay');
  tg?.HapticFeedback?.impactOccurred('medium');
});

/* ===== CLEAR CART ===== */
document.getElementById('clearCartBtn').addEventListener('click', () => {
  if (getCartCount() === 0) return;
  state.cart = {};
  saveCart();
  getAllItems().forEach(item => updateCardActions(item.id));
  updateCartFab();
  updateCartSheet();
  tg?.HapticFeedback?.notificationOccurred('warning');
});

/* ===== GO TO CHECKOUT ===== */
document.getElementById('goToCheckoutBtn').addEventListener('click', () => {
  if (getCartCount() === 0) return;
  closeModal('cartOverlay');
  renderPickupSelect();
  updateCheckoutSummary();
  openModal('checkoutOverlay');
  tg?.HapticFeedback?.impactOccurred('medium');
});

/* ===== BACK TO CART ===== */
document.getElementById('backToCartBtn').addEventListener('click', () => {
  closeModal('checkoutOverlay');
  updateCartSheet();
  openModal('cartOverlay');
});

/* ===== DELIVERY / PICKUP TABS ===== */
document.getElementById('tabDelivery').addEventListener('click', () => {
  state.deliveryMode = 'delivery';
  document.getElementById('tabDelivery').classList.add('active');
  document.getElementById('tabPickup').classList.remove('active');
  document.getElementById('deliverySection').style.display = 'block';
  document.getElementById('pickupSection').style.display   = 'none';
  document.getElementById('checkoutDeliveryRow').style.display = 'flex';
  updateCheckoutSummary();
  updateCartSummary();
});

document.getElementById('tabPickup').addEventListener('click', () => {
  state.deliveryMode = 'pickup';
  document.getElementById('tabPickup').classList.add('active');
  document.getElementById('tabDelivery').classList.remove('active');
  document.getElementById('deliverySection').style.display = 'none';
  document.getElementById('pickupSection').style.display   = 'block';
  updateCheckoutSummary();
  updateCartSummary();
});

/* ===== PICKUP ADDRESS SELECT ===== */
function renderPickupSelect() {
  const sel   = document.getElementById('pickupAddress');
  sel.innerHTML = '<option value="">— Выберите адрес —</option>';
  const addrs = (state.city && ADDRESSES[state.city]) || [];
  addrs.forEach(addr => {
    const opt      = document.createElement('option');
    opt.value      = addr;
    opt.textContent = addr;
    sel.appendChild(opt);
  });
}

/* ===== PROMO CODE ===== */
document.getElementById('applyPromoBtn').addEventListener('click', applyPromo);
document.getElementById('promoInput').addEventListener('keydown', e => { if (e.key === 'Enter') applyPromo(); });

function applyPromo() {
  const code     = document.getElementById('promoInput').value.trim().toUpperCase();
  const statusEl = document.getElementById('promoStatus');

  if (!code) {
    statusEl.className   = 'promo-status error';
    statusEl.textContent = 'Введите промокод';
    return;
  }

  const promo = PROMO_CODES[code];
  if (!promo) {
    state.promo = null;
    state.promoDiscount  = 0;
    statusEl.className   = 'promo-status error';
    statusEl.textContent = '❌ Неверный промокод';
    updateCheckoutSummary();
    return;
  }

  state.promo = code;
  const sub   = getSubtotal();
  state.promoDiscount = promo.type === 'percent'
    ? Math.round(sub * promo.discount / 100)
    : promo.discount;

  statusEl.className   = 'promo-status success';
  statusEl.textContent = '✅ ' + promo.label;
  updateCheckoutSummary();
  tg?.HapticFeedback?.notificationOccurred('success');
}

/* ===== FORM VALIDATION ===== */
function validateCheckoutForm() {
  let valid  = true;
  const name   = document.getElementById('nameInput');
  const phone  = document.getElementById('phoneInput');
  const street = document.getElementById('streetInput');
  [name, phone, street].forEach(el => el.classList.remove('error'));
  if (!name.value.trim())                                              { name.classList.add('error');   valid = false; }
  if (!phone.value.trim() || phone.value.trim().length < 6)           { phone.classList.add('error');  valid = false; }
  if (state.deliveryMode === 'delivery' && !street.value.trim())      { street.classList.add('error'); valid = false; }
  return valid;
}

/* ===== SUBMIT ORDER ===== */
document.getElementById('checkoutForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!validateCheckoutForm()) { tg?.HapticFeedback?.notificationOccurred('error'); return; }

  const payment   = document.querySelector('input[name="payment"]:checked')?.value || 'online';
  const orderData = {
    city:     state.city,
    cityName: CITIES.find(c => c.id === state.city)?.name || '',
    mode:     state.deliveryMode,
    address:  state.deliveryMode === 'delivery'
      ? [
          document.getElementById('streetInput').value,
          document.getElementById('entranceInput').value,
          document.getElementById('floorInput').value,
          document.getElementById('apartmentInput').value,
        ].filter(Boolean).join(', ')
      : document.getElementById('pickupAddress').value,
    name:    document.getElementById('nameInput').value.trim(),
    phone:   document.getElementById('phoneInput').value.trim(),
    comment: document.getElementById('commentInput').value.trim(),
    payment,
    promo:    state.promo,
    subtotal: getSubtotal(),
    delivery: getDeliveryPrice(getSubtotal()),
    discount: state.promoDiscount,
    total:    getTotal(),
    items:    Object.entries(state.cart).map(([id, qty]) => {
      const item = findItemAny(id);
      return { id, name: item?.name, price: item?.price, qty };
    }),
  };

  if (tg) tg.sendData(JSON.stringify(orderData));
  closeModal('checkoutOverlay');
  showSuccess();
});

/* ===== SHOW SUCCESS ===== */
function showSuccess() {
  state.cart = {};
  saveCart();
  getAllItems().forEach(item => updateCardActions(item.id));
  updateCartFab();
  document.getElementById('successOverlay').style.display = 'flex';
  tg?.HapticFeedback?.notificationOccurred('success');
}

document.getElementById('successBackBtn').addEventListener('click', () => {
  document.getElementById('successOverlay').style.display = 'none';
  document.getElementById('checkoutForm').reset();
  state.promo         = null;
  state.promoDiscount = 0;
  document.getElementById('promoStatus').textContent = '';
  tg?.HapticFeedback?.impactOccurred('light');
});

/* ===== OVERLAY CLICK TO CLOSE ===== */
['cityModal', 'bonusModal', 'addressesModal', 'itemModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeModal(id);
  });
});
document.getElementById('cartOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('cartOverlay')) closeModal('cartOverlay');
});
document.getElementById('checkoutOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('checkoutOverlay')) closeModal('checkoutOverlay');
});

/* ===== SCROLL SPY ===== */
function setupScrollSpy() {
  const sections = document.querySelectorAll('.menu-section');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const catId = entry.target.id.replace('section-', '');
        if (state.activeCategory !== catId) {
          state.activeCategory = catId;
          setActiveCatTab(catId);
        }
      }
    });
  }, { rootMargin: '-140px 0px -55% 0px', threshold: 0 });
  sections.forEach(sec => observer.observe(sec));
}

/* ===== INIT ===== */
async function init() {
  if (tg?.themeParams) {
    const tp = tg.themeParams;
    if (tp.bg_color)   document.body.style.setProperty('--tg-bg',   tp.bg_color);
    if (tp.text_color) document.body.style.setProperty('--tg-text', tp.text_color);
  }

  await loadMenuFromAPI();

  if (state.city) {
    const cityObj = CITIES.find(c => c.id === state.city);
    if (cityObj) {
      document.getElementById('headerCityName').textContent = cityObj.name;
      showMenu();
      renderAddressesList();
    }
  }
  updateCartFab();
  updateCartSheet();
}

document.addEventListener('DOMContentLoaded', init);
