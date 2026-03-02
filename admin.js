/* ===== STATE ===== */
const S = {
  token:       sessionStorage.getItem('adminToken') || null,
  menu:        { categories: [], items: [] },
  activeCatId: null,
  editingItem: null,
  pendingImage: null,  // File object
  currentEmoji: '🍽️',
  confirmCallback: null,
};

const EMOJI_LIST = [
  '🍱','🥘','🍽️','🍲','🥣','🍳','🥞','🥗','🫒','🥦','🍖','🍗','🐟',
  '🫑','🥟','🥔','🍝','🌾','🍚','🥬','🫙','🫐','🥐','🍒','🧁','🍞',
  '🧈','🍅','🥛','🍵','☕','💧','🧃','📦','🧻','🔪','🥄','🍴','🍬',
  '🧆','🌮','🌯','🥙','🫔','🥚','🧀','🥩','🍔','🍟','🌭',
];

/* ===== API HELPER ===== */
async function api(method, url, body = null, isForm = false) {
  const opts = {
    method,
    headers: { Authorization: 'Bearer ' + S.token },
  };
  if (body) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

/* ===== TOAST ===== */
function toast(msg, type = 'default') {
  const wrap = document.getElementById('toastWrap');
  const el   = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

/* ===== CONFIRM MODAL ===== */
function confirm(text, cb) {
  S.confirmCallback = cb;
  document.getElementById('confirmText').textContent = text;
  openModal('confirmModal');
}
document.getElementById('confirmOk').addEventListener('click', () => {
  closeModal('confirmModal');
  S.confirmCallback?.();
});
document.getElementById('confirmCancel').addEventListener('click',      () => closeModal('confirmModal'));
document.getElementById('confirmModalClose').addEventListener('click',  () => closeModal('confirmModal'));

/* ===== MODAL OPEN / CLOSE ===== */
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden');    }

document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
});

/* ══════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════ */
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');
  btn.textContent = 'Вход...';
  btn.disabled = true;
  err.textContent = '';
  try {
    const password = document.getElementById('loginPassword').value;
    const data = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const json = await data.json();
    if (!data.ok) throw new Error(json.error);
    S.token = json.token;
    sessionStorage.setItem('adminToken', S.token);
    showApp();
  } catch (e2) {
    err.textContent = e2.message || 'Неверный пароль';
    btn.disabled = false;
    btn.textContent = 'Войти';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await api('POST', '/api/admin/logout'); } catch {}
  S.token = null;
  sessionStorage.removeItem('adminToken');
  document.getElementById('adminApp').classList.add('hidden');
  document.getElementById('loginScreen').style.display = 'flex';
});

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */
async function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').classList.remove('hidden');
  await loadMenu();
}

async function loadMenu() {
  try {
    S.menu = await api('GET', '/api/menu');
    renderSidebar();
    if (S.activeCatId) renderItems(S.activeCatId);
  } catch (e) {
    toast('Ошибка загрузки меню: ' + e.message, 'error');
  }
}

async function checkAuth() {
  if (!S.token) return;
  try {
    await api('GET', '/api/admin/check');
    showApp();
  } catch {
    S.token = null;
    sessionStorage.removeItem('adminToken');
  }
}

/* ══════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════ */
function renderSidebar() {
  const nav = document.getElementById('sidebarNav');
  nav.innerHTML = '';

  S.menu.categories.forEach(cat => {
    const items  = S.menu.items.filter(i => i.categoryId === cat.id);
    const active = items.filter(i => i.active).length;
    const li     = document.createElement('div');
    li.className = 'sidebar-cat-item' + (S.activeCatId === cat.id ? ' active' : '');
    li.dataset.catId = cat.id;
    li.innerHTML = `
      <span class="sidebar-cat-dot ${cat.active ? 'on' : 'off'}"></span>
      <span class="sidebar-cat-name">${cat.name}</span>
      <span class="sidebar-cat-count">${active}/${items.length}</span>
      <div class="sidebar-cat-actions">
        <button class="sidebar-icon-btn red" data-action="del-cat" data-id="${cat.id}" title="Удалить категорию">🗑</button>
      </div>`;

    li.addEventListener('click', e => {
      if (e.target.closest('[data-action]')) return;
      selectCategory(cat.id);
    });

    li.querySelector('[data-action="del-cat"]').addEventListener('click', e => {
      e.stopPropagation();
      confirm(`Удалить категорию «${cat.name}» и все её позиции?`, () => deleteCategory(cat.id));
    });

    nav.appendChild(li);
  });
}

function selectCategory(catId) {
  S.activeCatId = catId;
  renderSidebar();
  renderItems(catId);
  document.getElementById('welcomeState').classList.add('hidden');
  closeSidebarMobile();
}

/* ══════════════════════════════════════════════
   ITEMS RENDER
══════════════════════════════════════════════ */
function renderItems(catId) {
  const cat   = S.menu.categories.find(c => c.id === catId);
  const items = S.menu.items.filter(i => i.categoryId === catId);
  const grid  = document.getElementById('itemsGrid');
  const empty = document.getElementById('emptyState');

  document.getElementById('topbarTitle').textContent = cat ? cat.name : '';

  const total  = items.length;
  const active = items.filter(i => i.active).length;
  document.getElementById('statTotal').textContent  = total;
  document.getElementById('statActive').textContent = active;
  document.getElementById('statHidden').textContent = total - active;

  grid.innerHTML = '';

  if (total === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  items.forEach(item => grid.appendChild(createItemCard(item)));
}

function createItemCard(item) {
  const card = document.createElement('div');
  card.className = 'item-card' + (item.active ? '' : ' inactive');
  card.id = 'card-' + item.id;

  const mediaPart = item.image
    ? `<img class="item-card-img" src="${item.image}" alt="${item.name}" loading="lazy" />`
    : `<span class="item-card-emoji-big">${item.emoji}</span>`;

  const badgeText  = item.active ? 'Активно' : 'Скрыто';
  const badgeClass = item.active ? 'active' : 'inactive';
  const toggleText = item.active ? '🙈 Скрыть' : '👁 Показать';

  card.innerHTML = `
    <div class="item-card-media">
      ${mediaPart}
      <span class="item-card-badge ${badgeClass}">${badgeText}</span>
    </div>
    <div class="item-card-body">
      <div class="item-card-name">${item.name}</div>
      <div class="item-card-meta">
        <span class="item-card-price">${item.price} ₽</span>
        <span class="item-card-weight">${item.weight || ''}</span>
      </div>
      <div class="item-card-actions">
        <button class="card-btn card-btn-edit"   data-action="edit"   data-id="${item.id}">✏️ Изменить</button>
        <button class="card-btn card-btn-toggle" data-action="toggle" data-id="${item.id}">${toggleText}</button>
        <button class="card-btn card-btn-delete" data-action="delete" data-id="${item.id}">🗑</button>
      </div>
    </div>`;

  card.querySelector('[data-action="edit"]').addEventListener('click',   () => openItemEdit(item.id));
  card.querySelector('[data-action="toggle"]').addEventListener('click', () => toggleItem(item.id));
  card.querySelector('[data-action="delete"]').addEventListener('click', () => {
    confirm(`Удалить «${item.name}»?`, () => deleteItem(item.id));
  });

  return card;
}

/* ══════════════════════════════════════════════
   ADD ITEM BUTTON
══════════════════════════════════════════════ */
document.getElementById('addItemBtn').addEventListener('click', () => {
  if (!S.activeCatId) { toast('Сначала выберите категорию', 'error'); return; }
  openItemModal(null);
});

/* ══════════════════════════════════════════════
   ITEM MODAL
══════════════════════════════════════════════ */
function openItemModal(item) {
  S.editingItem  = item;
  S.pendingImage = null;
  S.currentEmoji = item?.emoji || '🍽️';

  document.getElementById('itemModalTitle').textContent = item ? 'Редактировать позицию' : 'Добавить позицию';
  document.getElementById('editItemId').value           = item?.id || '';
  document.getElementById('itemName').value             = item?.name     || '';
  document.getElementById('itemPrice').value            = item?.price    || '';
  document.getElementById('itemWeight').value           = item?.weight   || '';
  document.getElementById('itemDescription').value      = item?.description || '';
  document.getElementById('emojiCustom').value          = item?.emoji    || '🍽️';

  document.getElementById('itemName').classList.remove('error');
  document.getElementById('itemPrice').classList.remove('error');

  populateCategorySelect(item?.categoryId || S.activeCatId);
  renderEmojiGrid();
  updatePhotoPreview(item?.image || null);
  document.getElementById('imageInput').value = '';

  openModal('itemModal');
}

function openItemEdit(id) {
  const item = S.menu.items.find(i => i.id === id);
  if (item) openItemModal(item);
}

function populateCategorySelect(selectedId) {
  const sel = document.getElementById('itemCategory');
  sel.innerHTML = '';
  S.menu.categories.forEach(cat => {
    const opt      = document.createElement('option');
    opt.value      = cat.id;
    opt.textContent = cat.name;
    if (cat.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderEmojiGrid() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  EMOJI_LIST.forEach(em => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'emoji-btn' + (em === S.currentEmoji ? ' active' : '');
    btn.textContent = em;
    btn.addEventListener('click', () => {
      S.currentEmoji = em;
      document.getElementById('emojiCustom').value = em;
      document.getElementById('previewEmoji').textContent = em;
      grid.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    grid.appendChild(btn);
  });
}

/* Photo preview */
function updatePhotoPreview(url) {
  const emoji  = document.getElementById('previewEmoji');
  const img    = document.getElementById('previewImg');
  const rmBtn  = document.getElementById('removePhotoBtn');
  if (url) {
    emoji.classList.add('hidden');
    img.src = url;
    img.classList.remove('hidden');
    rmBtn.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
    img.src = '';
    emoji.classList.remove('hidden');
    emoji.textContent = S.currentEmoji;
    rmBtn.classList.add('hidden');
  }
}

document.getElementById('imageInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  S.pendingImage = file;
  const url = URL.createObjectURL(file);
  updatePhotoPreview(url);
});

document.getElementById('removePhotoBtn').addEventListener('click', () => {
  S.pendingImage = null;
  document.getElementById('imageInput').value = '';
  if (S.editingItem) S.editingItem._removeImage = true;
  updatePhotoPreview(null);
});

document.getElementById('emojiCustom').addEventListener('input', e => {
  const v = e.target.value;
  if (v) {
    S.currentEmoji = v;
    document.getElementById('previewEmoji').textContent = v;
  }
});

document.getElementById('itemModalClose').addEventListener('click',  () => closeModal('itemModal'));
document.getElementById('itemModalCancel').addEventListener('click', () => closeModal('itemModal'));

/* ── Submit ── */
document.getElementById('itemForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name  = document.getElementById('itemName').value.trim();
  const price = document.getElementById('itemPrice').value;
  let valid   = true;

  document.getElementById('itemName').classList.remove('error');
  document.getElementById('itemPrice').classList.remove('error');

  if (!name)  { document.getElementById('itemName').classList.add('error');  valid = false; }
  if (!price) { document.getElementById('itemPrice').classList.add('error'); valid = false; }
  if (!valid) return;

  const fd = new FormData();
  fd.append('name',       name);
  fd.append('price',      price);
  fd.append('weight',     document.getElementById('itemWeight').value.trim());
  fd.append('emoji',      document.getElementById('emojiCustom').value.trim() || S.currentEmoji);
  fd.append('categoryId', document.getElementById('itemCategory').value);
  fd.append('description',document.getElementById('itemDescription').value.trim());
  if (S.pendingImage) fd.append('image', S.pendingImage);

  const btn = document.getElementById('itemFormSubmit');
  btn.textContent = 'Сохранение...';
  btn.disabled = true;

  try {
    const editId = document.getElementById('editItemId').value;
    if (editId) {
      if (S.editingItem?._removeImage) fd.append('removeImage', 'true');
      await api('PUT', '/api/menu/item/' + editId, fd, true);
      toast('Позиция обновлена ✓', 'success');
    } else {
      await api('POST', '/api/menu/item', fd, true);
      toast('Позиция добавлена ✓', 'success');
    }
    closeModal('itemModal');
    await loadMenu();
    renderItems(S.activeCatId);
  } catch (err) {
    toast('Ошибка: ' + err.message, 'error');
  } finally {
    btn.textContent = 'Сохранить';
    btn.disabled = false;
  }
});

/* ══════════════════════════════════════════════
   TOGGLE / DELETE ITEM
══════════════════════════════════════════════ */
async function toggleItem(id) {
  try {
    await api('PATCH', `/api/menu/item/${id}/toggle`);
    await loadMenu();
    renderItems(S.activeCatId);
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  }
}

async function deleteItem(id) {
  try {
    await api('DELETE', `/api/menu/item/${id}`);
    toast('Позиция удалена', 'success');
    await loadMenu();
    renderItems(S.activeCatId);
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  }
}

/* ══════════════════════════════════════════════
   CATEGORY CRUD
══════════════════════════════════════════════ */
document.getElementById('addCategoryBtn').addEventListener('click', () => {
  document.getElementById('catName').value = '';
  document.getElementById('catModalTitle').textContent = 'Новая категория';
  openModal('catModal');
});

document.getElementById('catModalClose').addEventListener('click',  () => closeModal('catModal'));
document.getElementById('catModalCancel').addEventListener('click', () => closeModal('catModal'));

document.getElementById('catForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('catName').value.trim();
  if (!name) return;
  try {
    const cat = await api('POST', '/api/categories', { name });
    toast('Категория «' + cat.name + '» создана ✓', 'success');
    closeModal('catModal');
    await loadMenu();
    selectCategory(cat.id);
  } catch (err) {
    toast('Ошибка: ' + err.message, 'error');
  }
});

async function deleteCategory(id) {
  try {
    await api('DELETE', '/api/categories/' + id);
    toast('Категория удалена', 'success');
    if (S.activeCatId === id) {
      S.activeCatId = null;
      document.getElementById('topbarTitle').textContent = 'Выберите категорию';
      document.getElementById('itemsGrid').innerHTML = '';
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('welcomeState').classList.remove('hidden');
    }
    await loadMenu();
  } catch (e) {
    toast('Ошибка: ' + e.message, 'error');
  }
}

/* ══════════════════════════════════════════════
   SIDEBAR MOBILE TOGGLE
══════════════════════════════════════════════ */
const sidebarOverlay = document.createElement('div');
sidebarOverlay.className = 'sidebar-overlay';
document.body.appendChild(sidebarOverlay);

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  sidebarOverlay.style.display =
    document.getElementById('sidebar').classList.contains('open') ? 'block' : 'none';
});

sidebarOverlay.addEventListener('click', closeSidebarMobile);

function closeSidebarMobile() {
  document.getElementById('sidebar').classList.remove('open');
  sidebarOverlay.style.display = 'none';
}

/* ══════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════ */
checkAuth();
