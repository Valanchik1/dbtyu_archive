(() => {
  'use strict';
  const data = window.ARCHIVE_DATA;
  const root = document.getElementById('app');
  if (!data || !Array.isArray(data.sections)) {
    root.innerHTML = '<div class="empty-state"><h1>Архив пока недоступен.</h1><p>Попробуй обновить страницу.</p></div>';
    return;
  }

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
  const safeUrl = value => {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
    } catch { return ''; }
  };
  const covers = {works:'assets/portrait.webp', au:'assets/silhouette.webp', drafts:'assets/window.webp', updates:'assets/shoes.webp', letters:'assets/lips.webp'};
  const emojiNames = {works:'heart', au:'sexy', drafts:'cat', updates:'fire', letters:'hand'};
  const photo = (path, alt='', extra='') => `<img src="${esc(/^assets\/[a-z0-9_-]+\.(?:webp|jpg|png)$/i.test(String(path || '')) ? path : covers.works)}" alt="${esc(alt)}" ${extra}>`;
  const coverFor = entry => entry.item?.cover || (entry.item?.id === 'golden-brown' ? covers.letters : '') || entry.section?.cover || covers[entry.section?.id || entry.id] || covers.works;
  const channelEmoji = type => `<span class="channel-emoji emoji-${Object.values(emojiNames).includes(type) ? type : 'heart'}" aria-hidden="true"></span>`;
  const entries = data.sections.flatMap(section => (section.items || []).map(item => ({section, item, key: section.id + '/' + item.id})));
  const statusNames = {ongoing:'в процессе', archive:'в архиве', fragment:'фрагмент', spoiler:'спойлер', answered:'ответ'};
  const sectionCopy = {
    works: ['истории, которые остаются', 'Здесь живут большие истории — от первой строки до последней главы.'],
    au: ['а если бы всё было иначе?', 'Другие обстоятельства. Другие вселенные. Всё те же чувства.'],
    drafts: ['мысли на полях', 'Небольшие сцены, наброски и слова, которым пока не нужна целая история.'],
    updates: ['что происходит между главами', 'Новости, маленькие подсказки и немного того, что будет дальше.'],
    letters: ['всё, о чём хочется спросить', 'Письма без подписи и ответы, которые хочется сохранить.']
  };
  const icons = {
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    bookmark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 3.5h12V21l-6-4-6 4Z"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>'
  };
  const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many;
  const partsLabel = n => `${n} ${plural(n, 'часть', 'части', 'частей')}`;
  const normalize = text => String(text || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  function storedArray(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value.filter(x => typeof x === 'string') : [];
    } catch { return []; }
  }
  const saved = new Set(storedArray('dbtyu.saved.v2').filter(key => entries.some(e => e.key === key)));
  const read = new Set(storedArray('dbtyu.read.v2'));
  let toastTimer;
  let filterState = {q:'', section:'all', status:'all'};
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
  }
  function persist(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); return true; }
    catch { toast('Браузер не разрешает сохранение. Выбор сохранится до закрытия страницы.'); return false; }
  }
  const sdk = window.Telegram?.WebApp;
  const tg = sdk && (sdk.initData || (sdk.platform && sdk.platform !== 'unknown')) ? sdk : null;
  function tgCall(fn) { try { return fn(); } catch { return undefined; } }
  if (tg) {
    tgCall(() => tg.ready());
    tgCall(() => tg.expand());
    tgCall(() => tg.setHeaderColor?.(tg.isVersionAtLeast?.('6.9') ? '#3b3a3b' : 'bg_color'));
    tgCall(() => tg.setBackgroundColor?.('#c8c8c7'));
    if (tg.isVersionAtLeast?.('7.10')) tgCall(() => tg.setBottomBarColor?.('#3b3a3b'));
    const updateInsets = () => {
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const inset = Math.max(0, Number(tg.contentSafeAreaInset?.[side]) || 0, Number(tg.safeAreaInset?.[side]) || 0);
        document.documentElement.style.setProperty('--tg-inset-' + side, inset + 'px');
      }
    };
    updateInsets();
    tgCall(() => tg.onEvent?.('contentSafeAreaChanged', updateInsets));
    tgCall(() => tg.onEvent?.('safeAreaChanged', updateInsets));
    tgCall(() => tg.BackButton?.onClick(handleBack));
  }

  function route() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    let parts;
    try { parts = path.split('/').filter(Boolean).map(decodeURIComponent); }
    catch { parts = ['not-found']; }
    return {parts, params:new URLSearchParams(query)};
  }
  function go(path) {
    if (location.hash === '#' + path) render();
    else location.hash = path;
  }
  const catalogPath = (section='all', q='', status='all') => {
    const params = new URLSearchParams();
    if (section !== 'all') params.set('section', section);
    if (q) params.set('q', q);
    if (status !== 'all') params.set('status', status);
    const query = params.toString();
    return '/catalog' + (query ? '?' + query : '');
  };
  const storyPath = entry => '/story/' + encodeURIComponent(entry.section.id) + '/' + encodeURIComponent(entry.item.id);
  const chapterKey = (entry, chapter, n) => entry.key + '#' + (chapter.id || n + 1);
  function progress(entry) {
    const chapters = entry.item.chapters || [];
    return chapters.reduce((n, c, i) => n + (read.has(chapterKey(entry,c,i)) ? 1 : 0), 0);
  }
  function filteredEntries() {
    const q = normalize(filterState.q);
    return entries.filter(({item,section}) => (filterState.section === 'all' || section.id === filterState.section)
      && (filterState.status === 'all' || item.tag === filterState.status)
      && (!q || normalize([item.title,item.description,item.kind,item.tag,statusNames[item.tag],section.label,section.ru].join(' ')).includes(q)));
  }
  function badge(item) { return `<span class="status-badge ${item.tag === 'ongoing' ? 'status-ongoing' : ''}">${item.tag === 'ongoing' ? '<i></i>' : ''}${esc(statusNames[item.tag] || item.tag || 'в архиве')}</span>`; }
  function favoriteButton(entry, extraClass='') {
    const selected = saved.has(entry.key);
    return `<button class="save-button ${extraClass} ${selected ? 'is-saved' : ''}" data-action="save" data-key="${esc(entry.key)}" aria-label="${selected ? 'Убрать из избранного' : 'В избранное'}: ${esc(entry.item.title)}" aria-pressed="${selected}">${icons.bookmark}</button>`;
  }
  function storyCard(entry, index=0) {
    const {section,item} = entry;
    const chapters = item.chapters || [];
    const done = progress(entry);
    return `<article class="story-card">${favoriteButton(entry)}<a class="story-main" href="#${esc(storyPath(entry))}"><div class="story-art art-${esc(section.id)}" aria-hidden="true">${photo(coverFor(entry),'','loading="lazy"')}<span class="art-file">FILE ${esc(section.number)} / ${String(index+1).padStart(2,'0')}</span><span class="art-sticker">${channelEmoji(emojiNames[section.id])}</span></div><div class="story-body"><div class="story-meta"><span>${esc(section.label)}</span>${badge(item)}</div><h3>${esc(item.title)}</h3><div class="story-bottom"><span>${chapters.length ? partsLabel(chapters.length) : esc(item.kind)}${done ? ` · прочитано ${done}` : ''}</span><span class="card-open" aria-hidden="true">↗</span></div></div></a></article>`;
  }
  function emptyState(title, text, cta='к историям', path='/catalog') {
    return `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">⌞ ♡ ⌝</span><h2>${esc(title)}</h2><p>${esc(text)}</p><a class="button button-outline" href="#${esc(path)}">${esc(cta)} <span>↗</span></a></div>`;
  }

  function home() {
    const chapters = entries.reduce((n,e) => n + (e.item.chapters || []).length, 0);
    const featured = [entries.find(e => e.section.id === 'au'), entries.find(e => e.section.id === 'works')].filter(Boolean);
    return `<section class="hero"><div class="hero-copy"><div class="eyebrow">𓂃 ࣪˖ ${esc(data.subtitle)}</div><h1>dbt.yu<br> <em>archive</em><span class="hero-period">.</span></h1><p>${esc(data.intro)}</p><div class="hero-actions"><a class="button button-red" href="#${catalogPath('au')}">открыть AU <span>↗</span></a><a class="text-link" href="#/catalog">все истории <span>→</span></a></div><div class="hero-footnote">${channelEmoji('heart')} a little world, kept here.</div></div><div class="hero-art channel-mosaic" role="img" aria-label="Чёрно-белый фотоколлаж из оформления канала: портрет, силуэты, обувь, окно и губы">${photo(covers.works)}${photo(covers.au)}<div class="mosaic-strip">${photo(covers.updates)}${photo(covers.drafts)}${photo(covers.letters)}</div><span class="hero-label">private collection / 001</span><span class="hero-sticker">${channelEmoji('heart')}</span></div></section>
    <div class="archive-stats"><span><b>${String(entries.length).padStart(2,'0')}</b> ${plural(entries.length,'запись','записи','записей')}</span><span><b>${String(chapters).padStart(2,'0')}</b> ${plural(chapters,'часть','части','частей')}</span><span><b>${String(data.sections.length).padStart(2,'0')}</b> ${plural(data.sections.length,'рубрика','рубрики','рубрик')}</span><span class="stats-note">every story has a place <i>↙</i></span></div>
    <section class="home-index"><div class="section-heading"><div><span class="eyebrow">⌞ table of contents ⌝</span><h2>Выбери свою вселенную</h2></div><span class="section-counter">01—${String(data.sections.length).padStart(2,'0')}</span></div><div class="section-grid">${data.sections.map(s => `<a class="section-card" href="#${catalogPath(s.id)}"><div class="section-photo">${photo(coverFor(s),'','loading="lazy"')}<span class="section-number">FILE ${esc(s.number)}</span><span class="section-sticker">${channelEmoji(emojiNames[s.id])}</span></div><span class="section-card-copy"><strong>${esc(s.label)}</strong><span>${esc(s.ru)}</span></span><span class="section-arrow" aria-hidden="true">↗</span></a>`).join('')}<a class="section-card section-card-saved" href="#/saved"><div class="saved-art" aria-hidden="true">${channelEmoji('heart')}<span>keep this.</span></div><span class="section-card-copy"><strong>saved for later</strong><span>то, к чему хочется вернуться</span></span><span class="section-arrow" aria-hidden="true">↗</span></a></div></section>
    ${featured.length ? `<section class="featured"><div class="section-heading"><div><span class="eyebrow">open a little world</span><h2>С чего начнём?</h2></div><a class="text-link" href="#/catalog">весь каталог <span>↗</span></a></div><div class="story-grid">${featured.map(storyCard).join('')}</div></section>` : ''}
    <div class="closing-note">${channelEmoji('cat')}<p>некоторые истории заканчиваются.<br><em>некоторые — остаются с нами.</em></p><span class="note-signature">dbt.yu</span></div>`;
  }

  function catalog(params) {
    const section = data.sections.find(s => s.id === params.get('section'));
    filterState = {q:params.get('q') || '', section:section?.id || 'all', status:statusNames[params.get('status')] ? params.get('status') : 'all'};
    const copy = sectionCopy[section?.id];
    return `<div class="page-heading"><a class="breadcrumb" href="#/">архив <span>/</span> ${esc(section?.label || 'все истории')}</a><div class="eyebrow">${section ? 'file ' + esc(section.number) + ' / ' + esc(copy?.[0] || section.subtitle) : 'the complete collection'}</div><h1>${esc(section?.label || 'все истории')}<i>.</i></h1><p>${esc(copy?.[1] || 'Большие истории и маленькие фрагменты. Всё, что хочется сохранить в одном месте.')}</p></div>
    <div class="search-field"><label for="archiveSearch" class="sr-only">Поиск по названиям, описаниям и рубрикам</label>${icons.search}<input id="archiveSearch" type="search" autocomplete="off" maxlength="200" placeholder="Найти свою историю…" value="${esc(filterState.q)}"><kbd>Ctrl K</kbd><button class="clear-search" data-action="clear-search" aria-label="Очистить поиск" ${filterState.q ? '' : 'hidden'}>×</button></div>
    <div class="catalog-toolbar"><div class="filter-tabs" aria-label="Фильтр по рубрике"><a class="filter-chip ${!section ? 'active' : ''}" href="#${esc(catalogPath('all', filterState.q,filterState.status))}" ${!section ? 'aria-current="true"' : ''}>всё <span>${entries.length}</span></a>${data.sections.map(s => `<a class="filter-chip ${section?.id === s.id ? 'active' : ''}" href="#${esc(catalogPath(s.id,filterState.q,filterState.status))}" ${section?.id === s.id ? 'aria-current="true"' : ''}>${esc(s.label)}</a>`).join('')}</div><label class="status-filter"><span class="sr-only">Статус записи</span><select id="statusFilter"><option value="all">любой статус</option>${Object.entries(statusNames).map(([k,v]) => `<option value="${k}" ${k === filterState.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
    <div class="results-line"><span id="resultsCount" aria-live="polite"></span><span class="results-note">choose a story / stay a little</span></div><div id="catalogResults"></div>`;
  }
  function paintResults() {
    const list = filteredEntries();
    $('resultsCount').textContent = `${list.length} ${plural(list.length,'запись','записи','записей')}`;
    $('catalogResults').innerHTML = list.length ? `<div class="story-grid">${list.map(storyCard).join('')}</div>` : emptyState('Здесь пока тихо.', 'По этому запросу ничего не нашлось. Попробуй другое слово или сбрось фильтры.', 'сбросить фильтры');
  }
  function savedPage() {
    const list = entries.filter(e => saved.has(e.key));
    return `<div class="page-heading"><a class="breadcrumb" href="#/">архив <span>/</span> избранное</a><div class="eyebrow">kept close to heart</div><h1>избранное<i>.</i></h1><p>Истории, к которым хочется вернуться. Всё бережно сохранено здесь.</p></div><div class="results-line"><span>${list.length} ${plural(list.length,'запись','записи','записей')}</span><span>saved for later ♡</span></div>${list.length ? `<div class="story-grid">${list.map(storyCard).join('')}</div><p class="local-note">Избранное сохраняется в этом браузере.</p>` : emptyState('Место для любимого.', 'Нажми на закладку у любой истории — и она появится здесь.')}`;
  }
  function detail(entry) {
    const {section,item} = entry;
    const chapters = item.chapters || [];
    const done = progress(entry);
    const next = chapters.findIndex((c,n) => safeUrl(c.url) && !read.has(chapterKey(entry,c,n)));
    const first = next >= 0 ? chapters[next] : chapters.find(c => safeUrl(c.url));
    const primaryUrl = safeUrl(first?.url || item.url);
    return `<a class="back-link" href="#${catalogPath(section.id)}"><span>←</span> ${esc(section.label)}</a><div class="detail-top"><div class="detail-title"><div class="eyebrow">FILE ${esc(section.number)} / ${esc(item.kind)}</div><h1>${esc(item.title)}<i>.</i></h1>${badge(item)}<p class="description">${esc(item.description)}</p><div class="detail-actions">${primaryUrl ? `<a class="button button-red" href="${esc(primaryUrl)}" target="_blank" rel="noopener noreferrer" data-open="${esc(primaryUrl)}">${done && next >= 0 ? 'продолжить читать' : 'читать в Telegram'} <span>↗</span></a>` : '<span class="soon-label"><span class="live-dot"></span> публикации скоро появятся</span>'}<button class="button button-outline save-detail ${saved.has(entry.key) ? 'is-saved' : ''}" data-action="save" data-key="${esc(entry.key)}" aria-pressed="${saved.has(entry.key)}">${icons.bookmark}<span>${saved.has(entry.key) ? 'сохранено' : 'сохранить'}</span></button></div></div><div class="detail-art art-${esc(section.id)}" aria-hidden="true">${photo(coverFor(entry))}<span class="detail-art-sticker">${channelEmoji(emojiNames[section.id])}</span></div></div>
    ${chapters.length ? `<section class="chapters-section"><div class="section-heading"><div><span class="eyebrow">one page at a time</span><h2>${section.id === 'au' ? 'Части AU' : 'Содержание'}</h2></div><span class="chapter-counter">${done} / ${chapters.length} прочитано</span></div><div class="reading-progress" role="progressbar" aria-label="Прочитанные части" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${chapters.length}"><span style="width:${Math.round(done/chapters.length*100)}%"></span></div><div class="chapter-list">${chapters.map((chapter,n) => {
      const url = safeUrl(chapter.url);
      const isRead = read.has(chapterKey(entry,chapter,n));
      const title = section.id === 'au' ? `pt. ${String(n+1).padStart(2,'0')}${chapter.title && !/^(pt\.?|part|episode|часть)\s*\d+$/i.test(chapter.title) ? ' — '+chapter.title : ''}` : chapter.title || `chapter ${String(n+1).padStart(2,'0')}`;
      const label = `<span class="chapter-number">${String(n+1).padStart(2,'0')}</span><span class="chapter-title">${esc(title)}<small>${isRead ? 'прочитано' : url ? 'открыть в Telegram' : 'скоро в архиве'}</small></span><span class="chapter-arrow">${url ? '↗' : 'скоро'}</span>`;
      return `<div class="chapter-row ${isRead ? 'chapter-read' : ''}">${url ? `<a class="chapter-link" href="${esc(url)}" data-open="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : `<div class="chapter-link chapter-unavailable" aria-disabled="true">${label}</div>`}<button class="read-button ${isRead ? 'is-read' : ''}" data-action="read" data-key="${esc(entry.key)}" data-chapter="${n}" aria-label="${isRead ? 'Убрать отметку о прочтении' : 'Отметить как прочитанное'}: ${esc(title)}" aria-pressed="${isRead}" ${url ? '' : 'disabled'}>${icons.check}</button></div>`;
    }).join('')}</div><p class="local-note">${chapters.some(c => safeUrl(c.url)) ? 'Отмечай прочитанные части галочкой справа. Прогресс сохранится в этом браузере.' : 'Ссылки на части ещё не добавлены. Когда они появятся, здесь можно будет открыть каждую публикацию.'}</p></section>` : !primaryUrl ? '<div class="demo-inline"><span>⌞</span><p>Эта запись пока ждёт свою публикацию. Загляни чуть позже.</p></div>' : ''}
    ${data.demo ? '<div class="demo-inline"><span>i</span><p>Это демонстрационная запись из первой версии архива. Настоящие названия, описания и ссылки можно добавить при наполнении.</p></div>' : ''}<div class="detail-footer"><span>some stories feel like home.</span><a class="text-link" href="#/catalog">другие истории <span>↗</span></a></div>`;
  }

  function updateNavigation(active, sectionId) {
    document.querySelectorAll('[data-nav]').forEach(el => {
      const value = el.dataset.nav;
      const selected = value === active || (active === 'catalog' && value === 'section-' + sectionId);
      el.classList.toggle('active', selected);
      if (selected) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    $('savedCount').textContent = String(saved.size);
  }
  function render() {
    const {parts,params} = route();
    let active = 'home';
    let sectionId;
    let title = 'архив историй';
    if (!parts.length) root.innerHTML = home();
    else if (parts[0] === 'catalog' && parts.length === 1) {
      root.innerHTML = catalog(params); paintResults(); active = 'catalog'; sectionId = filterState.section;
      title = data.sections.find(s => s.id === sectionId)?.label || 'все истории';
    } else if (parts[0] === 'saved' && parts.length === 1) {
      root.innerHTML = savedPage(); active = 'saved'; title = 'избранное';
    } else {
      const legacy = data.sections.find(s => s.id === parts[0]);
      if (legacy && parts.length === 1) { go(catalogPath(legacy.id)); return; }
      const entry = entries.find(e => parts[0] === 'story' && parts.length === 3 ? e.key === parts.slice(1).join('/') : legacy && parts.length === 2 ? e.key === parts.join('/') : false);
      if (entry) { root.innerHTML = detail(entry); active = 'catalog'; sectionId = entry.section.id; title = entry.item.title; }
      else root.innerHTML = `<div class="page-heading"><div class="eyebrow">file not found / 404</div></div>${emptyState('Эта страница потерялась.', 'Возможно, ссылка изменилась. Все истории по-прежнему в архиве.', 'на главную', '/')}`;
    }
    document.title = `${title} — ${data.title || 'dbt.yu'}`;
    updateNavigation(active,sectionId);
    if (tg?.BackButton) tgCall(() => parts.length ? tg.BackButton.show() : tg.BackButton.hide());
    window.scrollTo({top:0, behavior:'instant'});
  }
  function handleBack() {
    const {parts,params} = route();
    if (parts[0] === 'story') go(catalogPath(parts[1]));
    else if (parts[0] === 'catalog' && params.get('section')) go('/catalog');
    else go('/');
  }
  function updateSearch(value) {
    filterState.q = value;
    history.replaceState(null,'','#' + catalogPath(filterState.section,value,filterState.status));
    const clear = document.querySelector('.clear-search');
    if (clear) clear.hidden = !value;
    document.querySelectorAll('.filter-chip').forEach(link => {
      const u = new URLSearchParams(link.getAttribute('href').split('?')[1] || '');
      link.setAttribute('href','#' + catalogPath(u.get('section') || 'all',value,filterState.status));
    });
    paintResults();
  }
  function searchFocus() {
    if (route().parts[0] !== 'catalog') { history.pushState(null,'','#/catalog'); render(); }
    $('archiveSearch')?.focus();
  }
  function updateFavoriteButtons(key) {
    const entry = entries.find(e => e.key === key);
    document.querySelectorAll('[data-action="save"]').forEach(button => {
      if (button.dataset.key !== key) return;
      const selected = saved.has(key);
      button.classList.toggle('is-saved',selected);
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',`${selected ? 'Убрать из избранного' : 'В избранное'}: ${entry.item.title}`);
      if (button.classList.contains('save-detail')) button.innerHTML = icons.bookmark + `<span>${selected ? 'сохранено' : 'сохранить'}</span>`;
    });
    $('savedCount').textContent = String(saved.size);
  }

  document.addEventListener('click', event => {
    const open = event.target.closest('[data-open]');
    if (open && tg) {
      const url = safeUrl(open.dataset.open);
      if (!url) { event.preventDefault(); return; }
      const u = new URL(url);
      const telegram = u.hostname === 't.me' || u.hostname === 'telegram.me';
      const method = telegram && tg.openTelegramLink ? 'openTelegramLink' : 'openLink';
      if (typeof tg[method] === 'function') {
        try { tg[method](url); event.preventDefault(); } catch { /* use the ordinary anchor */ }
      }
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'skip') { root.focus(); root.scrollIntoView?.({block:'start',behavior:'instant'}); }
    if (action === 'search') searchFocus();
    if (action === 'about') { if (typeof $('aboutDialog').showModal === 'function') $('aboutDialog').showModal(); else $('aboutDialog').setAttribute('open',''); }
    if (action === 'close-about') { if (typeof $('aboutDialog').close === 'function') $('aboutDialog').close(); else $('aboutDialog').removeAttribute('open'); }
    if (action === 'clear-search') { $('archiveSearch').value = ''; updateSearch(''); $('archiveSearch').focus(); }
    if (action === 'save') {
      const key = button.dataset.key;
      if (!entries.some(e => e.key === key)) return;
      if (saved.has(key)) saved.delete(key); else saved.add(key);
      const persisted = persist('dbtyu.saved.v2',saved);
      tgCall(() => tg?.HapticFeedback?.selectionChanged());
      if (route().parts[0] === 'saved') render(); else updateFavoriteButtons(key);
      if (persisted) toast(saved.has(key) ? 'История сохранена ♡' : 'История убрана из избранного');
    }
    if (action === 'read' && !button.disabled) {
      const entry = entries.find(e => e.key === button.dataset.key);
      const n = Number(button.dataset.chapter);
      const chapter = entry?.item.chapters?.[n];
      if (!chapter || !safeUrl(chapter.url)) return;
      const key = chapterKey(entry,chapter,n);
      if (read.has(key)) read.delete(key); else read.add(key);
      persist('dbtyu.read.v2',read);
      const scroll = window.scrollY;
      render();
      window.scrollTo({top:scroll,behavior:'instant'});
      document.querySelectorAll('[data-action="read"]')[n]?.focus({preventScroll:true});
    }
  });
  document.addEventListener('input', event => { if (event.target.id === 'archiveSearch') updateSearch(event.target.value); });
  document.addEventListener('change', event => { if (event.target.id === 'statusFilter') go(catalogPath(filterState.section,filterState.q,event.target.value)); });
  document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchFocus(); } });
  $('aboutDialog').addEventListener('click', event => { if (event.target === $('aboutDialog')) { const r = $('aboutDialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('aboutDialog').close(); } });
  $('sideNav').innerHTML = `<a class="side-link" data-nav="home" href="#/"><span class="nav-symbol">⌂</span><span>главная</span></a><a class="side-link" data-nav="catalog" href="#/catalog"><span class="nav-symbol">≡</span><span>весь архив</span></a><div class="sidebar-divider"></div>${data.sections.map(s => `<a class="side-link" data-nav="section-${esc(s.id)}" href="#${catalogPath(s.id)}"><span class="nav-number">${esc(s.number)}</span><span>${esc(s.label)}</span><span class="nav-count">${(s.items || []).length}</span></a>`).join('')}`;
  $('demoBadge').hidden = !data.demo;
  $('aboutDemo').hidden = !data.demo;
  $('footerTitle').textContent = data.title || 'dbt.yu';
  const channel = safeUrl(data.channelUrl);
  if (channel) { $('channelLink').hidden = false; $('channelLink').href = channel; $('channelLink').dataset.open = channel; }
  window.addEventListener('hashchange',render);
  render();
})();
