'use strict';

/* ==========================================================================
   Data Dragon (Riot's static data)
   - Uses the newest patch version automatically, so new champions/items/runes
     appear and removed ones disappear without editing this file.
   - FALLBACK_VERSION is only used if Riot's version list can't be reached.
   ========================================================================== */
const CDN = 'https://ddragon.leagueoflegends.com';
const FALLBACK_VERSION = '16.21.1';
let DATA_VERSION = FALLBACK_VERSION;
let versionList = [FALLBACK_VERSION];

const versionReady = fetch(`${CDN}/api/versions.json`)
  .then(res => res.json())
  .then(list => {
    if (Array.isArray(list) && list.length) {
      versionList = list.slice(0, 3); // newest first; older ones are backups
      DATA_VERSION = list[0];
    }
  })
  .catch(() => {});

// Fetch a Data Dragon JSON file, trying the newest version first
async function fetchDragon(path) {
  await versionReady;
  for (const version of versionList) {
    try {
      const res = await fetch(`${CDN}/cdn/${version}/${path}`);
      if (res.ok) {
        DATA_VERSION = version;
        return await res.json();
      }
    } catch (_) { /* try the next version */ }
  }
  throw new Error('Could not load data from Data Dragon');
}

/* ==========================================================================
   Small helpers
   ========================================================================== */
const $ = id => document.getElementById(id);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

function debounce(fn, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Runs an async loader only once; callers that arrive meanwhile share the same promise.
// If loading failed (nothing loaded), the next call tries again.
function once(loader, isLoaded) {
  let promise = null;
  return () => {
    if (!promise) {
      promise = loader().finally(() => {
        if (!isLoaded()) promise = null;
      });
    }
    return promise;
  };
}

const loadingHtml = label => `
  <div class="loading" style="grid-column: 1 / -1;">
    <div class="spinner"></div>
    ${label}
  </div>`;

const messageHtml = (text, isError = false) =>
  `<div class="grid-message${isError ? ' error' : ''}">${text}</div>`;

// One click/keyboard listener per grid instead of one per card
function onCardActivate(gridId, attribute, handler) {
  const grid = $(gridId);
  if (!grid) return;
  const findCard = e => e.target.closest(`[${attribute}]`);

  grid.addEventListener('click', e => {
    const card = findCard(e);
    if (card) handler(card.getAttribute(attribute));
  });
  grid.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = findCard(e);
    if (card) {
      e.preventDefault();
      handler(card.getAttribute(attribute));
    }
  });
}

/* ==========================================================================
   Modals
   ========================================================================== */
let lastFocusedBeforeModal = null;

function openModal(id) {
  const modal = $(id);
  lastFocusedBeforeModal = document.activeElement || null;
  modal.style.display = 'block';
  modal.setAttribute('aria-hidden', 'false');
  const closeButton = modal.querySelector && modal.querySelector('button');
  if (closeButton) closeButton.focus();   // keyboard users land inside the popup
}

function closeModal(modal) {
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  if (lastFocusedBeforeModal && lastFocusedBeforeModal.focus && document.contains(lastFocusedBeforeModal)) {
    lastFocusedBeforeModal.focus();       // ...and go back to where they were
  }
  lastFocusedBeforeModal = null;
}

function initModals() {
  const pairs = [['modal-close', 'champion-modal'], ['item-modal-close', 'item-modal'], ['skin-modal-close', 'skin-modal']];
  pairs.forEach(([buttonId, modalId]) => {
    const button = $(buttonId);
    if (button) button.addEventListener('click', () => closeModal($(modalId)));
  });

  // Click on the dark backdrop closes the modal
  window.addEventListener('click', e => {
    if (e.target.classList && e.target.classList.contains('modal')) closeModal(e.target);
  });

  // Escape closes any open modal
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal').forEach(modal => {
      if (modal.style.display === 'block') closeModal(modal);
    });
  });
}

/* ==========================================================================
   Champions
   ========================================================================== */
let champions = [];
let filteredChampions = [];

const DIFFICULTY_NAMES = { 1: 'Easy', 2: 'Moderate', 3: 'Hard' };

// Manual overrides by champion id: 1 = Easy, 2 = Moderate, 3 = Hard
const DIFFICULTY_OVERRIDES = { Viego: 3 };

// Riot rates every champion's difficulty from 1 to 10 in its own data.
// 1-3 = Easy, 4-7 = Moderate, 8-10 = Hard (same buckets Riot uses in-game).
function difficultyLevel(score) {
  if (score <= 3) return 1;
  if (score <= 7) return 2;
  return 3;
}

async function fetchChampions() {
  try {
    $('champion-grid').innerHTML = loadingHtml('Loading champions...');
    const data = await fetchDragon('data/en_US/champion.json');

    champions = Object.values(data.data)
      .map(champion => ({
        id: champion.id,
        name: champion.name,
        title: champion.title,
        tags: champion.tags,
        attack: Number(champion.info && champion.info.attack) || 0,
        magic: Number(champion.info && champion.info.magic) || 0,
        difficultyScore: Number(champion.info && champion.info.difficulty) || 0,
        difficulty: DIFFICULTY_OVERRIDES[champion.id] || difficultyLevel(Number(champion.info && champion.info.difficulty) || 5),
        image: `${CDN}/cdn/${DATA_VERSION}/img/champion/${champion.image.full}`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    applyFilters();
  } catch (error) {
    console.error('Error loading champions:', error);
    $('champion-grid').innerHTML = messageHtml('Failed to load champion data. Please try again later.', true);
  }
}

const loadChampions = once(fetchChampions, () => champions.length > 0);

function renderChampions() {
  const grid = $('champion-grid');

  if (filteredChampions.length === 0) {
    grid.innerHTML = messageHtml('No champions found matching your filters.');
    return;
  }

  grid.innerHTML = filteredChampions.map(champion => `
    <div class="champion" tabindex="0" data-champion="${escapeHtml(champion.id)}">
      <img src="${champion.image}" alt="${escapeHtml(champion.name)}" width="120" height="120" loading="lazy" decoding="async" />
      <div class="champion-info">
        <div class="champion-name">${escapeHtml(champion.name)}</div>
        <div class="champion-tags">${champion.tags.join(' • ')} | ${DIFFICULTY_NAMES[champion.difficulty]}</div>
      </div>
    </div>
  `).join('');
}

function applyFilters() {
  if (!champions.length) return;   // still loading (or failed): keep the loading/error message
  const classFilter = $('class-filter').value;
  const difficultyFilter = $('difficulty-filter').value;
  const searchTerm = $('search').value.trim().toLowerCase();

  filteredChampions = champions.filter(champion =>
    (!classFilter || champion.tags.includes(classFilter)) &&
    (!difficultyFilter || champion.difficulty === parseInt(difficultyFilter, 10)) &&
    (!searchTerm || champion.name.toLowerCase().includes(searchTerm))
  );

  renderChampions();
}

/* ---- Champion details modal ---- */

// Mapping from tags to recommended positions (can be customized)
const tagToPositions = {
  Assassin: 'Mid, Jungle',
  Fighter: 'Top, Jungle',
  Mage: 'Mid, Support',
  Marksman: 'ADC',
  Support: 'Support',
  Tank: 'Top, Support, Jungle'
};

// Ignore capitals, spaces and punctuation so "Kai'Sa" and "Kaisa" match
const normalizeName = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// Main (most played) position per champion, from general knowledge of the solo-queue
// meta. Edit freely: 'Champion': 'Top' | 'Jungle' | 'Mid' | 'ADC' | 'Support'
// Champions missing here fall back to a guess based on their class (tagToPositions).
const MAIN_POSITIONS = {
  'Aatrox': 'Top',
  'Ambessa': 'Top',
  'Camille': 'Top',
  'Cho\'Gath': 'Top',
  'Darius': 'Top',
  'Dr. Mundo': 'Top',
  'Fiora': 'Top',
  'Gangplank': 'Top',
  'Garen': 'Top',
  'Gnar': 'Top',
  'Gwen': 'Top',
  'Illaoi': 'Top',
  'Irelia': 'Top',
  'Jax': 'Top',
  'Jayce': 'Top',
  'K\'Sante': 'Top',
  'Kayle': 'Top',
  'Kennen': 'Top',
  'Kled': 'Top',
  'Malphite': 'Top',
  'Mordekaiser': 'Top',
  'Nasus': 'Top',
  'Ornn': 'Top',
  'Poppy': 'Top',
  'Quinn': 'Top',
  'Renekton': 'Top',
  'Riven': 'Top',
  'Rumble': 'Top',
  'Sett': 'Top',
  'Shen': 'Top',
  'Singed': 'Top',
  'Sion': 'Top',
  'Teemo': 'Top',
  'Tryndamere': 'Top',
  'Urgot': 'Top',
  'Volibear': 'Top',
  'Yorick': 'Top',
  'Amumu': 'Jungle',
  'Bel\'Veth': 'Jungle',
  'Briar': 'Jungle',
  'Diana': 'Jungle',
  'Ekko': 'Jungle',
  'Elise': 'Jungle',
  'Evelynn': 'Jungle',
  'Fiddlesticks': 'Jungle',
  'Gragas': 'Jungle',
  'Graves': 'Jungle',
  'Hecarim': 'Jungle',
  'Ivern': 'Jungle',
  'Jarvan IV': 'Jungle',
  'Karthus': 'Jungle',
  'Kayn': 'Jungle',
  'Kha\'Zix': 'Jungle',
  'Kindred': 'Jungle',
  'Lee Sin': 'Jungle',
  'Lillia': 'Jungle',
  'Master Yi': 'Jungle',
  'Nidalee': 'Jungle',
  'Nocturne': 'Jungle',
  'Nunu & Willump': 'Jungle',
  'Olaf': 'Jungle',
  'Rammus': 'Jungle',
  'Rek\'Sai': 'Jungle',
  'Rengar': 'Jungle',
  'Sejuani': 'Jungle',
  'Shaco': 'Jungle',
  'Shyvana': 'Jungle',
  'Skarner': 'Jungle',
  'Trundle': 'Jungle',
  'Udyr': 'Jungle',
  'Vi': 'Jungle',
  'Viego': 'Jungle',
  'Warwick': 'Jungle',
  'Wukong': 'Jungle',
  'Xin Zhao': 'Jungle',
  'Zac': 'Jungle',
  'Ahri': 'Mid',
  'Akali': 'Mid',
  'Akshan': 'Mid',
  'Anivia': 'Mid',
  'Annie': 'Mid',
  'Aurelion Sol': 'Mid',
  'Aurora': 'Mid',
  'Azir': 'Mid',
  'Cassiopeia': 'Mid',
  'Corki': 'Mid',
  'Fizz': 'Mid',
  'Galio': 'Mid',
  'Heimerdinger': 'Mid',
  'Hwei': 'Mid',
  'Kassadin': 'Mid',
  'Katarina': 'Mid',
  'LeBlanc': 'Mid',
  'Lissandra': 'Mid',
  'Malzahar': 'Mid',
  'Mel': 'Mid',
  'Naafiri': 'Mid',
  'Neeko': 'Mid',
  'Orianna': 'Mid',
  'Qiyana': 'Mid',
  'Ryze': 'Mid',
  'Sylas': 'Mid',
  'Syndra': 'Mid',
  'Taliyah': 'Mid',
  'Talon': 'Mid',
  'Twisted Fate': 'Mid',
  'Veigar': 'Mid',
  'Vex': 'Mid',
  'Viktor': 'Mid',
  'Vladimir': 'Mid',
  'Yasuo': 'Mid',
  'Yone': 'Mid',
  'Zed': 'Mid',
  'Ziggs': 'Mid',
  'Zoe': 'Mid',
  'Aphelios': 'ADC',
  'Ashe': 'ADC',
  'Caitlyn': 'ADC',
  'Draven': 'ADC',
  'Ezreal': 'ADC',
  'Jhin': 'ADC',
  'Jinx': 'ADC',
  'Kai\'Sa': 'ADC',
  'Kalista': 'ADC',
  'Kog\'Maw': 'ADC',
  'Lucian': 'ADC',
  'Miss Fortune': 'ADC',
  'Nilah': 'ADC',
  'Samira': 'ADC',
  'Sivir': 'ADC',
  'Smolder': 'ADC',
  'Tristana': 'ADC',
  'Twitch': 'ADC',
  'Varus': 'ADC',
  'Vayne': 'ADC',
  'Xayah': 'ADC',
  'Yunara': 'ADC',
  'Zeri': 'ADC',
  'Alistar': 'Support',
  'Bard': 'Support',
  'Blitzcrank': 'Support',
  'Brand': 'Support',
  'Braum': 'Support',
  'Janna': 'Support',
  'Karma': 'Support',
  'Leona': 'Support',
  'Lulu': 'Support',
  'Lux': 'Support',
  'Maokai': 'Support',
  'Milio': 'Support',
  'Morgana': 'Support',
  'Nami': 'Support',
  'Nautilus': 'Support',
  'Pantheon': 'Support',
  'Pyke': 'Support',
  'Rakan': 'Support',
  'Rell': 'Support',
  'Renata Glasc': 'Support',
  'Senna': 'Support',
  'Seraphine': 'Support',
  'Sona': 'Support',
  'Soraka': 'Support',
  'Swain': 'Support',
  'Tahm Kench': 'Support',
  'Taric': 'Support',
  'Thresh': 'Support',
  'Vel\'Koz': 'Support',
  'Xerath': 'Support',
  'Yuumi': 'Support',
  'Zilean': 'Support',
  'Zyra': 'Support'
};

// Biggest counters per champion (general matchup knowledge, not live stats).
// Counters change by role and patch, so treat these as a starting point.
// Add or edit lines freely: "Champion": ["Counter 1", "Counter 2", "Counter 3"]
const COUNTERS = {
  'Aatrox': ['Fiora', 'Jax', 'Gwen'],
  'Ahri': ['Sylas', 'Fizz', 'Zed'],
  'Akali': ['Pantheon', 'Vex', 'Galio'],
  'Akshan': ['Fizz', 'Sylas', 'Malzahar'],
  'Alistar': ['Morgana', 'Janna', 'Lulu'],
  'Ambessa': ['Fiora', 'Gwen', 'Malphite'],
  'Amumu': ['Graves', 'Kindred', 'Shyvana'],
  'Anivia': ['Zed', 'Fizz', 'Yasuo'],
  'Annie': ['Yasuo', 'Zed', 'Kassadin'],
  'Aphelios': ['Draven', 'Lucian', 'Caitlyn'],
  'Ashe': ['Draven', 'Lucian', 'Samira'],
  'Aurelion Sol': ['Fizz', 'Zed', 'Talon'],
  'Azir': ['Fizz', 'Zed', 'Kassadin'],
  'Bard': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Blitzcrank': ['Morgana', 'Janna', 'Braum'],
  'Brand': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Braum': ['Zyra', 'Brand', 'Xerath'],
  'Caitlyn': ['Draven', 'Lucian', 'Kai\'Sa'],
  'Camille': ['Malphite', 'Teemo', 'Illaoi'],
  'Cassiopeia': ['Yasuo', 'Fizz', 'Zed'],
  'Cho\'Gath': ['Vayne', 'Fiora', 'Kayle'],
  'Corki': ['Zed', 'Fizz', 'Talon'],
  'Darius': ['Quinn', 'Vayne', 'Teemo'],
  'Diana': ['Fizz', 'Kassadin', 'Zed'],
  'Dr. Mundo': ['Jax', 'Quinn', 'Vayne'],
  'Draven': ['Caitlyn', 'Varus', 'Ashe'],
  'Ekko': ['Zed', 'Fizz', 'Pantheon'],
  'Elise': ['Lee Sin', 'Jarvan IV', 'Xin Zhao'],
  'Evelynn': ['Rek\'Sai', 'Xin Zhao', 'Udyr'],
  'Ezreal': ['Draven', 'Kai\'Sa', 'Caitlyn'],
  'Fiddlesticks': ['Lee Sin', 'Nocturne', 'Xin Zhao'],
  'Fiora': ['Malphite', 'Teemo', 'Quinn'],
  'Fizz': ['Malzahar', 'Galio', 'Lissandra'],
  'Galio': ['Fizz', 'Kassadin', 'Zed'],
  'Gangplank': ['Quinn', 'Vayne', 'Jayce'],
  'Garen': ['Teemo', 'Quinn', 'Vayne'],
  'Gnar': ['Kayle', 'Jayce', 'Vayne'],
  'Gragas': ['Rek\'Sai', 'Jarvan IV', 'Pantheon'],
  'Graves': ['Rammus', 'Nocturne', 'Elise'],
  'Gwen': ['Vayne', 'Quinn', 'Garen'],
  'Hecarim': ['Rammus', 'Nocturne', 'Graves'],
  'Heimerdinger': ['Zed', 'Fizz', 'Yasuo'],
  'Hwei': ['Zed', 'Fizz', 'Yasuo'],
  'Illaoi': ['Quinn', 'Vayne', 'Jayce'],
  'Irelia': ['Garen', 'Jayce', 'Quinn'],
  'Ivern': ['Nocturne', 'Kayn', 'Rek\'Sai'],
  'Janna': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Jarvan IV': ['Rammus', 'Nocturne', 'Warwick'],
  'Jax': ['Teemo', 'Quinn', 'Garen'],
  'Jayce': ['Quinn', 'Malphite', 'Teemo'],
  'Jhin': ['Draven', 'Lucian', 'Samira'],
  'Jinx': ['Draven', 'Lucian', 'Tristana'],
  'K\'Sante': ['Gwen', 'Fiora', 'Vayne'],
  'Kai\'Sa': ['Draven', 'Caitlyn', 'Lucian'],
  'Kalista': ['Draven', 'Caitlyn', 'Samira'],
  'Karma': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Karthus': ['Lee Sin', 'Rek\'Sai', 'Elise'],
  'Kassadin': ['Zed', 'Talon', 'Fizz'],
  'Katarina': ['Malzahar', 'Galio', 'Lissandra'],
  'Kayle': ['Darius', 'Fiora', 'Irelia'],
  'Kayn': ['Rammus', 'Lee Sin', 'Nocturne'],
  'Kennen': ['Darius', 'Garen', 'Quinn'],
  'Kha\'Zix': ['Lee Sin', 'Rammus', 'Pantheon'],
  'Kindred': ['Rek\'Sai', 'Lee Sin', 'Elise'],
  'Kled': ['Quinn', 'Vayne', 'Kayle'],
  'Kog\'Maw': ['Draven', 'Lucian', 'Samira'],
  'LeBlanc': ['Malzahar', 'Galio', 'Vex'],
  'Lee Sin': ['Rammus', 'Nocturne', 'Kayn'],
  'Leona': ['Morgana', 'Janna', 'Lulu'],
  'Lillia': ['Rammus', 'Nocturne', 'Graves'],
  'Lissandra': ['Fizz', 'Yasuo', 'Cassiopeia'],
  'Lucian': ['Draven', 'Caitlyn', 'Jhin'],
  'Lulu': ['Blitzcrank', 'Pyke', 'Nautilus'],
  'Lux': ['Zed', 'Fizz', 'Yasuo'],
  'Malphite': ['Vayne', 'Quinn', 'Mordekaiser'],
  'Malzahar': ['Zed', 'Fizz', 'Yone'],
  'Maokai': ['Vayne', 'Kayle', 'Quinn'],
  'Master Yi': ['Rammus', 'Nocturne', 'Warwick'],
  'Milio': ['Blitzcrank', 'Pyke', 'Nautilus'],
  'Miss Fortune': ['Draven', 'Lucian', 'Kai\'Sa'],
  'Mordekaiser': ['Vayne', 'Quinn', 'Kayle'],
  'Morgana': ['Zyra', 'Xerath', 'Brand'],
  'Nami': ['Blitzcrank', 'Pyke', 'Nautilus'],
  'Nasus': ['Quinn', 'Teemo', 'Vayne'],
  'Nautilus': ['Morgana', 'Janna', 'Lulu'],
  'Neeko': ['Zed', 'Fizz', 'Yasuo'],
  'Nidalee': ['Rek\'Sai', 'Lee Sin', 'Elise'],
  'Nilah': ['Draven', 'Caitlyn', 'Ashe'],
  'Nocturne': ['Lee Sin', 'Elise', 'Rek\'Sai'],
  'Nunu & Willump': ['Graves', 'Rek\'Sai', 'Lee Sin'],
  'Olaf': ['Rammus', 'Elise', 'Lee Sin'],
  'Orianna': ['Zed', 'Fizz', 'Yasuo'],
  'Ornn': ['Vayne', 'Quinn', 'Kayle'],
  'Pantheon': ['Vayne', 'Quinn', 'Malphite'],
  'Poppy': ['Vayne', 'Quinn', 'Kayle'],
  'Pyke': ['Morgana', 'Janna', 'Braum'],
  'Qiyana': ['Fizz', 'Malzahar', 'Galio'],
  'Quinn': ['Kayle', 'Jayce', 'Gnar'],
  'Rakan': ['Blitzcrank', 'Pyke', 'Nautilus'],
  'Rammus': ['Elise', 'Nidalee', 'Karthus'],
  'Rek\'Sai': ['Rammus', 'Nocturne', 'Elise'],
  'Rell': ['Morgana', 'Janna', 'Lulu'],
  'Renata Glasc': ['Blitzcrank', 'Pyke', 'Nautilus'],
  'Renekton': ['Quinn', 'Teemo', 'Vayne'],
  'Rengar': ['Rammus', 'Nocturne', 'Warwick'],
  'Riven': ['Quinn', 'Garen', 'Teemo'],
  'Rumble': ['Vayne', 'Quinn', 'Kayle'],
  'Ryze': ['Zed', 'Fizz', 'Kassadin'],
  'Samira': ['Draven', 'Caitlyn', 'Jhin'],
  'Sejuani': ['Elise', 'Rek\'Sai', 'Lee Sin'],
  'Senna': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Seraphine': ['Blitzcrank', 'Pyke', 'Nautilus'],
  'Sett': ['Vayne', 'Quinn', 'Gnar'],
  'Shaco': ['Rammus', 'Warwick', 'Lee Sin'],
  'Shen': ['Vayne', 'Quinn', 'Kayle'],
  'Shyvana': ['Rammus', 'Nocturne', 'Elise'],
  'Singed': ['Quinn', 'Teemo', 'Vayne'],
  'Sion': ['Vayne', 'Quinn', 'Kayle'],
  'Sivir': ['Draven', 'Lucian', 'Samira'],
  'Skarner': ['Lee Sin', 'Elise', 'Jarvan IV'],
  'Smolder': ['Draven', 'Caitlyn', 'Lucian'],
  'Sona': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Soraka': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Swain': ['Zed', 'Fizz', 'Yasuo'],
  'Sylas': ['Malzahar', 'Galio', 'Vex'],
  'Syndra': ['Fizz', 'Zed', 'Yasuo'],
  'Tahm Kench': ['Zyra', 'Brand', 'Xerath'],
  'Taliyah': ['Fizz', 'Zed', 'Kassadin'],
  'Talon': ['Malzahar', 'Galio', 'Lissandra'],
  'Taric': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Teemo': ['Kayle', 'Quinn', 'Gnar'],
  'Thresh': ['Morgana', 'Janna', 'Lulu'],
  'Tristana': ['Caitlyn', 'Draven', 'Ashe'],
  'Trundle': ['Elise', 'Rek\'Sai', 'Lee Sin'],
  'Tryndamere': ['Malphite', 'Teemo', 'Quinn'],
  'Twisted Fate': ['Fizz', 'Zed', 'Kassadin'],
  'Twitch': ['Draven', 'Caitlyn', 'Samira'],
  'Udyr': ['Elise', 'Rek\'Sai', 'Lee Sin'],
  'Urgot': ['Quinn', 'Teemo', 'Vayne'],
  'Varus': ['Draven', 'Lucian', 'Caitlyn'],
  'Vayne': ['Draven', 'Caitlyn', 'Lucian'],
  'Veigar': ['Zed', 'Fizz', 'Kassadin'],
  'Vel\'Koz': ['Zed', 'Fizz', 'Yasuo'],
  'Vex': ['Syndra', 'Viktor', 'Orianna'],
  'Vi': ['Rammus', 'Nocturne', 'Elise'],
  'Viego': ['Rammus', 'Nocturne', 'Warwick'],
  'Viktor': ['Fizz', 'Zed', 'Yasuo'],
  'Vladimir': ['Quinn', 'Fizz', 'Kassadin'],
  'Volibear': ['Vayne', 'Quinn', 'Teemo'],
  'Warwick': ['Rammus', 'Nocturne', 'Elise'],
  'Wukong': ['Vayne', 'Quinn', 'Kayle'],
  'Xayah': ['Draven', 'Caitlyn', 'Ashe'],
  'Xerath': ['Fizz', 'Zed', 'Yasuo'],
  'Xin Zhao': ['Rammus', 'Nocturne', 'Warwick'],
  'Yasuo': ['Malzahar', 'Renekton', 'Pantheon'],
  'Yone': ['Malzahar', 'Renekton', 'Pantheon'],
  'Yorick': ['Quinn', 'Vayne', 'Kayle'],
  'Yuumi': ['Blitzcrank', 'Nautilus', 'Pyke'],
  'Zac': ['Graves', 'Elise', 'Lee Sin'],
  'Zed': ['Lissandra', 'Malzahar', 'Vex'],
  'Zeri': ['Draven', 'Lucian', 'Caitlyn'],
  'Ziggs': ['Zed', 'Fizz', 'Yasuo'],
  'Zilean': ['Zed', 'Fizz', 'Yasuo'],
  'Zoe': ['Malzahar', 'Galio', 'Lissandra'],
  'Zyra': ['Blitzcrank', 'Nautilus', 'Pyke']
};

const COUNTERS_BY_KEY = Object.fromEntries(
  Object.entries(COUNTERS).map(([name, list]) => [normalizeName(name), list])
);
const POSITIONS_BY_KEY = Object.fromEntries(
  Object.entries(MAIN_POSITIONS).map(([name, role]) => [normalizeName(name), role])
);

const championDetailsCache = new Map();

async function getChampionDetails(championId) {
  let champ = championDetailsCache.get(championId);
  if (!champ) {
    const data = await fetchDragon(`data/en_US/champion/${championId}.json`);
    champ = data.data[championId];
    championDetailsCache.set(championId, champ);
  }
  return champ;
}

async function showChampionDetails(championId) {
  try {
    const champ = await getChampionDetails(championId);

    $('champion-modal-title').textContent = champ.name;
    $('champion-modal-subtitle').textContent = champ.title;
    const image = $('champion-modal-image');
    image.src = `${CDN}/cdn/${DATA_VERSION}/img/champion/${champ.image.full}`;
    image.alt = champ.name;
    $('champion-modal-lore').textContent = champ.lore;

    const mainPosition = POSITIONS_BY_KEY[normalizeName(champ.name)];
    const guessedPositions = champ.tags.map(tag => tagToPositions[tag]).filter(Boolean);
    $('champion-modal-positions').textContent =
      mainPosition || (guessedPositions.length ? guessedPositions.join(', ') : 'Various');

    // Biggest counters, written as plain champion names
    const counterList = COUNTERS_BY_KEY[normalizeName(champ.name)] || [];
    const counterItems = counterList.length
      ? counterList.map(name => {
          const li = document.createElement('li');
          li.textContent = name;
          return li;
        })
      : [Object.assign(document.createElement('li'), { textContent: 'No counter info for this champion yet.' })];
    $('champion-modal-counters').replaceChildren(...counterItems);

    // Why this champion is easy or hard
    const diffNotes = DIFFICULTY_BY_KEY[normalizeName(champ.name)];
    $('champion-modal-difficulty-box').hidden = !diffNotes;
    $('champion-modal-difficulty').textContent = diffNotes ? diffNotes.summary : '';

    // Hidden interactions that involve this champion
    const interactions = INTERACTIONS_BY_CHAMPION.get(normalizeName(champ.name)) || [];
    $('champion-modal-interactions-box').hidden = interactions.length === 0;
    $('champion-modal-interactions').innerHTML = interactions
      .map(card => `<li><strong>${escapeHtml(card.title)}:</strong> ${escapeHtml(card.text)}</li>`)
      .join('');

    openModal('champion-modal');
  } catch (error) {
    alert('Could not load champion details. Please try again later.');
    console.error(error);
  }
}

/* ==========================================================================
   Items
   ========================================================================== */
let items = [];
let filteredItems = [];

// Items that exist in the data but aren't part of normal gameplay
const EXCLUDED_ITEM_NAMES = [
  'Poro-Snax', 'Total Biscuit of Everlasting Will', 'Slightly Magical Footware',
  'Magical Footwear', 'Biscuit Delivery', 'Time Warp Tonic', 'Approach Velocity',
  'Perfect Timing', 'Hextech Flashtraption', 'Ghost Poro', 'Eyeball Collection',
  'Zombie Ward', 'Treasure Hunter', 'Ingenious Hunter', 'Relentless Hunter',
  'Ultimate Hunter', 'Presence of Mind', 'Legend: Alacrity', 'Legend: Tenacity',
  'Legend: Bloodline', 'Coup de Grace', 'Cut Down', 'Last Stand'
];

function isPlayableItem(item) {
  if (!item.name || item.name === 'Unknown') return false;
  if (item.inStore === false || item.hideFromAll) return false;      // not sold / hidden by Riot
  if (/removed|placeholder|deprecated|\(test\)/i.test(item.name)) return false;
  if (!item.maps || !item.maps['11']) return false;                 // Summoner's Rift only
  if (!item.gold || item.gold.purchasable === false) return false;  // must be buyable
  if (item.gold.total === 0 && (!item.from || item.from.length === 0)) return false;
  return !EXCLUDED_ITEM_NAMES.some(name => item.name.includes(name));
}

function itemTier(item) {
  if (item.tags.includes('Boots')) return 'Boots';
  if (item.gold > 2500) return 'Legendary';
  if (item.gold > 1000) return 'Epic';
  if (item.gold > 0) return 'Basic';
  return 'Special';
}

async function fetchItems() {
  try {
    $('item-grid').innerHTML = loadingHtml('Loading items...');
    const data = await fetchDragon('data/en_US/item.json');

    items = Object.entries(data.data)
      .filter(([, item]) => isPlayableItem(item))
      .map(([id, item]) => ({
        id,
        name: item.name,
        description: item.description,
        plaintext: item.plaintext,
        image: `${CDN}/cdn/${DATA_VERSION}/img/item/${item.image.full}`,
        gold: (item.gold && item.gold.total) || 0,
        tags: item.tags || []
      }))
      // Riot's data can list the same item twice (old and new version): keep one
      .filter((item, index, all) => all.findIndex(other => other.name === item.name) === index);

    applyItemFilters();
  } catch (error) {
    console.error('Error loading items:', error);
    $('item-grid').innerHTML = messageHtml('Failed to load items. Please try again later.', true);
  }
}

const loadItems = once(fetchItems, () => items.length > 0);

function renderItems() {
  const grid = $('item-grid');

  if (filteredItems.length === 0) {
    grid.innerHTML = messageHtml('No items found matching your filters.');
    return;
  }

  grid.innerHTML = filteredItems.map(item => `
    <div class="champion" tabindex="0" data-item="${escapeHtml(item.id)}">
      <img src="${item.image}" alt="${escapeHtml(item.name)}" width="64" height="64" loading="lazy" decoding="async" />
      <div class="champion-info">
        <div class="champion-name">${escapeHtml(item.name)}</div>
        <div class="champion-tags">${item.gold > 0 ? `${item.gold}g` : 'Free'} | ${itemTier(item)}</div>
      </div>
    </div>
  `).join('');
}

function applyItemFilters() {
  if (!items.length) return;
  const searchTerm = $('item-search').value.trim().toLowerCase();
  const typeFilter = $('availability-filter').value;
  const categoryFilter = $('item-category').value;
  const minPrice = parseInt($('price-min').value, 10) || 0;
  const maxPrice = parseInt($('price-max').value, 10) || Infinity;

  const typeMatchers = {
    starter: item => item.gold <= 500 && item.tags.includes('Lane'),
    basic: item => item.gold > 0 && item.gold <= 1000 && !item.tags.includes('Boots'),
    epic: item => item.gold > 1000 && item.gold <= 2500,
    legendary: item => item.gold > 2500,
    consumable: item => item.tags.includes('Consumable'),
    boots: item => item.tags.includes('Boots')
  };
  const matchesType = typeMatchers[typeFilter] || (() => true);

  filteredItems = items.filter(item =>
    (!searchTerm ||
      item.name.toLowerCase().includes(searchTerm) ||
      (item.plaintext && item.plaintext.toLowerCase().includes(searchTerm))) &&
    matchesType(item) &&
    (!categoryFilter || item.tags.includes(categoryFilter)) &&
    item.gold >= minPrice && item.gold <= maxPrice
  );

  renderItems();
}

function showItemDetails(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  $('item-modal-title').textContent = item.name;
  const image = $('item-modal-image');
  image.src = item.image;
  image.alt = item.name;

  // Riot's descriptions contain simple formatting tags, so we render them as HTML
  $('item-modal-description').innerHTML = item.description;
  $('item-modal-price').textContent = `${item.gold}g`;

  // Prefer the <stats> block from the description, then the short text, then tags
  const statMatch = item.description.match(/<stats>([\s\S]*?)<\/stats>/);
  $('item-modal-stats').textContent =
    (statMatch && stripHtml(statMatch[1])) ||
    item.plaintext ||
    item.tags.join(', ') ||
    'No specific stats listed';

  openModal('item-modal');
}

/* ==========================================================================
   Runes
   ========================================================================== */
let runes = [];
let filteredRunes = [];

async function fetchRunes() {
  try {
    $('rune-grid').innerHTML = loadingHtml('Loading runes...');
    const data = await fetchDragon('data/en_US/runesReforged.json');

    // Runes come grouped by tree and slot; flatten them and remember the tree
    runes = data.flatMap(tree =>
      tree.slots.flatMap(slot =>
        slot.runes.map(rune => ({
          id: rune.id,
          name: rune.name,
          icon: `${CDN}/cdn/img/${rune.icon}`,
          shortDesc: rune.shortDesc,
          longDesc: stripHtml(rune.longDesc),
          tree: tree.name
        }))
      )
    );

    applyRunesFilters();
  } catch (error) {
    console.error('Error loading runes:', error);
    $('rune-grid').innerHTML = messageHtml('Failed to load runes data. Please try again later.', true);
  }
}

const loadRunes = once(fetchRunes, () => runes.length > 0);

function renderRunes() {
  const grid = $('rune-grid');

  if (filteredRunes.length === 0) {
    grid.innerHTML = messageHtml('No runes found matching your filters.');
    return;
  }

  grid.innerHTML = filteredRunes.map(rune => `
    <div class="champion" tabindex="0" aria-label="${escapeHtml(rune.name)}, Rune from ${escapeHtml(rune.tree)} tree" title="${escapeHtml(rune.name)}">
      <img class="rune-icon" src="${rune.icon}" alt="${escapeHtml(rune.name)}" width="64" height="64" loading="lazy" decoding="async" />
      <div class="champion-info">
        <div class="champion-name">${escapeHtml(rune.name)}</div>
        <div class="champion-tags" style="color:#c8aa6e;">${escapeHtml(rune.tree)}</div>
        <div class="rune-description" title="${escapeHtml(rune.longDesc)}">${rune.shortDesc}</div>
      </div>
    </div>
  `).join('');
}

function applyRunesFilters() {
  if (!runes.length) return;
  const treeFilter = $('rune-tree-filter').value;
  const searchTerm = $('rune-search').value.trim().toLowerCase();

  filteredRunes = runes.filter(rune =>
    (!treeFilter || rune.tree === treeFilter) &&
    (!searchTerm || rune.name.toLowerCase().includes(searchTerm))
  );

  renderRunes();
}

/* ==========================================================================
   Builds page: type a champion, get a recommended build
   Builds are grouped by champion type (archetype), so they are general builds,
   not per-champion statistics. Items that no longer exist in the current patch
   are left out automatically.
   ========================================================================== */
const BUILD_ARCHETYPES = {
  'adc': {
    label: 'Crit Marksman (AD carry)',
    boots: 'Berserker\'s Greaves',
    core: ['Kraken Slayer', 'Infinity Edge', 'Lord Dominik\'s Regards'],
    situational: ['Bloodthirster', 'Guardian Angel', 'Mortal Reminder', 'Phantom Dancer'],
    tip: 'Take Lord Dominik\'s Regards or Mortal Reminder against tanky or healing teams, and Guardian Angel or Bloodthirster when enemies can dive you.'
  },
  'onhit': {
    label: 'On-Hit Marksman',
    boots: 'Berserker\'s Greaves',
    core: ['Blade of the Ruined King', 'Guinsoo\'s Rageblade', 'Terminus'],
    situational: ['Wit\'s End', 'Guardian Angel', 'Mortal Reminder', 'Maw of Malmortius'],
    tip: 'Blade of the Ruined King is strongest against high-health targets. Add magic resist or a shield item if their mages are fed.'
  },
  'ap-burst': {
    label: 'AP Burst Mage',
    boots: 'Sorcerer\'s Shoes',
    core: ['Luden\'s Companion', 'Shadowflame', 'Rabadon\'s Deathcap'],
    situational: ['Void Staff', 'Zhonya\'s Hourglass', 'Banshee\'s Veil', 'Cryptbloom'],
    tip: 'Buy Zhonya\'s Hourglass when assassins are on the enemy team and Void Staff or Cryptbloom against stacked magic resist.'
  },
  'ap-dot': {
    label: 'AP Damage-Over-Time Mage',
    boots: 'Sorcerer\'s Shoes',
    core: ['Liandry\'s Torment', 'Shadowflame', 'Rabadon\'s Deathcap'],
    situational: ['Void Staff', 'Zhonya\'s Hourglass', 'Rylai\'s Crystal Scepter', 'Banshee\'s Veil'],
    tip: 'Liandry\'s Torment shines against high-health enemies, so build Void Staff next if they stack magic resist.'
  },
  'ad-assassin': {
    label: 'AD Assassin (Lethality)',
    boots: 'Ionian Boots of Lucidity',
    core: ['Youmuu\'s Ghostblade', 'Serylda\'s Grudge', 'Edge of Night'],
    situational: ['Opportunity', 'Voltaic Cyclosword', 'Serpent\'s Fang', 'Guardian Angel'],
    tip: 'Lethality gets weaker as enemies build armor, so switch to Serylda\'s Grudge or a bruiser item against tanks.'
  },
  'ap-assassin': {
    label: 'AP Assassin',
    boots: 'Sorcerer\'s Shoes',
    core: ['Hextech Rocketbelt', 'Shadowflame', 'Rabadon\'s Deathcap'],
    situational: ['Void Staff', 'Zhonya\'s Hourglass', 'Lich Bane', 'Banshee\'s Veil'],
    tip: 'Zhonya\'s Hourglass lets you survive after you jump in, and Void Staff helps once the enemy builds magic resist.'
  },
  'bruiser': {
    label: 'AD Bruiser / Fighter',
    boots: 'Plated Steelcaps',
    core: ['Trinity Force', 'Black Cleaver', 'Sterak\'s Gage'],
    situational: ['Death\'s Dance', 'Maw of Malmortius', 'Spirit Visage', 'Randuin\'s Omen'],
    tip: 'Black Cleaver is best against tanks, while Death\'s Dance and Maw of Malmortius help against heavy burst damage.'
  },
  'ap-bruiser': {
    label: 'AP Bruiser / Battle Mage',
    boots: 'Sorcerer\'s Shoes',
    core: ['Liandry\'s Torment', 'Rabadon\'s Deathcap', 'Zhonya\'s Hourglass'],
    situational: ['Void Staff', 'Banshee\'s Veil', 'Demonic Embrace', 'Cosmic Drive'],
    tip: 'Mix damage with durability: Demonic Embrace or Zhonya\'s Hourglass when you need to survive, Void Staff when you need more damage.'
  },
  'tank': {
    label: 'Tank',
    boots: 'Plated Steelcaps',
    core: ['Sunfire Aegis', 'Thornmail', 'Kaenic Rookern'],
    situational: ['Frozen Heart', 'Randuin\'s Omen', 'Jak\'Sho, The Protean', 'Warmog\'s Armor'],
    tip: 'Pick armor items against physical damage and magic resist (Kaenic Rookern, Spirit Visage) when mages are ahead. Thornmail also cuts enemy healing.'
  },
  'enchanter': {
    label: 'Enchanter Support',
    boots: 'Ionian Boots of Lucidity',
    core: ['Moonstone Renewer', 'Ardent Censer', 'Staff of Flowing Water'],
    situational: ['Redemption', 'Mikael\'s Blessing', 'Shurelya\'s Battlesong', 'Zhonya\'s Hourglass'],
    tip: 'Match your items to your carry: Ardent Censer for attack-speed carries, Staff of Flowing Water for mages, and Mikael\'s Blessing against crowd control.'
  },
  'engage': {
    label: 'Engage / Tank Support',
    boots: 'Plated Steelcaps',
    core: ['Locket of the Iron Solari', 'Zeke\'s Convergence', 'Redemption'],
    situational: ['Knight\'s Vow', 'Thornmail', 'Randuin\'s Omen', 'Mikael\'s Blessing'],
    tip: 'Build Zeke\'s Convergence if your carry deals sustained damage, and Locket of the Iron Solari when the enemy has a lot of magic damage.'
  }
};

// Which build type each champion uses. Champions not listed are guessed from their class.
const BUILD_TYPE_OF = {
  'adc': ['Aphelios', 'Ashe', 'Caitlyn', 'Draven', 'Ezreal', 'Jhin', 'Jinx', 'Kai\'Sa', 'Kalista', 'Lucian', 'Miss Fortune', 'Nilah', 'Samira', 'Sivir', 'Smolder', 'Tristana', 'Varus', 'Xayah', 'Yunara', 'Zeri', 'Corki', 'Graves', 'Kindred'],
  'onhit': ['Kog\'Maw', 'Vayne', 'Twitch'],
  'ap-burst': ['Ahri', 'Annie', 'Hwei', 'LeBlanc', 'Lissandra', 'Orianna', 'Syndra', 'Veigar', 'Viktor', 'Zoe', 'Azir', 'Aurelion Sol', 'Anivia', 'Neeko', 'Taliyah', 'Twisted Fate', 'Ziggs', 'Xerath', 'Lux', 'Vel\'Koz', 'Vladimir', 'Aurora', 'Zilean', 'Mel'],
  'ap-dot': ['Brand', 'Cassiopeia', 'Malzahar', 'Vex', 'Karthus', 'Heimerdinger', 'Ryze', 'Fiddlesticks', 'Swain', 'Zyra', 'Morgana'],
  'ad-assassin': ['Zed', 'Talon', 'Kha\'Zix', 'Rengar', 'Qiyana', 'Naafiri', 'Pyke', 'Shaco', 'Nocturne', 'Akshan', 'Quinn'],
  'ap-assassin': ['Akali', 'Katarina', 'Fizz', 'Diana', 'Evelynn', 'Ekko', 'Sylas', 'Kassadin', 'Nidalee', 'Elise'],
  'bruiser': ['Aatrox', 'Ambessa', 'Camille', 'Darius', 'Fiora', 'Gangplank', 'Garen', 'Gnar', 'Hecarim', 'Illaoi', 'Irelia', 'Jarvan IV', 'Jax', 'Jayce', 'Kayn', 'Kled', 'Lee Sin', 'Master Yi', 'Nasus', 'Olaf', 'Pantheon', 'Renekton', 'Riven', 'Sett', 'Shyvana', 'Trundle', 'Tryndamere', 'Udyr', 'Urgot', 'Viego', 'Vi', 'Volibear', 'Warwick', 'Wukong', 'Xin Zhao', 'Yasuo', 'Yone', 'Yorick', 'K\'Sante', 'Briar', 'Bel\'Veth', 'Rek\'Sai'],
  'ap-bruiser': ['Gwen', 'Mordekaiser', 'Rumble', 'Lillia', 'Teemo', 'Kayle', 'Kennen'],
  'tank': ['Amumu', 'Cho\'Gath', 'Dr. Mundo', 'Galio', 'Malphite', 'Maokai', 'Ornn', 'Poppy', 'Rammus', 'Sejuani', 'Shen', 'Singed', 'Sion', 'Skarner', 'Zac', 'Nunu & Willump', 'Gragas'],
  'enchanter': ['Janna', 'Karma', 'Lulu', 'Milio', 'Nami', 'Renata Glasc', 'Seraphine', 'Sona', 'Soraka', 'Yuumi', 'Ivern', 'Senna'],
  'engage': ['Alistar', 'Bard', 'Blitzcrank', 'Braum', 'Leona', 'Nautilus', 'Rakan', 'Rell', 'Tahm Kench', 'Taric', 'Thresh']
};

const ARCHETYPE_BY_KEY = {};
Object.entries(BUILD_TYPE_OF).forEach(([type, names]) => {
  names.forEach(name => { ARCHETYPE_BY_KEY[normalizeName(name)] = type; });
});

function guessArchetype(champion) {
  const tags = champion.tags;
  if (tags.includes('Marksman')) return 'adc';
  if (tags.includes('Support')) return tags.includes('Tank') ? 'engage' : 'enchanter';
  if (tags.includes('Tank')) return 'tank';
  if (tags.includes('Mage')) return 'ap-burst';
  if (tags.includes('Assassin')) return champion.magic > champion.attack ? 'ap-assassin' : 'ad-assassin';
  if (tags.includes('Fighter')) return champion.magic > champion.attack ? 'ap-bruiser' : 'bruiser';
  return 'bruiser';
}

// Shared by the Builds and Skins pages: find a champion from what the person typed
function searchChampions(term) {
  const key = normalizeName(term);
  if (!key) return { status: 'empty' };

  const exact = champions.find(c => normalizeName(c.name) === key || c.id.toLowerCase() === key);
  if (exact) return { status: 'one', champion: exact };

  const matches = champions.filter(c => normalizeName(c.name).includes(key));
  if (matches.length === 1) return { status: 'one', champion: matches[0] };
  if (matches.length > 1) return { status: 'many', matches };
  return { status: 'none' };
}

function championChipsHtml(matches, attribute) {
  return `
    <div class="build-chips">
      <p>Did you mean:</p>
      ${matches.slice(0, 12).map(c =>
        `<button type="button" class="chip" ${attribute}="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`
      ).join('')}
    </div>`;
}

function fillChampionDatalist(datalistId) {
  $(datalistId).innerHTML = champions
    .map(c => `<option value="${escapeHtml(c.name)}"></option>`)
    .join('');
}

/* ---- Builds ---- */
let buildReady = false;
let itemsByKey = null;

function buildItemCard(item, number) {
  const badge = number ? `<span class="build-step">${number}</span>` : '';
  return `
    <div class="build-item" tabindex="0" data-item="${escapeHtml(item.id)}" title="Click for details">
      ${badge}
      <img src="${item.image}" alt="" width="56" height="56" loading="lazy" decoding="async" />
      <span class="build-item-name">${escapeHtml(item.name)}</span>
      <span class="build-item-cost">${item.gold}g</span>
    </div>`;
}

function renderBuild(champion) {
  const key = normalizeName(champion.name);
  const archetype = BUILD_ARCHETYPES[ARCHETYPE_BY_KEY[key] || guessArchetype(champion)];
  const position = POSITIONS_BY_KEY[key];

  // Only items that exist in the current patch are shown
  const find = names => names.map(name => itemsByKey.get(normalizeName(name))).filter(Boolean);
  const section = (title, list, numbered) => list.length
    ? `<h4>${title}</h4><div class="build-row">${list.map((item, i) => buildItemCard(item, numbered ? i + 1 : 0)).join('')}</div>`
    : '';

  const boots = find([archetype.boots]);
  const core = find(archetype.core);
  const situational = find(archetype.situational);

  $('build-result').innerHTML = `
    <div class="build-card">
      <div class="build-header">
        <img src="${champion.image}" alt="${escapeHtml(champion.name)}" width="96" height="96" />
        <div>
          <h3>${escapeHtml(champion.name)}</h3>
          <p class="build-title">${escapeHtml(champion.title)}</p>
          <p class="build-meta">${position ? `Main position: <strong>${position}</strong> · ` : ''}Build type: <strong>${archetype.label}</strong></p>
        </div>
      </div>

      ${section('Boots', boots, false)}
      ${section('Core items (in order)', core, true)}
      ${section('Situational items', situational, false)}
      ${boots.length + core.length + situational.length === 0
        ? '<p class="build-tip">None of this build\'s items are in the current patch.</p>'
        : ''}

      <p class="build-tip"><strong>Tip:</strong> ${archetype.tip}</p>
      <p class="counter-note">General build for this type of champion, not live win-rate data. For exact builds on the current patch, check a stats site like u.gg.</p>
    </div>`;
}

function handleBuildSearch() {
  if (!buildReady) return;
  const result = $('build-result');
  const term = $('build-search').value.trim();
  const found = searchChampions(term);

  if (found.status === 'one') renderBuild(found.champion);
  else if (found.status === 'many') result.innerHTML = championChipsHtml(found.matches, 'data-build-champion');
  else if (found.status === 'none') result.innerHTML = messageHtml(`No champion found for "${escapeHtml(term)}".`);
  else result.innerHTML = messageHtml('Type a champion name to see a recommended build.');
}

function pickBuildChampion(championId) {
  const champion = champions.find(c => c.id === championId);
  if (!champion) return;
  $('build-search').value = champion.name;
  renderBuild(champion);
}

async function openBuilds() {
  if (buildReady) return;
  const result = $('build-result');
  result.innerHTML = loadingHtml('Loading champions and items...');

  await Promise.all([loadChampions(), loadItems()]);

  if (!champions.length || !items.length) {
    result.innerHTML = messageHtml('Failed to load data. Please try again later.', true);
    return;
  }

  itemsByKey = new Map(items.map(item => [normalizeName(item.name), item]));
  fillChampionDatalist('build-champions');
  buildReady = true;
  handleBuildSearch();
}

/* ---- Skins: type a champion, see all its skins with pictures and names ---- */
let skinsReady = false;
let skinRequest = 0;       // lets us ignore slow answers when the person searches again

const skinTitle = (champ, skin) => (skin.name === 'default' ? `Classic ${champ.name}` : skin.name);

// Chroma pictures come from Community Dragon (just image links, nothing to download)
const CDRAGON = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1';

// Riot's own data has no prices, so skin prices come from the community "Meraki" data set
const MERAKI = 'https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US';
const CHROMA_PRICE = '290 RP';   // standard chroma price (a few special chromas cost more)

// Riot's skin list also contains every chroma as if it were a skin, named like "Lunar Beast Viego (Ruby)".
// Split them: real skins on one side, chromas grouped under the skin they belong to.
function splitSkinsAndChromas(champ) {
  const baseName = skin => (skin.name === 'default' ? champ.name : skin.name);
  const allNames = new Set(champ.skins.map(baseName));

  const chromaInfo = skin => {
    if (skin.name === 'default') return null;
    const match = skin.name.match(/^(.*\S)\s+\(([^)]+)\)$/);
    if (!match || /prestige|edition|legacy/i.test(match[2])) return null;
    return allNames.has(match[1]) ? { parentName: match[1], label: match[2] } : null;
  };

  const skins = champ.skins.filter(skin => !chromaInfo(skin));
  const parentByName = new Map(skins.map(skin => [baseName(skin), skin]));

  const chromasBySkin = new Map();
  champ.skins.forEach(skin => {
    const info = chromaInfo(skin);
    const parent = info && parentByName.get(info.parentName);
    if (!parent) return;
    const key = String(parent.id);
    if (!chromasBySkin.has(key)) chromasBySkin.set(key, []);
    chromasBySkin.get(key).push({ id: skin.id, label: info.label });
  });

  return { skins, chromasBySkin };
}

/* ---- Skin prices ---- */
const skinPriceCache = new Map();
let currentSkinData = null;       // { champ, skins, chromasBySkin } for the champion on screen
let currentSkinPrices = new Map();
let pricesState = 'loading';      // 'loading' | 'ready' | 'failed'
let openSkin = null;              // skin whose popup is open

const PRICE_CACHE_KEY = 'leaguepedia-skin-prices-v2';
const PRICE_CACHE_MS = 24 * 60 * 60 * 1000;   // keep the price table for a day

// Downloads the community data set once and keeps only { skinId: price } (a few hundred KB)
async function fetchAllSkinPrices() {
  try {
    const cached = JSON.parse(localStorage.getItem(PRICE_CACHE_KEY));
    if (cached && cached.prices && Date.now() - cached.time < PRICE_CACHE_MS) {
      return new Map(Object.entries(cached.prices));
    }
  } catch (_) { /* no saved copy: download it */ }

  const res = await fetch(`${MERAKI}/champions.json`);
  if (!res.ok) throw new Error('Skin prices unavailable');
  const data = await res.json();

  const prices = {};
  (Array.isArray(data) ? data : Object.values(data)).forEach(champion => {
    (champion.skins || []).forEach(skin => {
      if (skin.id != null && skin.cost != null) prices[String(skin.id)] = skin.cost;
    });
  });
  if (!Object.keys(prices).length) throw new Error('Skin prices unavailable');

  try {
    localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ time: Date.now(), prices }));
  } catch (_) { /* storage full or blocked: fine */ }
  return new Map(Object.entries(prices));
}

function getSkinPrices() {
  if (!skinPriceCache.has('all')) {
    skinPriceCache.set('all', fetchAllSkinPrices().catch(error => {
      skinPriceCache.delete('all'); // allow a retry next time
      throw error;
    }));
  }
  return skinPriceCache.get('all');
}

function skinPriceText(skin) {
  if (skin.num === 0) return 'Free';
  if (pricesState === 'loading') return '';
  const cost = currentSkinPrices.get(String(skin.id));
  if (typeof cost === 'number' && cost > 0) return `${cost} RP`;
  if (typeof cost === 'string' && cost.trim()) return cost;
  return 'Price unavailable';
}

function refreshSkinPrices() {
  document.querySelectorAll('[data-price-for]').forEach(el => {
    const skin = currentSkinData && currentSkinData.skins.find(s => String(s.id) === el.getAttribute('data-price-for'));
    if (skin) el.textContent = skinPriceText(skin);
  });
  if (openSkin) $('skin-modal-price').textContent = skinPriceText(openSkin);
}

async function loadSkinPrices(champ, requestId) {
  try {
    const prices = await getSkinPrices();
    if (requestId !== skinRequest) return;
    currentSkinPrices = prices;
    pricesState = 'ready';
  } catch (error) {
    console.error('Error loading skin prices:', error);
    if (requestId !== skinRequest) return;
    pricesState = 'failed';
  }
  refreshSkinPrices();
}

/* ---- Skin grid and popup ---- */
async function renderSkins(champion) {
  const result = $('skin-result');
  const requestId = ++skinRequest;
  result.innerHTML = loadingHtml('Loading skins...');

  try {
    const champ = await getChampionDetails(champion.id);
    if (requestId !== skinRequest) return;

    const { skins, chromasBySkin } = splitSkinsAndChromas(champ);
    const chromaTotal = [...chromasBySkin.values()].reduce((sum, list) => sum + list.length, 0);
    currentSkinData = { champ, skins, chromasBySkin };
    currentSkinPrices = new Map();
    pricesState = 'loading';
    openSkin = null;

    result.innerHTML = `
      <div class="skin-header">
        <h3>${escapeHtml(champ.name)} <span>${skins.length} skin${skins.length === 1 ? '' : 's'}${chromaTotal ? ` · ${chromaTotal} chromas` : ''}</span></h3>
        <p>Click a skin to see it bigger{{CHROMA_HINT}}.</p>
        <p class="counter-note">Prices come from a community data source and may be out of date. Chromas are listed at the standard ${CHROMA_PRICE}; a few cost more.</p>
      </div>
      <div class="skin-grid">
        ${skins.map(skin => {
          const title = skinTitle(champ, skin);
          const chromaCount = (chromasBySkin.get(String(skin.id)) || []).length;
          return `
          <div class="skin-card" tabindex="0" data-skin="${skin.num}">
            <img src="${CDN}/cdn/img/champion/loading/${champ.id}_${skin.num}.jpg"
                 alt="${escapeHtml(title)}" width="154" height="280" loading="lazy" decoding="async" />
            <div class="skin-name">${escapeHtml(title)}</div>
            <div class="skin-price" data-price-for="${skin.id}">${skin.num === 0 ? 'Free' : ''}</div>
            ${chromaCount ? `<div class="skin-chroma-count">${chromaCount} chroma${chromaCount === 1 ? '' : 's'}</div>` : ''}
          </div>`;
        }).join('')}
      </div>`.replace('{{CHROMA_HINT}}', chromaTotal ? ' and its chromas' : '');

    loadSkinPrices(champ, requestId);
  } catch (error) {
    console.error('Error loading skins:', error);
    if (requestId === skinRequest) {
      result.innerHTML = messageHtml('Could not load skins. Please try again later.', true);
    }
  }
}

function showSkin(num) {
  if (!currentSkinData) return;
  const { champ, skins, chromasBySkin } = currentSkinData;
  const skin = skins.find(s => String(s.num) === String(num));
  if (!skin) return;

  openSkin = skin;
  const title = skinTitle(champ, skin);
  $('skin-modal-title').textContent = title;
  $('skin-modal-price').textContent = skinPriceText(skin);
  const image = $('skin-modal-image');
  image.src = `${CDN}/cdn/img/champion/splash/${champ.id}_${skin.num}.jpg`;
  image.alt = title;

  // Chromas of this skin, each with its picture, name and price
  const chromas = chromasBySkin.get(String(skin.id)) || [];
  $('skin-chromas').innerHTML = chromas.length ? `
    <h3>Chromas <span>${chromas.length}</span></h3>
    <div class="chroma-row">
      ${chromas.map(chroma => `
        <div class="chroma-item">
          <img src="${CDRAGON}/champion-chroma-images/${champ.key}/${chroma.id}.png"
               alt="${escapeHtml(`${title} (${chroma.label})`)}" width="120" loading="lazy" decoding="async" />
          <span>${escapeHtml(chroma.label)}</span>
          <span class="chroma-price">${CHROMA_PRICE}</span>
        </div>
      `).join('')}
    </div>` : '';

  openModal('skin-modal');
}

function handleSkinSearch() {
  if (!skinsReady) return;
  const result = $('skin-result');
  const term = $('skin-search').value.trim();
  const found = searchChampions(term);

  if (found.status === 'one') renderSkins(found.champion);
  else if (found.status === 'many') result.innerHTML = championChipsHtml(found.matches, 'data-skin-champion');
  else if (found.status === 'none') result.innerHTML = messageHtml(`No champion found for "${escapeHtml(term)}".`);
  else result.innerHTML = messageHtml('Type a champion name to see all of its skins.');
}

function pickSkinChampion(championId) {
  const champion = champions.find(c => c.id === championId);
  if (!champion) return;
  $('skin-search').value = champion.name;
  renderSkins(champion);
}

async function openSkins() {
  if (skinsReady) return;
  const result = $('skin-result');
  result.innerHTML = loadingHtml('Loading champions...');

  await loadChampions();

  if (!champions.length) {
    result.innerHTML = messageHtml('Failed to load data. Please try again later.', true);
    return;
  }

  fillChampionDatalist('skin-champions');
  skinsReady = true;
  handleSkinSearch();
}

/* ==========================================================================
   Hidden interactions: unusual mechanics explained
   These describe how abilities and items commonly behave. Riot changes details over
   time, so test anything important in the Practice Tool. Add or edit cards freely.
   ========================================================================== */
const INTERACTIONS = [
  {
    "subject": "Yasuo · W Wind Wall",
    "champions": [
      "Yasuo"
    ],
    "category": "Projectiles",
    "title": "Blocks enemy projectiles",
    "text": "The wall stops missiles that travel toward you: ranged basic attacks and most skillshots and targeted missiles, including several ultimates. It does not stop turret shots, and moving champions pass straight through it, dashes included. Sivir's boomerang is a special case: it bounces back when it hits the wall.",
    "yes": [
      "Ranged basic attacks",
      "Ashe's Enchanted Crystal Arrow",
      "Jinx's Super Mega Death Rocket!",
      "Ezreal's Mystic Shot",
      "Morgana's Dark Binding",
      "Annie's Disintegrate"
    ],
    "no": [
      "Turret shots",
      "Melee basic attacks",
      "Lux's Final Spark (it's a beam)",
      "Dashes and other moving champions",
      "Abilities that hit instantly with no missile"
    ],
    "tip": "Against Yasuo, wait out the wall or use abilities that don't travel as a missile."
  },
  {
    "subject": "Rule of thumb · What counts as a projectile?",
    "champions": [],
    "category": "Projectiles",
    "title": "Projectile or not?",
    "text": "A projectile is something that visibly travels toward its target. Ranged basic attacks and most skillshots and targeted missiles count. Melee basic attacks, beams, abilities that hit instantly and effects that simply appear on the ground don't. Things that block projectiles (Wind Wall, Braum's shield, Samira's Blade Whirl) only work on the first group.",
    "yes": [
      "Ranged basic attacks",
      "Most skillshots",
      "Targeted abilities that fire a missile"
    ],
    "no": [
      "Melee basic attacks",
      "Beams such as Lux's Final Spark",
      "Instant-hit abilities",
      "Ground effects that appear after a delay"
    ]
  },
  {
    "subject": "Braum · E Unbreakable",
    "champions": [
      "Braum"
    ],
    "category": "Projectiles",
    "title": "A shield that eats projectiles from the front",
    "text": "While the shield is up, enemy projectiles that hit it are destroyed. The first attack from that direction is absorbed, and later damage from that direction is reduced. Attacks coming from behind or the sides are not stopped.",
    "tip": "Attack Braum from the side or behind, or make him waste the shield first."
  },
  {
    "subject": "Samira · W Blade Whirl",
    "champions": [
      "Samira"
    ],
    "category": "Projectiles",
    "title": "Cuts projectiles out of the air",
    "text": "Blade Whirl slashes around Samira and destroys enemy projectiles that enter the area while it is active, so her own team's carries can be protected from skillshots.",
    "tip": "Hold your skillshots until the whirl ends."
  },
  {
    "subject": "Poppy · W Steadfast Presence",
    "champions": [
      "Poppy"
    ],
    "category": "Movement & targeting",
    "title": "Stops enemy dashes",
    "text": "Enemies that try to dash into Poppy's W area are stopped. Dashes that start inside the area are not affected the same way, so keep your distance before you dash.",
    "tip": "Use your dash before you enter the area, not inside it."
  },
  {
    "subject": "Sivir · E Spell Shield  /  Nocturne · W Shroud of Darkness  /  Banshee's Veil",
    "champions": [
      "Sivir",
      "Nocturne"
    ],
    "category": "Shields & immunity",
    "title": "Spell shields block one ability",
    "text": "These block the next enemy ability that hits you. They do not stop basic attacks or turret shots, and they break after one ability, so baiting with a cheap ability first is a classic way to beat them.",
    "tip": "Throw out your least important ability first, then use your big one."
  },
  {
    "subject": "Morgana · E Black Shield",
    "champions": [
      "Morgana"
    ],
    "category": "Shields & immunity",
    "title": "Blocks magic damage and hard crowd control",
    "text": "Black Shield absorbs magic damage and prevents hard crowd control while it is up. It does nothing against physical or true damage.",
    "tip": "Physical damage ignores it, so use your physical abilities and basic attacks while it's up."
  },
  {
    "subject": "Fiora · W Riposte",
    "champions": [
      "Fiora"
    ],
    "category": "Shields & immunity",
    "title": "Parries a crowd-control ability",
    "text": "If an enemy crowd-control ability hits Fiora during the parry, its damage and effect are negated and she strikes back. Using a harmless ability first, or waiting for the parry to end, beats it.",
    "tip": "Bait the parry with a non-crowd-control ability, then use the one that matters."
  },
  {
    "subject": "Jax · E Counter Strike",
    "champions": [
      "Jax"
    ],
    "category": "Shields & immunity",
    "title": "Dodges basic attacks, not abilities",
    "text": "While Counter Strike is active Jax dodges incoming basic attacks, and then strikes nearby enemies when it ends. Abilities still hit him normally.",
    "tip": "Use abilities, not basic attacks, while he's dodging."
  },
  {
    "subject": "Kindred · R Lamb's Respite",
    "champions": [
      "Kindred"
    ],
    "category": "Shields & immunity",
    "title": "Nobody in the zone can die",
    "text": "Champions inside the area, allies and enemies alike, cannot fall below a small amount of health for a few seconds. Damage you deal inside it is not wasted if you wait for the zone to end.",
    "tip": "Save your burst for just after the zone ends."
  },
  {
    "subject": "Karthus · Passive Death Defied",
    "champions": [
      "Karthus"
    ],
    "category": "Revives & dead state",
    "title": "Keeps casting after dying",
    "text": "When Karthus dies he stays in the fight for a few seconds and can keep using his abilities. Killing him does not instantly stop his damage.",
    "tip": "Don't relax the moment he dies; get out of his area."
  },
  {
    "subject": "Anivia · Passive Rebirth",
    "champions": [
      "Anivia"
    ],
    "category": "Revives & dead state",
    "title": "Turns into an egg instead of dying",
    "text": "When Anivia would die she becomes an egg. If the egg survives she comes back with part of her health restored. Destroy the egg to finish her.",
    "tip": "Focus the egg quickly or it will hatch."
  },
  {
    "subject": "Master Yi · Q Alpha Strike  /  Fizz · E Playful & Trickster  /  Vladimir · W Sanguine Pool",
    "champions": [
      "Master Yi",
      "Fizz",
      "Vladimir"
    ],
    "category": "Movement & targeting",
    "title": "Moments when you can't be targeted",
    "text": "While these are active the champion can't be selected, so targeted abilities and basic attacks can't hit them. Time your targeted abilities, and your own basic attacks, for after they end.",
    "tip": "Hold targeted abilities until they become targetable again."
  },
  {
    "subject": "Cleanse  /  Quicksilver Sash",
    "champions": [],
    "category": "Items & summoners",
    "title": "Can't remove airborne effects",
    "text": "Cleanse and Quicksilver Sash remove most crowd control but cannot remove airborne effects such as knock-ups, knockbacks and pulls. Use a different plan against champions that rely on them.",
    "tip": "Against knock-ups, positioning and dodging matter more than cleansing."
  },
  {
    "subject": "Zhonya's Hourglass · Stasis",
    "champions": [],
    "category": "Items & summoners",
    "title": "Safe, but frozen",
    "text": "Stasis makes you untargetable and immune to damage for a short time, but you can't move, attack or cast either. It works best used just before a big hit lands, not at the start of a fight.",
    "tip": "Don't use it too early, or you'll be waiting while the enemy walks away."
  },
  {
    "subject": "Ahri · Q Orb of Deception",
    "champions": [
      "Ahri"
    ],
    "category": "Champion tricks",
    "title": "Hurts twice, and the second hit is true damage",
    "text": "The orb damages enemies on the way out and again as it returns to Ahri. The returning hit deals true damage, so armor and magic resist don't reduce it.",
    "tip": "Try to line up enemies so the orb passes through them on both trips."
  },
  {
    "subject": "Sivir · Q Boomerang Blade",
    "champions": [
      "Sivir"
    ],
    "category": "Champion tricks",
    "title": "Hits on the way out and back",
    "text": "The boomerang damages enemies when it flies out and again when it comes back to Sivir. If you stand in line with it, you can be hit twice.",
    "tip": "Step out of the line after the first hit."
  },
  {
    "subject": "Ashe · R Enchanted Crystal Arrow",
    "champions": [
      "Ashe"
    ],
    "category": "Champion tricks",
    "title": "Stun time grows with distance",
    "text": "The arrow can be fired from anywhere on the map, and the longer it flies before hitting a champion, the longer the stun. It is a projectile, so Yasuo's Wind Wall and similar effects can stop it.",
    "tip": "If you see Ashe's arrow coming from far away, expect a long stun and try to dodge it."
  },
  {
    "subject": "Jinx · R Super Mega Death Rocket!",
    "champions": [
      "Jinx"
    ],
    "category": "Champion tricks",
    "title": "Damage grows with distance",
    "text": "The rocket deals more damage the farther it has traveled and explodes on the first enemy champion it hits. It is a projectile, so Wind Wall and Braum's shield can stop it.",
    "tip": "Getting close to Jinx makes her ultimate weaker."
  },
  {
    "subject": "Caitlyn · R Ace in the Hole",
    "champions": [
      "Caitlyn"
    ],
    "category": "Champion tricks",
    "title": "Another champion can take the shot",
    "text": "The shot travels toward its target, and an enemy champion who steps into its path can intercept it instead of the target.",
    "tip": "Stand in front of your ally to body-block the shot."
  },
  {
    "subject": "Ezreal · Q Mystic Shot",
    "champions": [
      "Ezreal"
    ],
    "category": "Champion tricks",
    "title": "Applies on-hit effects and refunds cooldowns",
    "text": "When Mystic Shot hits, it applies on-hit effects such as Sheen and similar item effects, and it lowers the cooldowns of Ezreal's other abilities.",
    "tip": "That is why Ezreal builds items that trigger from abilities."
  },
  {
    "subject": "Vayne · E Condemn",
    "champions": [
      "Vayne"
    ],
    "category": "Champion tricks",
    "title": "Terrain turns a push into a stun",
    "text": "Condemn pushes the target away, and if they hit terrain they are stunned and take extra damage. Fighting near walls makes it much stronger.",
    "tip": "Stay away from walls when Vayne is nearby."
  },
  {
    "subject": "Vayne · W Silver Bolts",
    "champions": [
      "Vayne"
    ],
    "category": "Champion tricks",
    "title": "Third hit deals true damage",
    "text": "Every third consecutive basic attack on the same target deals bonus true damage based on the target's maximum health, so armor and magic resist don't reduce it. It is especially strong against tanks.",
    "tip": "Break her attack rhythm by moving out of range."
  },
  {
    "subject": "Lee Sin · R Dragon's Rage",
    "champions": [
      "Lee Sin"
    ],
    "category": "Champion tricks",
    "title": "Knocked-back enemies hurt others",
    "text": "Lee Sin kicks the target backward. Any other enemy champion they crash into takes damage and is knocked into the air.",
    "tip": "Don't stand next to a teammate who is about to be kicked toward you."
  },
  {
    "subject": "Malphite · R Unstoppable Force",
    "champions": [
      "Malphite"
    ],
    "category": "Champion tricks",
    "title": "Can't be stopped while charging",
    "text": "While Malphite dashes toward his target he is unstoppable, so most crowd control can't interrupt it. Dodging it or being out of range is the main counter.",
    "tip": "Crowd control used while he is charging won't work. Move out of the way instead."
  },
  {
    "subject": "Kayle · R Divine Judgment",
    "champions": [
      "Kayle"
    ],
    "category": "Shields & immunity",
    "title": "Makes an ally invulnerable",
    "text": "Kayle can make herself or an allied champion invulnerable for a short time. During that time damage can't hurt them, but they can still be moved by some crowd control effects.",
    "tip": "Save your burst until it ends instead of wasting it."
  },
  {
    "subject": "Taric · R Cosmic Radiance",
    "champions": [
      "Taric"
    ],
    "category": "Shields & immunity",
    "title": "Invulnerability after a delay",
    "text": "Nearby allies become invulnerable for a short time, but only after a brief delay. A smart enemy can bait the effect or hit allies before it starts.",
    "tip": "Don't dump your abilities until the invulnerability has ended."
  },
  {
    "subject": "Tryndamere · R Undying Rage",
    "champions": [
      "Tryndamere"
    ],
    "category": "Shields & immunity",
    "title": "Can't die while it lasts",
    "text": "While Undying Rage is active Tryndamere's health will not drop to zero. Once it ends he can die immediately if he is still low.",
    "tip": "Keep your abilities ready for after it ends."
  },
  {
    "subject": "Zilean · R Chronoshift",
    "champions": [
      "Zilean"
    ],
    "category": "Revives & dead state",
    "title": "Revives an ally who dies",
    "text": "If the ally dies while Chronoshift is active, they are brought back with some of their health. The effect is on a timer, so the ally must die while it is still active.",
    "tip": "If you kill the ally right after it ends, it doesn't save them."
  },
  {
    "subject": "Guardian Angel",
    "champions": [],
    "category": "Revives & dead state",
    "title": "Comes back after a short wait",
    "text": "When you would die, Guardian Angel brings you back after a few seconds with about half of your base health. It has a long cooldown, so a second kill later in the fight sticks.",
    "tip": "Kill the revived champion again before they can fight back."
  },
  {
    "subject": "Hard vs soft crowd control",
    "champions": [],
    "category": "Crowd control",
    "title": "Not all crowd control is the same",
    "text": "Hard crowd control stops a champion from controlling their character: stuns, knock-ups, charms, taunts, fears, sleeps and suppression. Soft crowd control only limits something: slows reduce speed, roots stop movement, silences stop abilities, disarms stop basic attacks and blinds make basic attacks miss.",
    "tip": "Know which effect you're facing so you can pick the right item or summoner spell."
  },
  {
    "subject": "Tenacity",
    "champions": [],
    "category": "Crowd control",
    "title": "Reduces duration, but not everything",
    "text": "Tenacity shortens how long most crowd control lasts. It does not shorten knock-ups, knockbacks or suppression. Slow resistance is a separate stat that makes slows weaker.",
    "tip": "Don't count on tenacity against knock-up champions."
  },
  {
    "subject": "Silence",
    "champions": [],
    "category": "Crowd control",
    "title": "Stops abilities, not summoner spells",
    "text": "A silenced champion can't cast their abilities, but they can still use their summoner spells, such as Flash, and their basic attacks.",
    "tip": "Silence them before an engage, not after they have already used their escape."
  },
  {
    "subject": "Flash",
    "champions": [],
    "category": "Items & summoners",
    "title": "Works while rooted or silenced",
    "text": "Flash is a summoner spell, so a silence doesn't stop it, and you can use it while rooted to escape. You can't use it while stunned, knocked up or suppressed.",
    "tip": "Hard crowd control stops Flash; a root or slow doesn't."
  },
  {
    "subject": "Ignite",
    "champions": [],
    "category": "Items & summoners",
    "title": "Damage and anti-heal",
    "text": "Ignite deals true damage over a few seconds and also reduces the target's healing while it lasts.",
    "tip": "It is great against champions that heal a lot."
  },
  {
    "subject": "Anti-heal (Grievous Wounds)",
    "champions": [],
    "category": "Items & summoners",
    "title": "Cuts healing and life steal",
    "text": "Items like Thornmail, Executioner's Calling and Mortal Reminder apply anti-heal to enemies, which reduces how much they heal. Buy one early against champions that rely on healing.",
    "tip": "A cheap anti-heal item can beat a strong life-steal build."
  },
  {
    "subject": "Armor and magic resist",
    "champions": [],
    "category": "Stats & rules",
    "title": "How resistances reduce damage",
    "text": "Each point of armor or magic resist lowers the damage you take by 100 divided by (100 plus that stat). With 100 armor you take half of the physical damage. True damage ignores both.",
    "tip": "Going from 100 to 200 armor helps less than it sounds: you go from 50% to 33% damage taken."
  },
  {
    "subject": "Penetration order",
    "champions": [],
    "category": "Stats & rules",
    "title": "Armor reduction comes first",
    "text": "Enemy resistances are lowered in this order: flat reduction, percent reduction, percent penetration, then flat penetration (lethality). Percent effects are stronger against high armor and flat effects are stronger against low armor.",
    "tip": "Lethality is strong against squishy targets and weaker against tanks."
  },
  {
    "subject": "Ability haste",
    "champions": [],
    "category": "Stats & rules",
    "title": "Cooldowns shrink with diminishing returns",
    "text": "Cooldowns are the base value times 100 divided by (100 plus ability haste). There is no hard cap, but each point of haste helps a little less than the one before.",
    "tip": "Don't stack so much haste that you can't afford damage items."
  },
  {
    "subject": "Attack speed cap",
    "champions": [],
    "category": "Stats & rules",
    "title": "Most champions can't go past 2.5",
    "text": "Attack speed normally can't exceed 2.5 attacks per second. Extra attack speed beyond that does nothing for most champions.",
    "tip": "Stop buying attack speed once you reach the cap."
  },
  {
    "subject": "Movement speed soft caps",
    "champions": [],
    "category": "Stats & rules",
    "title": "More speed counts less above 415",
    "text": "Movement speed above 415 is only 80 percent effective, and above 490 only 50 percent. Stacking speed past those numbers gives much smaller gains.",
    "tip": "If you're near a cap, a different stat is usually better."
  },
  {
    "subject": "Turret and minion aggro",
    "champions": [],
    "category": "Stats & rules",
    "title": "Who the tower shoots",
    "text": "Turrets normally shoot minions first. If an enemy champion damages one of your champions within range, the turret switches to that champion. Nearby minions switch targets in a similar way.",
    "tip": "To dive safely, let your minions tank the tower, and avoid hitting enemy champions while under it."
  }
];

// champion name -> interactions that involve that champion (used in the champion popup)
const INTERACTIONS_BY_CHAMPION = new Map();
INTERACTIONS.forEach(card => {
  card.champions.forEach(name => {
    const key = normalizeName(name);
    if (!INTERACTIONS_BY_CHAMPION.has(key)) INTERACTIONS_BY_CHAMPION.set(key, []);
    INTERACTIONS_BY_CHAMPION.get(key).push(card);
  });
});

const cardList = (items, className, symbol, label) => items && items.length
  ? `<div class="interaction-list ${className}"><h5>${label}</h5><ul>${items.map(i => `<li><span aria-hidden="true">${symbol}</span> ${escapeHtml(i)}</li>`).join('')}</ul></div>`
  : '';

function interactionCardHtml(card) {
  return `
    <article class="interaction-card">
      <p class="interaction-subject">${escapeHtml(card.subject)}</p>
      <h3>${escapeHtml(card.title)}</h3>
      <span class="interaction-tag">${escapeHtml(card.category)}</span>
      <p>${escapeHtml(card.text)}</p>
      ${(card.yes || card.no) ? `<div class="interaction-lists">${cardList(card.yes, 'yes', '✓', 'Affected')}${cardList(card.no, 'no', '✗', 'Not affected')}</div>` : ''}
      ${card.tip ? `<p class="interaction-tip"><strong>Tip:</strong> ${escapeHtml(card.tip)}</p>` : ''}
    </article>`;
}

function evolutionCardHtml(card) {
  return `
    <article class="interaction-card">
      <p class="interaction-subject">${escapeHtml(card.subject)}</p>
      <h3>${escapeHtml(card.title)}</h3>
      <span class="interaction-tag">${escapeHtml(card.category)}</span>
      ${card.era ? `<span class="interaction-tag">${escapeHtml(card.era)}</span>` : ''}
      <p>${escapeHtml(card.text)}</p>
      <div class="interaction-lists">
        ${cardList(card.before, 'before', '•', 'Before')}
        ${cardList(card.now, 'now', '•', 'Now')}
      </div>
      ${card.tip ? `<p class="interaction-tip">${escapeHtml(card.tip)}</p>` : ''}
    </article>`;
}

// Shows the cards that match the search box and category filter of one page
function renderCardPage(data, ids, cardHtml = interactionCardHtml) {
  const grid = $(ids.grid);
  const category = ids.category ? $(ids.category).value : '';
  const term = normalizeName($(ids.search).value);

  const cards = data.filter(card =>
    (!category || card.category === category) &&
    (!term || normalizeName([card.subject, card.title, card.text, card.category, ...(card.yes || []), ...(card.no || []), ...(card.before || []), ...(card.now || [])].join(' ')).includes(term))
  );

  grid.innerHTML = cards.length
    ? cards.map(cardHtml).join('')
    : messageHtml('Nothing found. Try another champion or keyword.');
}

const renderInteractions = () => renderCardPage(INTERACTIONS, { grid: 'interaction-grid', search: 'interaction-search', category: 'interaction-category' });
const renderItemGuide = () => renderCardPage(ITEM_GUIDE, { grid: 'itemguide-grid', search: 'itemguide-search', category: 'itemguide-category' });
const renderEvolution = () => renderCardPage(EVOLUTION, { grid: 'evolution-grid', search: 'evolution-search', category: 'evolution-category' }, evolutionCardHtml);

/* ==========================================================================
   Item Guide, Difficulty, Lore and Evolution pages
   Hand-written data. Riot changes details over time, so check the League Wiki or the
   in-game text for exact numbers. Add or edit entries freely.
   ========================================================================== */
const ITEM_GUIDE = [
  {
    "subject": "On-hit effects",
    "champions": [],
    "category": "On-hit & spell effects",
    "title": "What triggers on-hit?",
    "text": "On-hit effects trigger when a basic attack lands. Items like Blade of the Ruined King, Nashor's Tooth and Wit's End add damage to your basic attacks. Some abilities also apply on-hit effects, but only when the ability says so (Ezreal's Mystic Shot is a well-known example).",
    "yes": [
      "Basic attacks",
      "Abilities whose text says they apply on-hit effects"
    ],
    "no": [
      "Most abilities",
      "Damage from turrets and minions"
    ],
    "tip": "Read the ability text and look for the words 'on-hit effects'."
  },
  {
    "subject": "Sheen, Trinity Force, Lich Bane, Iceborn Gauntlet",
    "champions": [],
    "category": "On-hit & spell effects",
    "title": "Ability first, then attack",
    "text": "These spellblade items empower your next basic attack after you cast an ability. The bonus attack must land within a short time, and each item has a short internal cooldown, so you can't trigger it endlessly. Lich Bane deals magic damage, while Sheen and Trinity Force deal physical damage.",
    "tip": "Cast an ability, then attack right away so the empowered attack isn't wasted."
  },
  {
    "subject": "Percent health damage",
    "champions": [],
    "category": "On-hit & spell effects",
    "title": "Strong against tanks",
    "text": "Effects that deal a percentage of the target's health, like Blade of the Ruined King's on-hit damage, get stronger the more health the target has. They are a good answer to tanks but add little against low-health targets.",
    "tip": "Build percent health damage when the enemy team has several high-health champions."
  },
  {
    "subject": "Lifesteal, spell vamp and omnivamp",
    "champions": [],
    "category": "Healing & shields",
    "title": "Different healing sources",
    "text": "Lifesteal heals you from basic attack damage, spell vamp heals you from ability damage, and omnivamp heals you from most damage you deal. Healing from area damage and from minions is usually reduced, so these items work best on single targets.",
    "tip": "Choose the type that matches how your champion deals damage."
  },
  {
    "subject": "Heal and shield power",
    "champions": [],
    "category": "Healing & shields",
    "title": "Boosts what you give to others",
    "text": "Heal and shield power makes your heals and shields stronger, including the ones you give to allies. It does not make your lifesteal or omnivamp stronger.",
    "tip": "Enchanters build heal and shield power; lifesteal champions need other stats."
  },
  {
    "subject": "Shields are not healing",
    "champions": [],
    "category": "Healing & shields",
    "title": "Shields work separately from health",
    "text": "A shield absorbs damage before your health, and it is not healing, so lifesteal doesn't fill it. Anti-heal items reduce healing, while shield-reducing effects (for example Serpent's Fang) work on their own.",
    "tip": "If the enemy has a lot of shields, an item like Serpent's Fang is the answer, not anti-heal."
  },
  {
    "subject": "Armor, magic resist and true damage",
    "champions": [],
    "category": "Damage types",
    "title": "Which defense reduces which damage",
    "text": "Physical damage is reduced by armor, magic damage by magic resist, and true damage by neither. On-hit items can deal different types: Blade of the Ruined King deals physical on-hit damage, while Nashor's Tooth and Wit's End deal magic on-hit damage.",
    "yes": [
      "Armor: physical damage",
      "Magic resist: magic damage"
    ],
    "no": [
      "True damage ignores both"
    ],
    "tip": "Check whether the enemy is stacking armor or magic resist before picking your items."
  },
  {
    "subject": "Lethality",
    "champions": [],
    "category": "Damage types",
    "title": "Flat penetration that grows with level",
    "text": "Lethality is flat armor penetration whose strength rises as you level up. It is strongest on champions that kill squishy targets, and it falls off against heavy armor.",
    "tip": "Against tanks, switch to percent penetration or armor reduction."
  },
  {
    "subject": "Critical strikes",
    "champions": [],
    "category": "Stats & scaling",
    "title": "Mostly for basic attacks",
    "text": "Critical strike chance mainly affects basic attacks. An ability only critically strikes if its text says that it can.",
    "tip": "If your champion's damage comes from abilities, crit items won't help much."
  },
  {
    "subject": "Bonus vs base stats",
    "champions": [],
    "category": "Stats & scaling",
    "title": "Items add bonus stats, not base stats",
    "text": "Many abilities scale with bonus attack damage, which is the attack damage that comes from items and runes, not your level-based base damage. Buying attack damage items makes those abilities stronger.",
    "tip": "Check whether an ability scales with 'bonus' or 'total' attack damage."
  },
  {
    "subject": "Rabadon's Deathcap",
    "champions": [],
    "category": "Stats & scaling",
    "title": "Multiplies your ability power",
    "text": "Rabadon's Deathcap increases your total ability power by a percentage, so it gets stronger the more ability power you already have. That is why it is usually bought after other ability power items.",
    "tip": "Build it later in your item order for the best value."
  },
  {
    "subject": "Unique passives",
    "champions": [],
    "category": "Stats & scaling",
    "title": "Same-named passives don't stack",
    "text": "If two items share a unique passive with the same name, you only get the effect once. Buying a second copy of the same effect usually wastes the passive part of that item.",
    "tip": "Look at the passive names before you buy a second similar item."
  },
  {
    "subject": "Mercury's Treads",
    "champions": [],
    "category": "Items & abilities",
    "title": "Tenacity, with limits",
    "text": "Mercury's Treads give tenacity, which shortens most crowd control effects. They do not shorten knock-ups, knockbacks or suppression, so they won't save you from those.",
    "tip": "Against knock-up champions, dodging matters more than tenacity."
  },
  {
    "subject": "Spell shield items",
    "champions": [],
    "category": "Items & abilities",
    "title": "Banshee's Veil and similar items",
    "text": "Spell shield items block the next enemy ability that hits you, then go on cooldown. They don't stop basic attacks or turret shots, so a cheap ability thrown first can pop the shield.",
    "tip": "Bait the shield with a weaker ability before using your important one."
  }
];

const DIFFICULTY_NOTES = {
  "Yasuo": {
    "summary": "Easy to start, hard to master: his power comes from dashing, stacking Steel Tempest and placing Wind Wall at the right moment.",
    "mechanics": "Steel Tempest has to be stacked to knock enemies up on the third cast, and you can cast it during a dash.",
    "positioning": "He needs minions, monsters or enemies to dash through, so he is weak in open space.",
    "combos": "Third-cast Steel Tempest while dashing, then Last Breath on the airborne enemy.",
    "decisions": "Wind Wall has a long cooldown, so using it too early or too late can lose a team fight."
  },
  "Riven": {
    "summary": "A fast duelist whose damage depends on weaving attacks between Broken Wings casts.",
    "mechanics": "Animation canceling: using basic attacks, Q, W and E in a tight sequence to speed up her attacks.",
    "positioning": "She is easy to kite and has no sustain, so the angle of her engage matters.",
    "combos": "Quick burst combos like E, Q, W and Flash, with the ultimate for damage.",
    "decisions": "Knowing when to trade and when to back off, because her key abilities have limited uses."
  },
  "Lee Sin": {
    "summary": "A high-tempo jungler with many recasts and movement tricks, which is why he is known for big plays.",
    "mechanics": "His basic abilities can be recast, and ward hops and Flash tricks need precise timing.",
    "resources": "Energy runs out fast if you spam abilities early.",
    "positioning": "He is strong when he can reach the target, and it is easy to overextend.",
    "decisions": "Early ganks matter a lot, since his power drops if you misplay the early game."
  },
  "Zed": {
    "summary": "An assassin who relies on shadow control and clean combos.",
    "mechanics": "Aiming Razor Shuriken and swapping with his shadow at the right moment.",
    "resources": "Energy limits how many combos you can use in a row.",
    "combos": "Death Mark combos with shadows and basic attacks must be sequenced properly.",
    "decisions": "Using Living Shadow to escape or engage; the wrong choice often gets him killed."
  },
  "Thresh": {
    "summary": "A support whose game depends on landing hooks and using the lantern well.",
    "mechanics": "Death Sentence is a skillshot you must predict, and Flay's direction matters.",
    "positioning": "He has to stay close enough to help his carry without being easy to counter.",
    "decisions": "Knowing when to hook, when to flay to peel, and when to pull an ally with the Lantern."
  },
  "Azir": {
    "summary": "A mage whose kit needs several parts working together.",
    "mechanics": "Sand soldiers must be placed precisely and used as extensions of his attacks.",
    "positioning": "He must stay near his soldiers, which disappear after a few seconds.",
    "combos": "The Shurima Shuffle combo takes practice."
  },
  "Aphelios": {
    "summary": "A marksman with five weapons that change how his abilities work.",
    "resources": "Each weapon has limited ammo, so you manage which weapons you carry.",
    "combos": "Different weapon pairs create different combos you need to know.",
    "decisions": "Choosing the right weapon for the situation matters more than raw mechanics."
  },
  "Kalista": {
    "summary": "A marksman whose attacks come with a hop after each attack.",
    "mechanics": "Her movement is built around hopping after attacks, so rhythm matters.",
    "positioning": "Hopping carelessly can leave her out of position.",
    "decisions": "Her ultimate needs a teammate to engage with her."
  },
  "Draven": {
    "summary": "A marksman whose damage depends on catching axes while attacking.",
    "mechanics": "Axes land in different spots, so you move to catch them without losing attacks.",
    "positioning": "Moving to catch axes can pull him into danger.",
    "decisions": "Whether to catch every axe or play safely."
  },
  "Irelia": {
    "summary": "A skirmisher who needs targets to dash between.",
    "mechanics": "Bladesurge resets on marked targets and kills, so you chain dashes carefully.",
    "positioning": "She needs minions or champions near her to keep dashing.",
    "resources": "Her passive stacks need continuous attacking.",
    "combos": "Q, W and E chain together with her ultimate for burst."
  },
  "Fiora": {
    "summary": "A duelist that rewards precise movement and good timing.",
    "mechanics": "Hitting a Vital from the correct direction and timing Riposte.",
    "combos": "Her ultimate marks Vitals, so you target the right angles.",
    "decisions": "Using Riposte on the enemy's key crowd-control ability rather than the first one."
  },
  "Camille": {
    "summary": "A fighter who needs terrain and good engage timing.",
    "mechanics": "Hookshot needs a wall, and Precision Protocol resets her attacks.",
    "positioning": "She chooses where to start fights using terrain."
  },
  "Akali": {
    "summary": "An assassin that relies on energy and stealth.",
    "resources": "Energy limits her abilities, and Twilight Shroud only lasts a short time.",
    "positioning": "She has to dive in and out of her stealth.",
    "decisions": "When to use Perfect Execution."
  },
  "Katarina": {
    "summary": "A snowballing assassin built around resets.",
    "mechanics": "Picking up daggers while casting abilities requires positioning.",
    "combos": "Sequencing Bouncing Blade, Preparation and Shunpo.",
    "decisions": "She is only good if she gets resets, so choosing fights carefully matters."
  },
  "LeBlanc": {
    "summary": "A burst mage with lots of tricks.",
    "combos": "Chains abilities with Mimic for repeated damage.",
    "decisions": "Choosing which spell to copy and when to use her clone."
  },
  "Qiyana": {
    "summary": "An assassin whose abilities change based on terrain.",
    "positioning": "Her Q effects depend on terrain such as walls, river and brush.",
    "decisions": "Choosing the best terrain to fight from."
  },
  "Syndra": {
    "summary": "A mage that needs sphere control.",
    "mechanics": "Dark Spheres must be placed carefully and thrown with Scatter the Weak.",
    "combos": "Setting up stun combos with her E."
  },
  "Nidalee": {
    "summary": "A form-switching assassin with a hard skillshot.",
    "mechanics": "Javelin Toss accuracy matters a lot.",
    "resources": "Switching forms depends on mana and cooldowns.",
    "combos": "Marking an enemy and following up with a pounce."
  },
  "Elise": {
    "summary": "A jungler that switches between two forms.",
    "combos": "Chain human and spider abilities.",
    "decisions": "Choosing when to switch forms."
  },
  "Jayce": {
    "summary": "A stance-swapping poke champion.",
    "mechanics": "Switching between ranged and melee stances with good timing.",
    "resources": "His kit costs a lot of mana.",
    "combos": "Switching stance in the middle of a combo."
  },
  "Gnar": {
    "summary": "A champion who switches between small and Mega Gnar.",
    "resources": "Rage builds as you fight, and when it fills he transforms.",
    "decisions": "Using Mega Gnar's abilities at the right moment."
  },
  "Hwei": {
    "summary": "A mage with a huge ability set.",
    "mechanics": "Q, W and E each have three versions chosen with extra key presses.",
    "decisions": "Choosing which version to use at each moment."
  },
  "Sylas": {
    "summary": "A skirmisher who steals ultimates.",
    "decisions": "Choosing which enemy ultimate to steal and when to use it."
  },
  "Gangplank": {
    "summary": "A top laner built around barrels.",
    "mechanics": "Placing powder kegs and detonating chains.",
    "resources": "Barrel charges are limited.",
    "decisions": "Where and when to place barrels."
  },
  "Pyke": {
    "summary": "A support who hooks and executes.",
    "mechanics": "His hook has to be accurate, and his ultimate executes low-health enemies.",
    "decisions": "Choosing between supporting his team and assassinating."
  },
  "Bard": {
    "summary": "A roaming support with chimes.",
    "positioning": "He roams and collects chimes.",
    "decisions": "When to leave lane to roam."
  },
  "Yone": {
    "summary": "A fighter with a three-cast Q.",
    "mechanics": "Hitting the third Q for a knock-up and using spirit form for burst.",
    "combos": "Spirit form, third Q, then his ultimate."
  },
  "Orianna": {
    "summary": "A mage that fights through her ball.",
    "mechanics": "Passing the ball to allies and managing its position.",
    "positioning": "Her damage comes from where the ball is.",
    "combos": "Shockwave combos with ally dashes."
  },
  "Garen": {
    "summary": "An easy champion: few buttons and strong sustained fighting. The main risk is being kited by ranged enemies.",
    "positioning": "He is hard to escape with, so staying close to enemies matters."
  },
  "Annie": {
    "summary": "A simple mage: a stun every few abilities and a strong ultimate. Her main weakness is low mobility.",
    "decisions": "Using the stun in the right moment is the main skill."
  },
  "Ashe": {
    "summary": "A simple marksman: slows from her attacks and a global ultimate.",
    "decisions": "Her ultimate has global range, so knowing when to use it matters."
  },
  "Malphite": {
    "summary": "A tank with few buttons; his ultimate is the main skill.",
    "positioning": "Positioning his engage so the ultimate hits many enemies is the whole game."
  },
  "Warwick": {
    "summary": "A fighter who finds low-health enemies by smell, so he is simple to play.",
    "decisions": "Using his ultimate to chase down the right target."
  },
  "Master Yi": {
    "summary": "Simple controls, but he needs good target picking.",
    "decisions": "He stacks kills and can't be controlled in some fights, so choosing when to jump in matters."
  }
};

const DIFFICULTY_BY_CLASS = {
  "Assassin": "Assassins rely on timing: waiting for the right moment, choosing a target, and escaping safely.",
  "Fighter": "Fighters trade in melee range, so spacing and positioning decide most fights.",
  "Mage": "Mages are about spell accuracy and controlling distance.",
  "Marksman": "Marksmen are about positioning and attack rhythm (kiting).",
  "Support": "Supports need map awareness and good timing for their team.",
  "Tank": "Tanks need good engage timing and positioning."
};

const REGIONS = {
  "Demacia": [
    "Garen",
    "Lux",
    "Jarvan IV",
    "Fiora",
    "Galio",
    "Quinn",
    "Poppy",
    "Shyvana",
    "Sona",
    "Vayne",
    "Xin Zhao",
    "Lucian",
    "Kayle",
    "Morgana",
    "Sylas"
  ],
  "Ionia": [
    "Ahri",
    "Akali",
    "Irelia",
    "Karma",
    "Kennen",
    "Lee Sin",
    "Master Yi",
    "Shen",
    "Syndra",
    "Wukong",
    "Xayah",
    "Rakan",
    "Yasuo",
    "Yone",
    "Zed",
    "Jhin",
    "Hwei",
    "Sett",
    "Varus",
    "Kayn",
    "Lillia"
  ],
  "Noxus": [
    "Darius",
    "Draven",
    "Katarina",
    "Cassiopeia",
    "Swain",
    "Talon",
    "Sion",
    "Vladimir",
    "LeBlanc",
    "Kled",
    "Samira",
    "Riven",
    "Rell",
    "Ambessa"
  ],
  "Piltover": [
    "Caitlyn",
    "Jayce",
    "Vi",
    "Camille",
    "Orianna",
    "Heimerdinger",
    "Ezreal"
  ],
  "Zaun": [
    "Jinx",
    "Ekko",
    "Singed",
    "Warwick",
    "Blitzcrank",
    "Dr. Mundo",
    "Twitch",
    "Zac",
    "Viktor",
    "Janna",
    "Renata Glasc",
    "Urgot",
    "Zeri"
  ],
  "Freljord": [
    "Ashe",
    "Sejuani",
    "Tryndamere",
    "Braum",
    "Anivia",
    "Gnar",
    "Lissandra",
    "Nunu & Willump",
    "Olaf",
    "Trundle",
    "Udyr",
    "Volibear"
  ],
  "Shurima": [
    "Azir",
    "Amumu",
    "Nasus",
    "Renekton",
    "Sivir",
    "Rammus",
    "Taliyah",
    "Xerath",
    "Akshan",
    "Naafiri"
  ],
  "Bilgewater": [
    "Fizz",
    "Gangplank",
    "Graves",
    "Illaoi",
    "Miss Fortune",
    "Nautilus",
    "Pyke",
    "Twisted Fate"
  ],
  "Bandle City": [
    "Teemo",
    "Tristana",
    "Veigar",
    "Lulu",
    "Rumble",
    "Ziggs",
    "Corki"
  ],
  "Shadow Isles": [
    "Hecarim",
    "Kalista",
    "Karthus",
    "Maokai",
    "Mordekaiser",
    "Thresh",
    "Viego",
    "Yorick",
    "Gwen",
    "Kindred"
  ],
  "Targon": [
    "Aphelios",
    "Diana",
    "Leona",
    "Pantheon",
    "Soraka",
    "Taric",
    "Zoe",
    "Aurelion Sol"
  ],
  "Ixtal": [
    "Qiyana",
    "Neeko",
    "Malphite",
    "Nidalee",
    "Zyra",
    "Rengar",
    "Skarner",
    "Milio"
  ],
  "The Void": [
    "Cho'Gath",
    "Kassadin",
    "Kha'Zix",
    "Rek'Sai",
    "Vel'Koz",
    "Bel'Veth",
    "Kog'Maw",
    "Malzahar"
  ]
};

const CONNECTIONS = [
  {
    "a": "Garen",
    "b": "Lux",
    "type": "Siblings",
    "note": "Garen is Lux's older brother. They are both part of the Crownguard family of Demacia."
  },
  {
    "a": "Kayle",
    "b": "Morgana",
    "type": "Sisters",
    "note": "Kayle and Morgana are sisters whose paths split: one became an angelic judge, the other a fallen one."
  },
  {
    "a": "Yasuo",
    "b": "Yone",
    "type": "Brothers",
    "note": "Yone is Yasuo's older brother. Yasuo killed him, and Yone returned as a spirit-bound fighter."
  },
  {
    "a": "Darius",
    "b": "Draven",
    "type": "Brothers",
    "note": "Darius is Draven's older brother. They both serve Noxus in very different ways."
  },
  {
    "a": "Katarina",
    "b": "Cassiopeia",
    "type": "Sisters",
    "note": "They are sisters of the Du Couteau family of Noxus."
  },
  {
    "a": "Vi",
    "b": "Jinx",
    "type": "Sisters",
    "note": "Vi and Jinx grew up together in Zaun. Jinx was once called Powder."
  },
  {
    "a": "Vi",
    "b": "Caitlyn",
    "type": "Partners",
    "note": "Caitlyn and Vi work together as enforcers in Piltover."
  },
  {
    "a": "Caitlyn",
    "b": "Jinx",
    "type": "Enemies",
    "note": "Caitlyn has hunted Jinx across Piltover and Zaun."
  },
  {
    "a": "Jinx",
    "b": "Ekko",
    "type": "Childhood friends",
    "note": "Ekko and Jinx knew each other in Zaun's Undercity."
  },
  {
    "a": "Jayce",
    "b": "Viktor",
    "type": "Partners",
    "note": "Jayce and Viktor worked together on Hextech and later ended up on opposite sides."
  },
  {
    "a": "Leona",
    "b": "Diana",
    "type": "Rivals",
    "note": "They serve opposing Targon factions, the Solari and the Lunari."
  },
  {
    "a": "Ashe",
    "b": "Sejuani",
    "type": "Rivals",
    "note": "They lead opposing Freljord tribes, the Avarosans and the Winter's Claw."
  },
  {
    "a": "Ashe",
    "b": "Tryndamere",
    "type": "Partners",
    "note": "Tryndamere and Ashe are close allies who united parts of the Freljord."
  },
  {
    "a": "Jarvan IV",
    "b": "Shyvana",
    "type": "Allies",
    "note": "Shyvana serves Jarvan IV and fights beside him in Demacia."
  },
  {
    "a": "Lucian",
    "b": "Senna",
    "type": "Spouses",
    "note": "Lucian and Senna are husband and wife, bound by the Black Mist."
  },
  {
    "a": "Lucian",
    "b": "Thresh",
    "type": "Enemies",
    "note": "Thresh took Senna's soul, so Lucian hunts him."
  },
  {
    "a": "Nasus",
    "b": "Renekton",
    "type": "Brothers",
    "note": "Nasus and Renekton are brothers from ancient Shurima. Renekton was corrupted."
  },
  {
    "a": "Azir",
    "b": "Sivir",
    "type": "Ancestor and descendant",
    "note": "Sivir is a descendant of Azir, the Emperor of the Sun."
  },
  {
    "a": "Rakan",
    "b": "Xayah",
    "type": "Partners",
    "note": "Rakan and Xayah are partners in rebellion and in life."
  },
  {
    "a": "Miss Fortune",
    "b": "Gangplank",
    "type": "Enemies",
    "note": "Miss Fortune took revenge on Gangplank for what he did to her family."
  },
  {
    "a": "Graves",
    "b": "Twisted Fate",
    "type": "Former partners",
    "note": "Graves and Twisted Fate used to be partners in crime."
  },
  {
    "a": "Ambessa",
    "b": "Mel",
    "type": "Mother and daughter",
    "note": "Ambessa of Noxus is Mel Medarda's mother."
  },
  {
    "a": "Shen",
    "b": "Zed",
    "type": "Former friends",
    "note": "Shen and Zed were friends before Zed left the Kinkou order."
  }
];

const EVOLUTION = [
  {
    "subject": "Aatrox",
    "category": "Reworks",
    "era": "Around 2018",
    "title": "From a health-based fighter to a darkin blade",
    "text": "Aatrox changed from a health-driven fighter into a champion with a lot of aim-and-dodge play.",
    "before": [
      "Used his own health as a resource (Blood Well passive)",
      "A toggled ability that traded health for power"
    ],
    "now": [
      "No resource",
      "A Q with three different attack shapes",
      "A pulling chain W and a dash E",
      "An ultimate that boosts him"
    ]
  },
  {
    "subject": "Irelia",
    "category": "Reworks",
    "era": "Around 2017",
    "title": "From stat-checking to chain-dashing",
    "text": "Irelia moved from a simple, powerful kit to one built around dashing between targets.",
    "before": [
      "Q Bladesurge dashed to a target",
      "Hiten Style toggled bonus damage and healing",
      "Equilibrium Strike stunned some targets",
      "Transcendent Blades fired blades in a line"
    ],
    "now": [
      "Q resets on kills and marked targets",
      "W Defiant Dance reduces damage and hits when released",
      "E Flawless Duet places two blades that stun when they meet",
      "R Vanguard's Edge creates a wall of blades"
    ]
  },
  {
    "subject": "Mordekaiser",
    "category": "Reworks",
    "era": "Around 2017",
    "title": "From a shield brawler to a realm-dragging fighter",
    "text": "Mordekaiser kept his dark theme but changed how he fights.",
    "before": [
      "A shield built from damage he dealt (Iron Man)",
      "A cone attack and a curse as his ultimate"
    ],
    "now": [
      "Death's Grasp pulls enemies",
      "Indestructible shield that heals back",
      "Realm of Death isolates an enemy and steals their stats"
    ]
  },
  {
    "subject": "Skarner",
    "category": "Reworks",
    "era": "Around 2023",
    "title": "A new scorpion with Ixtal roots",
    "text": "Skarner was rebuilt around crystal and terrain, and his story moved to Ixtal.",
    "before": [
      "Crystal Slash and Crystalline Exoskeleton",
      "Fracture and Impale"
    ],
    "now": [
      "Upheaval",
      "Seismic Bastion",
      "Ixtal's Impact",
      "Impale returns"
    ]
  },
  {
    "subject": "Udyr",
    "category": "Reworks",
    "era": "Around 2022",
    "title": "From stances to four abilities",
    "text": "Udyr no longer swaps stances. He now has four abilities he can use together.",
    "before": [
      "Tiger, Turtle, Bear and Phoenix stances",
      "Swapping stances changed his attacks"
    ],
    "now": [
      "Wilding Claw, Iron Mantle, Blazing Stampede and Wingborne Storm",
      "He levels up each ability and can use several in a row"
    ]
  },
  {
    "subject": "Runes",
    "category": "Removed systems",
    "era": "Around 2018",
    "title": "Masteries and old rune pages replaced",
    "text": "League replaced its old talent and rune system with a simpler one.",
    "before": [
      "Masteries (talent trees)",
      "Rune pages with many small stat slots"
    ],
    "now": [
      "Runes Reforged: a keystone, secondary runes and shards",
      "Rune paths such as Precision, Domination, Sorcery, Resolve and Inspiration"
    ]
  },
  {
    "subject": "Dominion",
    "category": "Removed systems",
    "era": "Around 2016",
    "title": "The Crystal Scar map was retired",
    "text": "Dominion was a capture-point mode that Riot removed.",
    "before": [
      "A map with capture points and its own rules"
    ],
    "now": [
      "Retired and no longer playable"
    ]
  },
  {
    "subject": "Twisted Treeline",
    "category": "Removed systems",
    "era": "Around 2019",
    "title": "The three-versus-three map was retired",
    "text": "Twisted Treeline, the 3v3 map, was removed from regular play.",
    "before": [
      "A small map with two lanes and a different jungle"
    ],
    "now": [
      "Retired and no longer playable"
    ]
  }
];

const DIFFICULTY_BY_KEY = {};
Object.entries(DIFFICULTY_NOTES).forEach(([name, notes]) => { DIFFICULTY_BY_KEY[normalizeName(name)] = notes; });

const REGION_BY_KEY = {};
Object.entries(REGIONS).forEach(([region, names]) => {
  names.forEach(name => { REGION_BY_KEY[normalizeName(name)] = region; });
});

const CONNECTIONS_BY_KEY = new Map();
CONNECTIONS.forEach(link => {
  [[link.a, link.b], [link.b, link.a]].forEach(([me, other]) => {
    const key = normalizeName(me);
    if (!CONNECTIONS_BY_KEY.has(key)) CONNECTIONS_BY_KEY.set(key, []);
    CONNECTIONS_BY_KEY.get(key).push({ other, type: link.type, note: link.note });
  });
});

// A reusable "type a champion" page (used by Difficulty and Lore)
function createChampionPage({ searchId, resultId, datalistId, emptyText, chipAttribute, render }) {
  let ready = false;

  const handle = () => {
    if (!ready) return;
    const result = $(resultId);
    const term = $(searchId).value.trim();
    const found = searchChampions(term);

    if (found.status === 'one') render(found.champion);
    else if (found.status === 'many') result.innerHTML = championChipsHtml(found.matches, chipAttribute);
    else if (found.status === 'none') result.innerHTML = messageHtml(`No champion found for "${escapeHtml(term)}".`);
    else result.innerHTML = messageHtml(emptyText);
  };

  const open = async () => {
    if (ready) return;
    const result = $(resultId);
    result.innerHTML = loadingHtml('Loading champions...');
    await loadChampions();
    if (!champions.length) {
      result.innerHTML = messageHtml('Failed to load data. Please try again later.', true);
      return;
    }
    fillChampionDatalist(datalistId);
    ready = true;
    handle();
  };

  const pick = championId => {
    const champion = champions.find(c => c.id === championId);
    if (!champion) return;
    $(searchId).value = champion.name;
    render(champion);
  };

  return { open, handle, pick };
}

/* ---- Difficulty explained ---- */
const DIFFICULTY_FACTORS = [
  ['mechanics', 'Mechanics & animation'],
  ['positioning', 'Positioning'],
  ['resources', 'Resource management'],
  ['combos', 'Combos'],
  ['decisions', 'Decision-making']
];

function renderDifficulty(champion) {
  const notes = DIFFICULTY_BY_KEY[normalizeName(champion.name)];
  const classNotes = champion.tags.map(tag => DIFFICULTY_BY_CLASS[tag]).filter(Boolean);
  const level = DIFFICULTY_NAMES[champion.difficulty];
  const score = champion.difficultyScore ? `${champion.difficultyScore}/10` : 'not rated';

  const factors = notes
    ? DIFFICULTY_FACTORS.filter(([key]) => notes[key])
        .map(([key, label]) => `<div class="factor"><h5>${label}</h5><p>${escapeHtml(notes[key])}</p></div>`).join('')
    : '';

  $('difficulty-result').innerHTML = `
    <div class="build-card">
      <div class="build-header">
        <img src="${champion.image}" alt="${escapeHtml(champion.name)}" width="96" height="96" />
        <div>
          <h3>${escapeHtml(champion.name)}</h3>
          <p class="build-title">${escapeHtml(champion.title)}</p>
          <p class="build-meta">Riot's rating: <strong>${score}</strong> · Shown on this site as: <strong>${level}</strong></p>
        </div>
      </div>

      <h4>Why this difficulty?</h4>
      <p class="build-tip">${notes ? escapeHtml(notes.summary) : 'No detailed breakdown for this champion yet. Here is what we know from Riot\'s rating and their class.'}</p>
      ${factors ? `<div class="factor-grid">${factors}</div>` : ''}

      ${classNotes.length ? `<h4>What their class asks of you</h4><p class="build-tip">${classNotes.map(escapeHtml).join(' ')}</p>` : ''}
      <p class="counter-note">Difficulty is partly personal. These notes describe what usually makes a champion hard, not a rule.</p>
    </div>`;
}

const difficultyPage = createChampionPage({
  searchId: 'difficulty-search', resultId: 'difficulty-result', datalistId: 'difficulty-champions',
  emptyText: 'Type a champion name to see why it is easy or hard to play.',
  chipAttribute: 'data-difficulty-champion', render: renderDifficulty
});

/* ---- Lore and connections ---- */
let loreRequest = 0;

const universeSlug = champ => (champ.id === 'MonkeyKing' ? 'wukong' : champ.id.toLowerCase());

async function renderLore(champion) {
  const result = $('lore-result');
  const requestId = ++loreRequest;
  result.innerHTML = loadingHtml('Loading lore...');

  try {
    const champ = await getChampionDetails(champion.id);
    if (requestId !== loreRequest) return;

    const region = REGION_BY_KEY[normalizeName(champ.name)];
    const links = CONNECTIONS_BY_KEY.get(normalizeName(champ.name)) || [];
    const story = String(champ.lore || '').replace(/<br\s*\/?>/gi, '\n');

    const linkItems = links.map(link => {
      const other = champions.find(c => normalizeName(c.name) === normalizeName(link.other));
      const who = other
        ? `<button type="button" class="chip" data-lore-champion="${escapeHtml(other.id)}">${escapeHtml(other.name)}</button>`
        : `<strong>${escapeHtml(link.other)}</strong>`;
      return `<li>${who} <strong>${escapeHtml(link.type)}.</strong> ${escapeHtml(link.note)}</li>`;
    }).join('');

    result.innerHTML = `
      <div class="build-card lore-card">
        <div class="build-header">
          <img src="${CDN}/cdn/${DATA_VERSION}/img/champion/${champ.image.full}" alt="${escapeHtml(champ.name)}" width="96" height="96" />
          <div>
            <h3>${escapeHtml(champ.name)}</h3>
            <p class="build-title">${escapeHtml(champ.title)}</p>
            <p class="build-meta">${region ? `Region: <strong>${region}</strong>` : 'Region: not listed here yet'}</p>
          </div>
        </div>

        <h4>Biography (from Riot)</h4>
        <p class="lore-text">${escapeHtml(story)}</p>

        <h4>Connections</h4>
        ${linkItems ? `<ul class="connection-list">${linkItems}</ul>` : '<p class="build-tip">No connections are listed for this champion yet.</p>'}

        <p class="counter-note">The biography is Riot's own text. Regions and connections are short summaries of Riot's lore written for this site, so check the full story on Riot's
          <a href="https://universe.leagueoflegends.com/en_US/champion/${universeSlug(champ)}/" target="_blank" rel="noopener noreferrer">Universe page</a> for the official version.</p>
      </div>`;
  } catch (error) {
    console.error('Error loading lore:', error);
    if (requestId === loreRequest) {
      result.innerHTML = messageHtml('Could not load this champion\'s lore. Please try again later.', true);
    }
  }
}

const lorePage = createChampionPage({
  searchId: 'lore-search', resultId: 'lore-result', datalistId: 'lore-champions',
  emptyText: 'Type a champion name to read their story and see who they are connected to.',
  chipAttribute: 'data-lore-champion', render: renderLore
});

/* ==========================================================================
   Viego helper: a small mascot that follows the cursor and answers questions
   using this site's own guides. It is NOT a live AI: it matches your question
   against the data on these pages and sends you to the right page.
   ========================================================================== */
const PAGE_SEARCH_INPUT = {
  champions: 'search', items: 'item-search', builds: 'build-search', skins: 'skin-search',
  interactions: 'interaction-search', itemguide: 'itemguide-search', difficulty: 'difficulty-search',
  lore: 'lore-search', evolution: 'evolution-search', runes: 'rune-search'
};

const PAGE_LABELS = {
  home: 'Home', champions: 'Champions', items: 'Items', builds: 'Builds', skins: 'Skins',
  interactions: 'Interactions', itemguide: 'Item Guide', difficulty: 'Difficulty',
  lore: 'Lore', evolution: 'Evolution', runes: 'Runes'
};

const CHAT_PAGE_NAMES = {
  home: ['home', 'homepage', 'main page'], champions: ['champions', 'champion list'],
  items: ['items', 'item list'], builds: ['builds', 'build page'], skins: ['skins', 'skin page'],
  interactions: ['interactions', 'hidden interactions'], itemguide: ['item guide'],
  difficulty: ['difficulty page'], lore: ['lore', 'lore page'],
  evolution: ['evolution', 'evolution archive'], runes: ['runes', 'rune page']
};

// Opens a page and (optionally) fills its search box
function navigateTo(page, term = '') {
  const link = document.querySelector(`.nav-link[href="#${page}"]`);
  if (!link) return;
  link.click();

  const input = PAGE_SEARCH_INPUT[page] && $(PAGE_SEARCH_INPUT[page]);
  if (input) {
    input.value = term;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const CHAT_STOPWORDS = new Set(('the and for with what who how why does did can are you your about this that tell show give which best good when where from into please have has was were will would should could any some there their them they its a an of to in on is it me my i do be or not vs').split(' '));

const CHAT_INTENTS = {
  counters: ['counter', 'counters', 'beat', 'beats', 'against', 'weak to', 'matchup', 'matchups'],
  position: ['position', 'positions', 'role', 'lane', 'main position', 'main role'],
  difficulty: ['difficult', 'difficulty', 'hard', 'easy', 'hardest', 'easiest', 'beginner'],
  build: ['build', 'builds', 'itemize', 'items for', 'what to buy', 'core items', 'boots'],
  skins: ['skin', 'skins', 'chroma', 'chromas', 'price', 'prices', 'cost', 'rp'],
  lore: ['lore', 'story', 'region', 'family', 'sister', 'brother', 'friend', 'friends', 'rival', 'rivals', 'enemy', 'related', 'connection', 'connections'],
  evolution: ['rework', 'reworked', 'old', 'used to', 'removed', 'history', 'changed', 'before'],
  interactions: ['interaction', 'interactions', 'block', 'blocks', 'blocked']
};

const CHAT_SUGGESTIONS = [
  'Who counters Yasuo?', 'What does Wind Wall block?', 'Build for Ahri',
  'Tell me about Lux', 'Why is Riven hard?', 'Lifesteal vs omnivamp'
];

const chatNorm = text => String(text).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9 ]/g, ' ');

function chatTokens(text) {
  return String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/'s\b/g, '').replace(/'/g, '').match(/[a-z0-9]+/g) || [];
}

const chatStem = token => (token.length > 4 ? token.replace(/(ing|ed|es|s)$/, '') : token);

let championKeyMap = null;
let championKeyMapSize = 0;

function championKeys() {
  if (!championKeyMap || championKeyMapSize !== champions.length) {
    championKeyMap = new Map();
    champions.forEach(champion => {
      [normalizeName(champion.name), normalizeName(champion.id)].forEach(key => championKeyMap.set(key, champion));
      if (champion.name.includes('&')) championKeyMap.set(normalizeName(champion.name.split('&')[0]), champion);
      if (champion.name === 'Renata Glasc') championKeyMap.set('renata', champion);
    });
    championKeyMapSize = champions.length;
  }
  return championKeyMap;
}

function findChampionInTokens(tokens) {
  const map = championKeys();
  for (let size = 3; size >= 1; size--) {
    for (let i = 0; i + size <= tokens.length; i++) {
      const used = tokens.slice(i, i + size);
      const champion = map.get(used.join(''));
      if (champion) return { champion, used };
    }
  }
  return null;
}

// Finds the best matching card in Interactions, Item Guide or Evolution
function searchKnowledge(tokens) {
  const words = tokens.filter(t => t.length >= 3 && !CHAT_STOPWORDS.has(t)).map(chatStem);
  if (!words.length) return null;

  const entries = [
    ...INTERACTIONS.map(card => ({ card, page: 'interactions' })),
    ...ITEM_GUIDE.map(card => ({ card, page: 'itemguide' })),
    ...EVOLUTION.map(card => ({ card, page: 'evolution' }))
  ];

  let best = null;
  entries.forEach(entry => {
    const c = entry.card;
    const head = chatNorm([c.subject, c.title].join(' '));
    const body = chatNorm([c.text, ...(c.yes || []), ...(c.no || []), ...(c.before || []), ...(c.now || [])].join(' '));
    let score = 0;
    let headWord = '';
    words.forEach(word => {
      if (head.includes(word)) { score += 3; headWord = headWord || word; }
      else if (body.includes(word)) score += 1;
    });
    if (!best || score > best.score) best = { ...entry, score, term: headWord || words[0] };
  });
  return best && best.score >= 3 ? best : null;
}

const firstSentence = text => (String(text).match(/^.*?[.!?](\s|$)/) || [text])[0].trim();

async function championAnswer(champion, tokens, has) {
  const key = normalizeName(champion.name);
  const name = champion.name;
  const lines = [];
  const links = [];
  const wanted = Object.keys(CHAT_INTENTS).filter(intent => has(CHAT_INTENTS[intent]));

  const position = POSITIONS_BY_KEY[key];
  const notes = DIFFICULTY_BY_KEY[key];
  const region = REGION_BY_KEY[key];

  if (!wanted.length) {
    // Maybe they asked about a specific mechanic ("yasuo wind wall")
    const rest = tokens.filter(t => !normalizeName(name).includes(t) || t.length < 3);
    const hit = searchKnowledge(rest);
    if (hit && hit.score >= 3) return knowledgeAnswer(hit);

    lines.push(`${name}, ${champion.title}, is a ${champion.tags.join(' / ')} champion.`);
    if (position) lines.push(`Usually played ${position}. Riot rates the difficulty ${champion.difficultyScore || '?'}/10 (${DIFFICULTY_NAMES[champion.difficulty]}).`);
    if (region) lines.push(`Region: ${region}.`);
    links.push(
      { label: `Build for ${name}`, page: 'builds', term: name },
      { label: `${name}'s skins`, page: 'skins', term: name },
      { label: `${name}'s lore`, page: 'lore', term: name },
      { label: `Why ${name} is easy or hard`, page: 'difficulty', term: name }
    );
    return { lines, links };
  }

  if (wanted.includes('counters')) {
    const list = COUNTERS_BY_KEY[key];
    lines.push(list ? `Typical counters for ${name}: ${list.join(', ')}. This is general matchup knowledge, not live win rates.` : `I don't have counter info for ${name} yet.`);
    links.push({ label: `Open ${name} in Champions`, page: 'champions', term: name });
  }
  if (wanted.includes('position')) {
    lines.push(position ? `${name}'s main position is ${position}.` : `I don't have a main position for ${name} yet.`);
    if (!links.some(l => l.page === 'champions')) links.push({ label: `Open ${name} in Champions`, page: 'champions', term: name });
  }
  if (wanted.includes('difficulty')) {
    lines.push(`Riot rates ${name} ${champion.difficultyScore || '?'}/10 (${DIFFICULTY_NAMES[champion.difficulty]} here).${notes ? ' ' + notes.summary : ''}`);
    links.push({ label: `Why ${name} is easy or hard`, page: 'difficulty', term: name });
  }
  if (wanted.includes('build')) {
    const archetype = BUILD_ARCHETYPES[ARCHETYPE_BY_KEY[key] || guessArchetype(champion)];
    lines.push(`${name} uses the "${archetype.label}" build: ${archetype.boots}, then ${archetype.core.join(', ')}. This is a general build, not live win-rate data.`);
    links.push({ label: `Open ${name}'s build`, page: 'builds', term: name });
  }
  if (wanted.includes('skins')) {
    try {
      const details = await getChampionDetails(champion.id);
      const { skins, chromasBySkin } = splitSkinsAndChromas(details);
      const chromas = [...chromasBySkin.values()].reduce((sum, list) => sum + list.length, 0);
      lines.push(`${name} has ${skins.length} skin${skins.length === 1 ? '' : 's'}${chromas ? ` and ${chromas} chroma${chromas === 1 ? '' : 's'}` : ''}. The Skins page shows each one with a picture and price.`);
    } catch (_) {
      lines.push(`The Skins page shows all of ${name}'s skins with pictures and prices.`);
    }
    links.push({ label: `Open ${name}'s skins`, page: 'skins', term: name });
  }
  if (wanted.includes('lore')) {
    const connections = CONNECTIONS_BY_KEY.get(key) || [];
    lines.push(region ? `${name} is from ${region}.` : `I don't have a region for ${name} yet.`);
    if (connections.length) lines.push(`Connections: ${connections.map(c => `${c.other} (${c.type})`).join(', ')}.`);
    links.push({ label: `Read ${name}'s lore`, page: 'lore', term: name });
  }
  if (wanted.includes('evolution')) {
    const entries = EVOLUTION.filter(card => normalizeName(card.subject) === key);
    lines.push(entries.length ? `${name} was reworked: ${entries[0].text}` : `I don't have an evolution entry for ${name} yet.`);
    links.push({ label: 'Open the Evolution archive', page: 'evolution', term: entries.length ? name : '' });
  }
  if (wanted.includes('interactions')) {
    const cards = INTERACTIONS_BY_CHAMPION.get(key) || [];
    lines.push(cards.length ? `Hidden interactions for ${name}: ${cards.map(c => `${c.title} (${firstSentence(c.text)})`).join(' ')}` : `I don't have hidden interactions for ${name} yet.`);
    links.push({ label: 'Open Interactions', page: 'interactions', term: cards.length ? name : '' });
  }
  return { lines, links };
}

function knowledgeAnswer(hit) {
  const card = hit.card;
  const lines = [`${card.title}: ${card.text}`];
  if (card.tip) lines.push(`Tip: ${card.tip}`);
  return { lines, links: [{ label: `See more in ${PAGE_LABELS[hit.page]}`, page: hit.page, term: hit.term }] };
}

async function answerQuestion(text) {
  const tokens = chatTokens(text);
  const joined = ` ${tokens.join(' ')} `;
  const has = list => list.some(phrase => joined.includes(` ${phrase} `));

  if (!tokens.length) return { lines: ['Ask me about a champion, an item or a mechanic.'], links: [] };

  if (has(['win rate', 'winrate', 'tier list', 'pick rate', 'ban rate', 'patch notes', 'current patch', 'meta'])) {
    return {
      lines: ["I don't have live win rates, tier lists or patch stats. A stats site like u.gg does. I can help with builds, counters, positions, skins, lore, difficulty and game mechanics."],
      links: []
    };
  }

  const found = findChampionInTokens(tokens);
  if (found) return championAnswer(found.champion, tokens, has);

  // "take me to runes"
  if (has(['go to', 'take me to', 'open', 'show me', 'bring me to', 'navigate to'])) {
    const page = Object.keys(CHAT_PAGE_NAMES).find(p => CHAT_PAGE_NAMES[p].some(name => joined.includes(` ${name} `)));
    if (page) {
      navigateTo(page);
      return { lines: [`Taking you to the ${PAGE_LABELS[page]} page.`], links: [] };
    }
  }

  if (tokens.length <= 4 && has(['hi', 'hello', 'hey', 'help', 'thanks', 'thank you', 'what can you do'])) {
    return {
      lines: ['I can answer questions from this site: champion builds, counters, main positions, skins, lore, difficulty, items and game mechanics. I can also open the right page for you.'],
      links: [],
      chips: CHAT_SUGGESTIONS
    };
  }

  const hit = searchKnowledge(tokens);
  if (hit) return knowledgeAnswer(hit);

  if (has(['rune', 'runes', 'keystone'])) {
    return { lines: ['The Runes page lists every rune, grouped by rune tree.'], links: [{ label: 'Open Runes', page: 'runes', term: '' }] };
  }
  if (has(['item', 'items'])) {
    return { lines: ['The Items page lists every item, and the Item Guide explains how items work with abilities.'], links: [{ label: 'Open Items', page: 'items', term: '' }, { label: 'Open Item Guide', page: 'itemguide', term: '' }] };
  }

  return {
    lines: ["I'm not sure about that one. I answer from this site's guides, so try a champion name, an item, or a mechanic like Wind Wall."],
    links: [],
    chips: CHAT_SUGGESTIONS
  };
}

/* ---- The chat window and the cursor follower ---- */
const MASCOT_FOLLOW_KEY = 'leaguepedia-mascot-follow';

function chatMessageHtml(reply) {
  const paragraphs = reply.lines.map(line => `<p>${escapeHtml(line)}</p>`).join('');
  const links = (reply.links || []).map(link =>
    `<button type="button" class="chat-link" data-go="${escapeHtml(link.page)}" data-term="${escapeHtml(link.term || '')}">${escapeHtml(link.label)}</button>`).join('');
  const chips = (reply.chips || []).map(chip =>
    `<button type="button" class="chat-chip" data-ask="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`).join('');
  return `${paragraphs}${links ? `<div class="chat-links">${links}</div>` : ''}${chips ? `<div class="chat-links">${chips}</div>` : ''}`;
}

function initAssistant() {
  const button = $('mascot-button');
  const panel = $('chat-panel');
  const follower = $('mascot-follower');
  const log = $('chat-log');
  const input = $('chat-input');
  if (!button || !panel || !follower || !log || !input) return;

  const addMessage = (role, reply) => {
    const message = document.createElement('div');
    message.className = `chat-msg ${role}`;
    message.innerHTML = chatMessageHtml(reply);
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
    return message;
  };

  let greeted = false;
  let open = false;
  let follow = false;
  let seen = false;
  let tx = 0, ty = 0, x = 0, y = 0, frame = 0;

  const canFollow = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  follow = canFollow && !reduced;
  try {
    const saved = localStorage.getItem(MASCOT_FOLLOW_KEY);
    if (saved) follow = saved === 'on' && canFollow;
  } catch (_) { /* no saved setting */ }

  const toggle = $('mascot-follow-toggle');
  const refreshFollower = () => { follower.hidden = !(follow && seen && !open); };

  if (toggle) {
    toggle.checked = follow;
    toggle.disabled = !canFollow;
    toggle.addEventListener('change', () => {
      follow = toggle.checked;
      try { localStorage.setItem(MASCOT_FOLLOW_KEY, follow ? 'on' : 'off'); } catch (_) { /* ignore */ }
      refreshFollower();
    });
  }

  const tick = () => {
    const dx = tx - x;
    const dy = ty - y;
    x += dx * 0.14;
    y += dy * 0.14;
    follower.style.transform = `translate(${x}px, ${y}px)`;
    // The figure leans into the direction it is moving and hops while it travels
    follower.style.setProperty('--lean', `${Math.max(-14, Math.min(14, dx * 0.25))}deg`);
    follower.classList.toggle('moving', Math.abs(dx) + Math.abs(dy) > 6);
    frame = (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) ? requestAnimationFrame(tick) : 0;
  };

  window.addEventListener('pointermove', event => {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    tx = Math.min(event.clientX + 14, window.innerWidth - 60);
    ty = Math.min(event.clientY + 4, window.innerHeight - 78);
    if (!seen) { x = tx; y = ty; seen = true; refreshFollower(); }
    if (follow && !frame) frame = requestAnimationFrame(tick);
  }, { passive: true });

  const setOpen = value => {
    open = value;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    refreshFollower();
    if (open) {
      loadChampions();   // so champion names are known when the first question arrives
      if (!greeted) {
        greeted = true;
        addMessage('bot', {
          lines: ["Hi, I'm Viego. Ask me about a champion, an item or a mechanic. I answer from this site's guides (not a live AI), and I can open the right page for you."],
          links: [],
          chips: CHAT_SUGGESTIONS
        });
      }
      input.focus();
    } else {
      button.focus();
    }
  };

  const send = async rawText => {
    const text = rawText.trim();
    if (!text) return;
    addMessage('user', { lines: [text] });
    const pending = addMessage('bot', { lines: ['...'] });
    let reply;
    try {
      await loadChampions();
      reply = await answerQuestion(text);
    } catch (error) {
      console.error('Assistant error:', error);
      reply = { lines: ['Sorry, something went wrong. Please try again.'], links: [] };
    }
    pending.innerHTML = chatMessageHtml(reply);
    log.scrollTop = log.scrollHeight;
  };

  button.addEventListener('click', () => setOpen(!open));
  $('chat-close').addEventListener('click', () => setOpen(false));
  $('chat-form').addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value;
    input.value = '';
    send(text);
  });

  log.addEventListener('click', event => {
    const go = event.target.closest('[data-go]');
    if (go) {
      navigateTo(go.getAttribute('data-go'), go.getAttribute('data-term') || '');
      if (window.innerWidth < 700) setOpen(false);
      return;
    }
    const ask = event.target.closest('[data-ask]');
    if (ask) send(ask.getAttribute('data-ask'));
  });

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) setOpen(false);
  });
}

/* ==========================================================================
   Menu (the three-bar button that lists every page)
   ========================================================================== */
function initMenu() {
  const toggle = $('menu-toggle');
  const menu = $('site-menu');
  if (!toggle || !menu) return;

  const setOpen = open => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  toggle.addEventListener('click', () => setOpen(menu.hidden));
  menu.addEventListener('click', e => {
    if (e.target.closest('.nav-link')) setOpen(false);   // picking a page closes the menu
  });
  document.addEventListener('click', e => {
    if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
}

/* ==========================================================================
   Navigation + start-up (everything is wired exactly once)
   ========================================================================== */
function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  // Only the page sections: the chat window and popups must never be hidden by navigation
  const sections = document.querySelectorAll('main > section');
  const loaders = {
    champions: loadChampions, items: loadItems, builds: openBuilds, skins: openSkins,
    difficulty: difficultyPage.open, lore: lorePage.open, runes: loadRunes,
    interactions: renderInteractions, itemguide: renderItemGuide, evolution: renderEvolution
  };
  const pageIds = Array.from(navLinks).map(link => link.getAttribute('href').substring(1));

  const showPage = (requestedId, push) => {
    const targetId = pageIds.includes(requestedId) ? requestedId : 'home';

    navLinks.forEach(link => {
      const active = link.getAttribute('href') === `#${targetId}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    sections.forEach(section => {
      const isTarget = section.id === targetId;
      section.style.display = isTarget ? 'block' : 'none';
      section.classList.toggle('active', isTarget);
    });

    // A new history entry makes the browser's Back button and page links work
    if (push && window.history && window.history.pushState && window.location.hash !== `#${targetId}`) {
      window.history.pushState(null, '', `#${targetId}`);
    }

    window.scrollTo(0, 0);
    if (loaders[targetId]) loaders[targetId]();
  };

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showPage(link.getAttribute('href').substring(1), true);
    });
  });

  window.addEventListener('popstate', () => showPage(window.location.hash.substring(1), false));

  // Clicking the logo takes you back Home
  const logo = document.getElementById('logo-home');
  const homeLink = document.querySelector('.nav-link[href="#home"]');
  if (logo && homeLink) {
    logo.addEventListener('click', e => {
      e.preventDefault();
      homeLink.click();
    });
  }

  // Open the page named in the address (for example .../#builds), or Home
  showPage(window.location.hash.substring(1), false);
}

function initFilters() {
  const on = (id, event, handler) => {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
  };

  // Champions
  on('class-filter', 'change', applyFilters);
  on('difficulty-filter', 'change', applyFilters);
  on('search', 'input', debounce(applyFilters));

  // Items
  on('item-search', 'input', debounce(applyItemFilters));
  on('availability-filter', 'change', applyItemFilters);
  on('item-category', 'change', applyItemFilters);
  on('price-min', 'input', debounce(applyItemFilters));
  on('price-max', 'input', debounce(applyItemFilters));

  // Item Guide, Evolution, Difficulty, Lore
  on('itemguide-search', 'input', debounce(renderItemGuide));
  on('itemguide-category', 'change', renderItemGuide);
  on('evolution-search', 'input', debounce(renderEvolution));
  on('evolution-category', 'change', renderEvolution);
  on('difficulty-search', 'input', debounce(difficultyPage.handle, 200));
  on('lore-search', 'input', debounce(lorePage.handle, 200));

  // Interactions
  on('interaction-search', 'input', debounce(renderInteractions));
  on('interaction-category', 'change', renderInteractions);

  // Builds and Skins
  on('build-search', 'input', debounce(handleBuildSearch, 200));
  on('skin-search', 'input', debounce(handleSkinSearch, 200));

  // Runes
  on('rune-tree-filter', 'change', applyRunesFilters);
  on('rune-search', 'input', debounce(applyRunesFilters));
}

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFilters();
  initModals();
  initMenu();
  initAssistant();
  onCardActivate('champion-grid', 'data-champion', showChampionDetails);
  onCardActivate('item-grid', 'data-item', showItemDetails);
  onCardActivate('build-result', 'data-item', showItemDetails);
  onCardActivate('build-result', 'data-build-champion', pickBuildChampion);
  onCardActivate('difficulty-result', 'data-difficulty-champion', difficultyPage.pick);
  onCardActivate('lore-result', 'data-lore-champion', lorePage.pick);
  onCardActivate('skin-result', 'data-skin', showSkin);
  onCardActivate('skin-result', 'data-skin-champion', pickSkinChampion);
});
