const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── paths ─────────────────────────────────── */
const MENU_FILE   = path.join(__dirname, 'menu.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/* ── multer ────────────────────────────────── */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename:    (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /^image\/(jpeg|jpg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Только изображения'), ok);
  },
});

/* ── middleware ────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

/* ── token auth ────────────────────────────── */
const tokens = new Set();

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || !tokens.has(token)) return res.status(401).json({ error: 'Нет доступа' });
  next();
}

/* ── menu helpers ──────────────────────────── */
function readMenu() {
  if (!fs.existsSync(MENU_FILE)) return buildInitialMenu();
  try { return JSON.parse(fs.readFileSync(MENU_FILE, 'utf8')); }
  catch { return buildInitialMenu(); }
}

function writeMenu(menu) {
  fs.writeFileSync(MENU_FILE, JSON.stringify(menu, null, 2), 'utf8');
}

function buildInitialMenu() {
  const menu = { categories: INITIAL_CATEGORIES, items: INITIAL_ITEMS };
  writeMenu(menu);
  return menu;
}

/* ── routes: public ────────────────────────── */
app.get('/api/menu', (_, res) => res.json(readMenu()));

/* ── routes: admin login ───────────────────── */
app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Неверный пароль' });
  const token = crypto.randomBytes(32).toString('hex');
  tokens.add(token);
  res.json({ token });
});

app.post('/api/admin/logout', auth, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  tokens.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/check', auth, (_, res) => res.json({ ok: true }));

/* ── routes: categories (admin) ────────────── */
app.get('/api/categories', auth, (_, res) => {
  res.json(readMenu().categories);
});

app.post('/api/categories', auth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Нужно название' });
  const menu = readMenu();
  const cat = { id: 'cat-' + Date.now(), name, active: true };
  menu.categories.push(cat);
  writeMenu(menu);
  res.json(cat);
});

app.put('/api/categories/:id', auth, (req, res) => {
  const menu = readMenu();
  const cat  = menu.categories.find(c => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Категория не найдена' });
  if (req.body.name   !== undefined) cat.name   = req.body.name;
  if (req.body.active !== undefined) cat.active = req.body.active;
  writeMenu(menu);
  res.json(cat);
});

app.delete('/api/categories/:id', auth, (req, res) => {
  const menu = readMenu();
  const idx  = menu.categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Категория не найдена' });
  menu.categories.splice(idx, 1);
  menu.items = menu.items.filter(i => i.categoryId !== req.params.id);
  writeMenu(menu);
  res.json({ ok: true });
});

/* ── routes: items (admin) ─────────────────── */
app.post('/api/menu/item', auth, upload.single('image'), (req, res) => {
  const { name, categoryId, price, weight, emoji } = req.body;
  if (!name || !categoryId || !price) return res.status(400).json({ error: 'name, categoryId, price — обязательны' });
  const menu = readMenu();
  const item = {
    id:         'item-' + Date.now(),
    categoryId,
    name,
    price:  parseInt(price, 10),
    weight: weight  || '',
    emoji:  emoji   || '🍽️',
    image:  req.file ? '/uploads/' + req.file.filename : null,
    active: true,
  };
  menu.items.push(item);
  writeMenu(menu);
  res.json(item);
});

app.put('/api/menu/item/:id', auth, upload.single('image'), (req, res) => {
  const menu = readMenu();
  const item = menu.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Позиция не найдена' });

  const { name, categoryId, price, weight, emoji, active } = req.body;
  if (name       !== undefined) item.name       = name;
  if (categoryId !== undefined) item.categoryId = categoryId;
  if (price      !== undefined) item.price      = parseInt(price, 10);
  if (weight     !== undefined) item.weight     = weight;
  if (emoji      !== undefined) item.emoji      = emoji;
  if (active     !== undefined) item.active     = active === 'true';

  if (req.file) {
    if (item.image) {
      const old = path.join(__dirname, item.image);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    item.image = '/uploads/' + req.file.filename;
  }
  writeMenu(menu);
  res.json(item);
});

app.patch('/api/menu/item/:id/toggle', auth, (req, res) => {
  const menu = readMenu();
  const item = menu.items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Позиция не найдена' });
  item.active = !item.active;
  writeMenu(menu);
  res.json(item);
});

app.delete('/api/menu/item/:id', auth, (req, res) => {
  const menu = readMenu();
  const idx  = menu.items.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Позиция не найдена' });
  const [item] = menu.items.splice(idx, 1);
  if (item.image) {
    const file = path.join(__dirname, item.image);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  writeMenu(menu);
  res.json({ ok: true });
});

/* ── admin panel route ─────────────────────── */
app.get('/admin', (_, res) => res.sendFile(path.join(__dirname, 'admin.html')));

/* ── start ─────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n☀️  Солнечный день — сервер запущен`);
  console.log(`   Мини-апп:    http://localhost:${PORT}/`);
  console.log(`   Админ-панель: http://localhost:${PORT}/admin`);
  console.log(`   Пароль:      ${ADMIN_PASSWORD}\n`);
});

/* ══════════════════════════════════════════════
   INITIAL MENU DATA
══════════════════════════════════════════════ */
const INITIAL_CATEGORIES = [
  { id: 'lunches',   name: 'Комплексные обеды',        active: true },
  { id: 'breakfast', name: 'Завтраки',                  active: true },
  { id: 'soups',     name: 'Супы',                      active: true },
  { id: 'salads',    name: 'Салаты',                    active: true },
  { id: 'hot',       name: 'Горячее',                   active: true },
  { id: 'garnish',   name: 'Гарниры',                   active: true },
  { id: 'pancakes',  name: 'Блинчики',                  active: true },
  { id: 'sweet',     name: 'Сладкие добавки',           active: true },
  { id: 'additions', name: 'Добавки',                   active: true },
  { id: 'frozen',    name: 'Замороженные полуфабрикаты', active: true },
  { id: 'drinks',    name: 'Напитки',                   active: true },
  { id: 'sugar',     name: 'Сахар и приборы',           active: true },
];

const INITIAL_ITEMS = [
  // Комплексные обеды
  { id:'l1', categoryId:'lunches',   name:'Комплексный обед №1 (суп + горячее + салат + компот)', price:320, weight:'600г', emoji:'🍱', image:null, active:true },
  { id:'l2', categoryId:'lunches',   name:'Комплексный обед №2 (суп + горячее + хлеб)',           price:270, weight:'500г', emoji:'🥘', image:null, active:true },
  { id:'l3', categoryId:'lunches',   name:'Комплексный обед №3 (горячее + гарнир + салат)',       price:290, weight:'550г', emoji:'🍽️',image:null, active:true },
  { id:'l4', categoryId:'lunches',   name:'Бизнес-ланч (суп + горячее + гарнир + напиток)',       price:350, weight:'650г', emoji:'🍱', image:null, active:true },
  // Завтраки
  { id:'b1', categoryId:'breakfast', name:'Каша овсяная с маслом',    price:90,  weight:'250г', emoji:'🥣', image:null, active:true },
  { id:'b2', categoryId:'breakfast', name:'Омлет с сыром',            price:130, weight:'200г', emoji:'🍳', image:null, active:true },
  { id:'b3', categoryId:'breakfast', name:'Сырники со сметаной',      price:150, weight:'250г', emoji:'🥞', image:null, active:true },
  { id:'b4', categoryId:'breakfast', name:'Каша гречневая с маслом',  price:90,  weight:'250г', emoji:'🥣', image:null, active:true },
  { id:'b5', categoryId:'breakfast', name:'Творог со сметаной',       price:120, weight:'200г', emoji:'🥛', image:null, active:true },
  { id:'b6', categoryId:'breakfast', name:'Яйца вареные (2 шт)',      price:60,  weight:'120г', emoji:'🥚', image:null, active:true },
  // Супы
  { id:'s1', categoryId:'soups',     name:'Борщ со сметаной',                    price:140, weight:'300г', emoji:'🍲', image:null, active:true },
  { id:'s2', categoryId:'soups',     name:'Щи из свежей капусты',                price:120, weight:'300г', emoji:'🥣', image:null, active:true },
  { id:'s3', categoryId:'soups',     name:'Куриный суп с лапшой',                price:130, weight:'300г', emoji:'🍜', image:null, active:true },
  { id:'s4', categoryId:'soups',     name:'Солянка мясная',                      price:160, weight:'300г', emoji:'🍲', image:null, active:true },
  { id:'s5', categoryId:'soups',     name:'Уха рыбная',                          price:150, weight:'300г', emoji:'🐟', image:null, active:true },
  { id:'s6', categoryId:'soups',     name:'Гороховый суп с копчёностями',        price:135, weight:'300г', emoji:'🫛', image:null, active:true },
  // Салаты
  { id:'sa1',categoryId:'salads',    name:'Салат «Оливье»',                      price:120, weight:'200г', emoji:'🥗', image:null, active:true },
  { id:'sa2',categoryId:'salads',    name:'Салат «Цезарь» с курицей',            price:180, weight:'220г', emoji:'🥗', image:null, active:true },
  { id:'sa3',categoryId:'salads',    name:'Салат «Греческий»',                   price:160, weight:'200г', emoji:'🫒', image:null, active:true },
  { id:'sa4',categoryId:'salads',    name:'Салат из свежих овощей',              price:100, weight:'200г', emoji:'🥦', image:null, active:true },
  { id:'sa5',categoryId:'salads',    name:'Свекольный салат с чесноком',         price:90,  weight:'180г', emoji:'🥗', image:null, active:true },
  { id:'sa6',categoryId:'salads',    name:'Салат «Мимоза»',                      price:130, weight:'200г', emoji:'🥗', image:null, active:true },
  // Горячее
  { id:'h1', categoryId:'hot',       name:'Котлета мясная (2 шт)',               price:160, weight:'180г', emoji:'🍖', image:null, active:true },
  { id:'h2', categoryId:'hot',       name:'Куриная грудка запечённая',           price:190, weight:'200г', emoji:'🍗', image:null, active:true },
  { id:'h3', categoryId:'hot',       name:'Рыба минтай жареная',                 price:170, weight:'200г', emoji:'🐟', image:null, active:true },
  { id:'h4', categoryId:'hot',       name:'Голубцы с мясом (2 шт)',              price:200, weight:'300г', emoji:'🫑', image:null, active:true },
  { id:'h5', categoryId:'hot',       name:'Пельмени домашние',                   price:180, weight:'300г', emoji:'🥟', image:null, active:true },
  { id:'h6', categoryId:'hot',       name:'Картофельные зразы с мясом',         price:150, weight:'250г', emoji:'🥔', image:null, active:true },
  { id:'h7', categoryId:'hot',       name:'Тефтели в томатном соусе',            price:175, weight:'280г', emoji:'🍝', image:null, active:true },
  // Гарниры
  { id:'g1', categoryId:'garnish',   name:'Картофельное пюре',                   price:80,  weight:'200г', emoji:'🥔', image:null, active:true },
  { id:'g2', categoryId:'garnish',   name:'Гречка отварная',                     price:70,  weight:'200г', emoji:'🌾', image:null, active:true },
  { id:'g3', categoryId:'garnish',   name:'Рис отварной',                        price:70,  weight:'200г', emoji:'🍚', image:null, active:true },
  { id:'g4', categoryId:'garnish',   name:'Макароны отварные',                   price:70,  weight:'200г', emoji:'🍝', image:null, active:true },
  { id:'g5', categoryId:'garnish',   name:'Капуста тушёная',                     price:80,  weight:'200г', emoji:'🥬', image:null, active:true },
  { id:'g6', categoryId:'garnish',   name:'Перловка с маслом',                   price:65,  weight:'200г', emoji:'🌾', image:null, active:true },
  // Блинчики
  { id:'p1', categoryId:'pancakes',  name:'Блинчики с творогом (3 шт)',          price:130, weight:'250г', emoji:'🥞', image:null, active:true },
  { id:'p2', categoryId:'pancakes',  name:'Блинчики с мясом (3 шт)',             price:150, weight:'270г', emoji:'🥞', image:null, active:true },
  { id:'p3', categoryId:'pancakes',  name:'Блинчики с вареньем (3 шт)',          price:110, weight:'230г', emoji:'🫐', image:null, active:true },
  { id:'p4', categoryId:'pancakes',  name:'Блинчики с капустой (3 шт)',          price:120, weight:'250г', emoji:'🥞', image:null, active:true },
  // Сладкие добавки
  { id:'sw1',categoryId:'sweet',     name:'Компот домашний',                     price:60,  weight:'200мл',emoji:'🫙', image:null, active:true },
  { id:'sw2',categoryId:'sweet',     name:'Кисель ягодный',                      price:55,  weight:'200мл',emoji:'🫐', image:null, active:true },
  { id:'sw3',categoryId:'sweet',     name:'Пирожок с яблоком',                   price:65,  weight:'100г', emoji:'🥐', image:null, active:true },
  { id:'sw4',categoryId:'sweet',     name:'Пирожок с вишней',                    price:65,  weight:'100г', emoji:'🍒', image:null, active:true },
  { id:'sw5',categoryId:'sweet',     name:'Кекс шоколадный',                     price:80,  weight:'120г', emoji:'🧁', image:null, active:true },
  // Добавки
  { id:'ad1',categoryId:'additions', name:'Хлеб белый (2 куска)',                price:20,  weight:'60г',  emoji:'🍞', image:null, active:true },
  { id:'ad2',categoryId:'additions', name:'Хлеб чёрный (2 куска)',               price:20,  weight:'60г',  emoji:'🍞', image:null, active:true },
  { id:'ad3',categoryId:'additions', name:'Сметана (порция)',                    price:40,  weight:'50г',  emoji:'🥛', image:null, active:true },
  { id:'ad4',categoryId:'additions', name:'Масло сливочное (порция)',            price:30,  weight:'20г',  emoji:'🧈', image:null, active:true },
  // Замороженные
  { id:'fr1',categoryId:'frozen',    name:'Пельмени замороженные (0.5 кг)',      price:250, weight:'500г', emoji:'🥟', image:null, active:true },
  { id:'fr2',categoryId:'frozen',    name:'Голубцы замороженные (1 кг)',         price:380, weight:'1кг',  emoji:'🫑', image:null, active:true },
  { id:'fr3',categoryId:'frozen',    name:'Котлеты замороженные (0.5 кг)',       price:290, weight:'500г', emoji:'🍖', image:null, active:true },
  { id:'fr4',categoryId:'frozen',    name:'Блинчики с мясом замороженные (0.5 кг)',price:280,weight:'500г',emoji:'🥞', image:null, active:true },
  // Напитки
  { id:'d1', categoryId:'drinks',    name:'Чай чёрный',                          price:50,  weight:'200мл',emoji:'🍵', image:null, active:true },
  { id:'d2', categoryId:'drinks',    name:'Кофе чёрный',                         price:70,  weight:'150мл',emoji:'☕', image:null, active:true },
  { id:'d3', categoryId:'drinks',    name:'Морс ягодный',                        price:60,  weight:'200мл',emoji:'🫐', image:null, active:true },
  { id:'d4', categoryId:'drinks',    name:'Вода питьевая 0.5л',                  price:45,  weight:'500мл',emoji:'💧', image:null, active:true },
  { id:'d5', categoryId:'drinks',    name:'Сок в ассортименте 0.2л',             price:55,  weight:'200мл',emoji:'🧃', image:null, active:true },
  // Сахар и приборы
  { id:'su1',categoryId:'sugar',     name:'Сахар порционный (2 пакетика)',       price:9,   weight:'10г',  emoji:'🍬', image:null, active:true },
  { id:'su2',categoryId:'sugar',     name:'Вилка одноразовая',                   price:5,   weight:'',     emoji:'🍴', image:null, active:true },
  { id:'su3',categoryId:'sugar',     name:'Ложка одноразовая',                   price:5,   weight:'',     emoji:'🥄', image:null, active:true },
  { id:'su4',categoryId:'sugar',     name:'Нож одноразовый',                     price:5,   weight:'',     emoji:'🔪', image:null, active:true },
  { id:'su5',categoryId:'sugar',     name:'Салфетки (5 шт)',                     price:10,  weight:'',     emoji:'🧻', image:null, active:true },
  { id:'su6',categoryId:'sugar',     name:'Контейнер',                           price:9,   weight:'',     emoji:'📦', image:null, active:true },
];
