
  // Application State
  let champions = [];
  let filteredChampions = [];

  let items = [];
  let filteredItems = [];

  const DATA_VERSION = '15.14.1';
  const CHAMPION_API = `https://ddragon.leagueoflegends.com/cdn/${DATA_VERSION}/data/en_US/champion.json`;
  const ITEM_API = `https://ddragon.leagueoflegends.com/cdn/${DATA_VERSION}/data/en_US/item.json`;

  // Navigation System
  function initNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section');

    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);

        navLinks.forEach(l => {
          l.classList.remove('active');
          l.removeAttribute('aria-current');
        });
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');

        sections.forEach(section => {
          if (section.id === targetId) {
            section.style.display = 'block';
            section.classList.add('active');
          } else {
            section.style.display = 'none';
            section.classList.remove('active');
          }
        });

        if (targetId === 'champions' && champions.length === 0) {
          loadChampions();
        }
        if (targetId === 'items' && items.length === 0) {
          loadItems();
        }
      });
    });
  }

  // Champion Data Loading with Even Difficulty Distribution
  async function loadChampions() {
    try {
      showChampionLoading();
      const response = await fetch(CHAMPION_API);
      if (!response.ok) throw new Error('Failed to fetch champion data');

      const data = await response.json();
      const championList = Object.values(data.data);
      
      // Sort champions by name for consistent distribution
      championList.sort((a, b) => a.name.localeCompare(b.name));
      
      // Distribute difficulties evenly across all champions
      const totalChampions = championList.length;
      const championsPerDifficulty = Math.floor(totalChampions / 3);
      const remainder = totalChampions % 3;
      
      champions = championList.map((champion, index) => {
        let difficulty;
        if (index < championsPerDifficulty + (remainder > 0 ? 1 : 0)) {
          difficulty = 1; // Easy
        } else if (index < 2 * championsPerDifficulty + (remainder > 1 ? 1 : 0)) {
          difficulty = 2; // Moderate
        } else {
          difficulty = 3; // Hard
        }

        return {
          id: champion.id,
          name: champion.name,
          title: champion.title,
          tags: champion.tags,
          difficulty: difficulty,
          image: `https://ddragon.leagueoflegends.com/cdn/${DATA_VERSION}/img/champion/${champion.image.full}`,
          key: champion.key
        };
      });

      filteredChampions = [...champions];
      renderChampions();
    } catch (error) {
      console.error('Error loading champions:', error);
      showChampionError('Failed to load champion data. Please try again later.');
    }
  }

  function renderChampions() {
    const grid = document.getElementById('champion-grid');

    if (filteredChampions.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #c8aa6e; font-size: 1.2rem;">No champions found matching your filters.</div>';
      return;
    }

    const difficultyNames = { 1: 'Easy', 2: 'Moderate', 3: 'Hard' };

    grid.innerHTML = filteredChampions.map(champion => `
      <div class="champion" tabindex="0" data-champion="${champion.id}">
        <img src="${champion.image}" alt="${champion.name}" loading="lazy" />
        <div class="champion-info">
          <div class="champion-name">${champion.name}</div>
          <div class="champion-tags">${champion.tags.join(' • ')} | ${difficultyNames[champion.difficulty]}</div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.champion').forEach(el => {
      el.addEventListener('click', () => showChampionDetails(el.dataset.champion));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showChampionDetails(el.dataset.champion);
        }
      });
    });
  }

  function applyFilters() {
    const classFilter = document.getElementById('class-filter').value;
    const difficultyFilter = document.getElementById('difficulty-filter').value;
    const searchTerm = document.getElementById('search').value.toLowerCase();

    filteredChampions = champions.filter(champion => {
      const matchesClass = !classFilter || champion.tags.includes(classFilter);
      const matchesDifficulty = !difficultyFilter || champion.difficulty === parseInt(difficultyFilter, 10);
      const matchesSearch = !searchTerm || champion.name.toLowerCase().includes(searchTerm);
      return matchesClass && matchesDifficulty && matchesSearch;
    });

    renderChampions();
  }

  function showChampionLoading() {
    const grid = document.getElementById('champion-grid');
    grid.innerHTML = `
      <div class="loading" style="grid-column: 1 / -1;">
        <div class="spinner"></div>
        Loading champions...
      </div>
    `;
  }

  function showChampionError(message) {
    const grid = document.getElementById('champion-grid');
    grid.innerHTML = `<div style="color: #c84a4a; text-align:center; grid-column: 1 / -1;">${message}</div>`;
  }

  function showChampionDetails(championId) {
    const champion = champions.find(c => c.id === championId);
    if (!champion) return;

    const difficultyNames = { 1: 'Easy', 2: 'Moderate', 3: 'Hard' };
    alert(`${champion.name} - ${champion.title}\n\nClass: ${champion.tags.join(', ')}\nDifficulty: ${difficultyNames[champion.difficulty]}`);
  }

  // Items Data Loading with Enhanced Filtering
  async function loadItems() {
    try {
      showItemLoading();
      const response = await fetch(ITEM_API);
      if (!response.ok) throw new Error('Failed to fetch item data');

      const data = await response.json();

      // Filter out items that are not actually in the game
      items = Object.entries(data.data)
        .filter(([id, item]) => {
          // Basic filters
          if (!item.name || item.name === 'Unknown') return false;
          
          // Check if item is available on Summoner's Rift (map 11)
          if (!item.maps || !item.maps['11']) return false;
          
          // Check if item is purchasable
          if (item.gold && item.gold.purchasable === false) return false;
          
          // Filter out items with no gold cost and no build path (usually removed/special items)
          if (!item.gold || (item.gold.total === 0 && (!item.from || item.from.length === 0))) return false;
          
          // Filter out items that are clearly not meant for normal gameplay
          const excludeNames = [
            'Poro-Snax', 'Total Biscuit of Everlasting Will', 'Slightly Magical Footware',
            'Magical Footwear', 'Biscuit Delivery', 'Time Warp Tonic', 'Approach Velocity',
            'Perfect Timing', 'Hextech Flashtraption', 'Ghost Poro', 'Eyeball Collection',
            'Zombie Ward', 'Treasure Hunter', 'Ingenious Hunter', 'Relentless Hunter',
            'Ultimate Hunter', 'Presence of Mind', 'Legend: Alacrity', 'Legend: Tenacity',
            'Legend: Bloodline', 'Coup de Grace', 'Cut Down', 'Last Stand'
          ];
          
          if (excludeNames.some(excludeName => item.name.includes(excludeName))) return false;
          
          return true;
        })
        .map(([id, item]) => ({
          id: id,
          name: item.name,
          description: item.description,
          plaintext: item.plaintext,
          image: `https://ddragon.leagueoflegends.com/cdn/${DATA_VERSION}/img/item/${item.image.full}`,
          gold: item.gold?.total || 0,
          tags: item.tags || [],
          purchasable: item.gold?.purchasable !== false,
          maps: item.maps || {},
          inGame: true // All items that pass our filter are considered in-game
        }));

      filteredItems = [...items];
      renderItems();
      initItemFilters();
    } catch (error) {
      console.error('Error loading items:', error);
      showItemError('Failed to load items. Please try again later.');
    }
  }

  function renderItems() {
    const grid = document.getElementById('item-grid');
    if (!grid) return;

    if (filteredItems.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #c8aa6e; font-size: 1.2rem;">No items found matching your filters.</div>';
      return;
    }

    grid.innerHTML = filteredItems.map(item => `
      <div class="champion" tabindex="0" data-item="${item.id}">
        <img src="${item.image}" alt="${item.name}" loading="lazy" />
        <div class="champion-info">
          <div class="champion-name">${item.name}</div>
          <div class="champion-tags">
            ${item.gold > 0 ? `${item.gold}g` : 'Free'} | 
            ${item.tags.includes('Boots') ? 'Boots' : 
              item.gold > 2500 ? 'Legendary' : 
              item.gold > 1000 ? 'Epic' : 
              item.gold > 0 ? 'Basic' : 'Special'}
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('[data-item]').forEach(el => {
      el.addEventListener('click', () => showItemDetails(el.dataset.item));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showItemDetails(el.dataset.item);
        }
      });
    });
  }

  function applyItemFilters() {
    const searchTerm = document.getElementById('item-search').value.toLowerCase();
    const typeFilter = document.getElementById('availability-filter').value;
    const categoryFilter = document.getElementById('item-category').value;
    const minPrice = parseInt(document.getElementById('price-min').value) || 0;
    const maxPrice = parseInt(document.getElementById('price-max').value) || Infinity;

    filteredItems = items.filter(item => {
      // Search filter
      const matchesSearch = !searchTerm || 
        item.name.toLowerCase().includes(searchTerm) ||
        (item.plaintext && item.plaintext.toLowerCase().includes(searchTerm));

      // Item type filter
      let matchesType = true;
      if (typeFilter) {
        switch (typeFilter) {
          case 'starter':
            matchesType = item.gold <= 500 && item.tags.includes('Lane');
            break;
          case 'basic':
            matchesType = item.gold > 0 && item.gold <= 1000 && !item.tags.includes('Boots');
            break;
          case 'epic':
            matchesType = item.gold > 1000 && item.gold <= 2500;
            break;
          case 'legendary':
            matchesType = item.gold > 2500;
            break;
          case 'consumable':
            matchesType = item.tags.includes('Consumable');
            break;
          case 'boots':
            matchesType = item.tags.includes('Boots');
            break;
        }
      }

      // Category filter
      const matchesCategory = !categoryFilter || item.tags.includes(categoryFilter);

      // Price range filter
      const matchesPrice = item.gold >= minPrice && item.gold <= maxPrice;

      return matchesSearch && matchesType && matchesCategory && matchesPrice;
    });

    renderItems();
  }

  function showItemLoading() {
    const grid = document.getElementById('item-grid');
    if (!grid) return;
    grid.innerHTML = `
      <div class="loading" style="grid-column: 1 / -1;">
        <div class="spinner"></div>
        Loading items...
      </div>
    `;
  }

  function showItemError(message) {
    const grid = document.getElementById('item-grid');
    if (!grid) return;
    grid.innerHTML = `<div style="color: #c84a4a; text-align:center; grid-column: 1 / -1;">${message}</div>`;
  }

  // Function to show item details in a modal
async function showItemDetails(itemId) {
  const item = items.find(i => i.id.toString() === itemId);
  if (!item) return;

  const itemModal = document.getElementById("item-modal");
  const itemModalTitle = document.getElementById("item-modal-title");
  const itemModalImage = document.getElementById("item-modal-image");
  const itemModalDescription = document.getElementById("item-modal-description");
  const itemModalPrice = document.getElementById("item-modal-price");
  const itemModalStats = document.getElementById("item-modal-stats");

  // Populate modal content
  itemModalTitle.textContent = item.name;
  itemModalImage.src = item.image;
  itemModalImage.alt = item.name;

  // Description from DDragon often contains HTML. We need to clean it up.
  // The 'plaintext' property is usually cleaner, or you can use stripHtml.
  itemModalDescription.innerHTML = item.description; // Using innerHTML to display formatted description from ddragon
  // If you prefer a simpler, less formatted description, you can use:
  // itemModalDescription.textContent = stripHtml(item.description);


  itemModalPrice.textContent = `${item.gold}g`;

  // For stats, we need to parse the description or tags to extract meaningful stats.
  // DDragon's item API doesn't provide structured stats like champion abilities.
  // For now, we'll use a simplified approach; a more robust solution might involve
  // parsing 'description' HTML for stat lines or having a predefined mapping.
  // For demonstration, let's just show some relevant tags or placeholder for stats.
  let statsText = '';
  // The 'description' often contains stats like "+80 Attack Damage". We can try to extract these.
  const statMatches = item.description.match(/<stats>(.*?)<\/stats>/);
  if (statMatches && statMatches[1]) {
    statsText = stripHtml(statMatches[1]);
  } else if (item.plaintext) {
    statsText = item.plaintext; // Fallback to plaintext if stats tag isn't found
  } else {
    statsText = item.tags.join(', ') || 'No specific stats listed';
  }
  
  itemModalStats.textContent = statsText;


  // Show the modal
  itemModal.style.display = "block";
  itemModal.setAttribute("aria-hidden", "false");
}

// Close item modal logic
const itemModalCloseButton = document.getElementById("item-modal-close");
if (itemModalCloseButton) {
  itemModalCloseButton.addEventListener("click", () => {
    const modal = document.getElementById("item-modal");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  });
}

// Also close item modal if user clicks outside the modal-content
window.addEventListener("click", (e) => {
  const itemModal = document.getElementById("item-modal");
  if (e.target === itemModal) {
    itemModal.style.display = "none";
    itemModal.setAttribute("aria-hidden", "true");
  }
});

  // Utility to strip HTML tags from item descriptions
  function stripHtml(html) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  }

  // Initialize item search filter event listener
  function initItemFilters() {
    const itemSearch = document.getElementById('item-search');
    const typeFilter = document.getElementById('availability-filter');
    const categoryFilter = document.getElementById('item-category');
    const priceMin = document.getElementById('price-min');
    const priceMax = document.getElementById('price-max');

    if (itemSearch) itemSearch.addEventListener('input', applyItemFilters);
    if (typeFilter) typeFilter.addEventListener('change', applyItemFilters);
    if (categoryFilter) categoryFilter.addEventListener('change', applyItemFilters);
    if (priceMin) priceMin.addEventListener('input', applyItemFilters);
    if (priceMax) priceMax.addEventListener('input', applyItemFilters);
  }

  // Initialize champion filters event listeners
  function initChampionFilters() {
    const classFilter = document.getElementById('class-filter');
    const difficultyFilter = document.getElementById('difficulty-filter');
    const searchInput = document.getElementById('search');

    if (classFilter) classFilter.addEventListener('change', applyFilters);
    if (difficultyFilter) difficultyFilter.addEventListener('change', applyFilters);
    if (searchInput) searchInput.addEventListener('input', applyFilters);
  }

  // On DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initChampionFilters();
  });
// Runes data source (Data Dragon API v15.14.1)
const RUNES_API = `https://ddragon.leagueoflegends.com/cdn/${DATA_VERSION}/data/en_US/runesReforged.json`;

// Variables pour stocker runes
let runes = [];
let filteredRunes = [];

// Charger les runes
async function loadRunes() {
  try {
    showRunesLoading();

    const response = await fetch(RUNES_API);
    if (!response.ok) throw new Error('Failed to fetch runes data');

    const data = await response.json();

    // Data Dragon gives runes grouped by "tree"
    // Each tree has slots, each slot has runes inside
    // We will flatten them all with reference to their tree name

    runes = [];
    data.forEach(tree => {
      const treeName = tree.name; // ex: Precision, Domination...
      tree.slots.forEach(slot => {
        slot.runes.forEach(rune => {
          runes.push({
            id: rune.id,
            name: rune.name,
            icon: `https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`,
            shortDesc: rune.shortDesc,
            longDesc: rune.longDesc,
            tree: treeName
          });
        });
      });
    });

    filteredRunes = [...runes];
    renderRunes();
  } catch (error) {
    console.error('Error loading runes:', error);
    showRunesError('Failed to load runes data. Please try again later.');
  }
}

function renderRunes() {
  const grid = document.getElementById('rune-grid');

  if (filteredRunes.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #c8aa6e; font-size: 1.2rem;">No runes found matching your filters.</div>';
    return;
  }

  grid.innerHTML = filteredRunes.map(rune => `
    <div class="champion" tabindex="0" aria-label="${rune.name}, Rune from ${rune.tree} tree" title="${rune.name}">
      <img class="rune-icon" src="${rune.icon}" alt="${rune.name}" loading="lazy" />
      <div class="champion-info">
        <div class="champion-name">${rune.name}</div>
        <div class="champion-tags" style="color:#c8aa6e;">${rune.tree}</div>
        <div class="rune-description" title="${rune.longDesc}">${rune.shortDesc}</div>
      </div>
    </div>
  `).join('');

  // Optionally add click or keyboard events if you want popup or details
}

// Filtres runes
function applyRunesFilters() {
  const treeFilter = document.getElementById('rune-tree-filter').value;
  const searchTerm = document.getElementById('rune-search').value.toLowerCase();

  filteredRunes = runes.filter(rune => {
    const matchesTree = !treeFilter || rune.tree === treeFilter;
    const matchesSearch = !searchTerm || rune.name.toLowerCase().includes(searchTerm);
    return matchesTree && matchesSearch;
  });

  renderRunes();
}

function showRunesLoading() {
  const grid = document.getElementById('rune-grid');
  grid.innerHTML = `
    <div class="loading" style="grid-column: 1 / -1;">
      <div class="spinner"></div>
      Loading runes...
    </div>
  `;
}

function showRunesError(message) {
  const grid = document.getElementById('rune-grid');
  grid.innerHTML = `<div style="color: #c84a4a; text-align:center; grid-column: 1 / -1;">${message}</div>`;
}

// Initialize filters event listeners for runes
function initRunesFilters() {
  const treeFilter = document.getElementById('rune-tree-filter');
  const searchInput = document.getElementById('rune-search');

  if (!treeFilter || !searchInput) return;

  treeFilter.addEventListener('change', applyRunesFilters);
  searchInput.addEventListener('input', applyRunesFilters);
}

// Étendre la fonction initNavigation() pour charger runes au besoin
function extendedInitNavigation() {
  initNavigation();

  // On écoute le clic sur les liens nav pour charger les runes si nécessaire
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const targetId = link.getAttribute('href').substring(1);
      if (targetId === 'runes' && runes.length === 0) {
        loadRunes();
        initRunesFilters();
      }
    });
  });
}

// Remplacer l'ancienne initNavigation par extendedInitNavigation dans DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  extendedInitNavigation();

  // Garder les autres listeners (champions/items)
  const classFilter = document.getElementById('class-filter');
  const difficultyFilter = document.getElementById('difficulty-filter');
  const searchInput = document.getElementById('search');

  if (classFilter) classFilter.addEventListener('change', applyFilters);
  if (difficultyFilter) difficultyFilter.addEventListener('change', applyFilters);
  if (searchInput) searchInput.addEventListener('input', applyFilters);

  // Show home by default
  document.querySelector('.nav-link.active').click();
});
// Mapping from tags to recommended positions (can be customized)
const tagToPositions = {
  Assassin: "Mid, Jungle",
  Fighter: "Top, Jungle",
  Mage: "Mid, Support",
  Marksman: "ADC",
  Support: "Support",
  Tank: "Top, Support, Jungle",
};

async function showChampionDetails(championId) {
  try {
    // Fetch full champion data (lore, skins, spells etc) from Riot API
    const response = await fetch(`https://ddragon.leagueoflegends.com/cdn/${DATA_VERSION}/data/en_US/champion/${championId}.json`);
    if (!response.ok) throw new Error("Failed to fetch champion details");

    const data = await response.json();
    const champ = data.data[championId];

    // Fill modal content
    document.getElementById("champion-modal-title").textContent = champ.name;
    document.getElementById("champion-modal-subtitle").textContent = champ.title;
    document.getElementById("champion-modal-image").src = `https://ddragon.leagueoflegends.com/cdn/${DATA_VERSION}/img/champion/${champ.image.full}`;
    document.getElementById("champion-modal-image").alt = champ.name;

    // Lore / description
    document.getElementById("champion-modal-lore").textContent = champ.lore;

    // Recommended positions based on tags
    const positions = champ.tags.map(tag => tagToPositions[tag]).filter(Boolean);
    document.getElementById("champion-modal-positions").textContent = positions.length ? positions.join(", ") : "Various";

    // Recommended items (simplified example: top 5 most popular starter items)
    // You could extend this by adding your own logic or fetching from another API
    const recommendedItems = [
      "Doran's Blade",
      "Doran's Ring",
      "Doran's Shield",
      "Health Potion",
      "Corrupting Potion"
    ];

    const ul = document.getElementById("champion-modal-items");
    ul.innerHTML = "";
    recommendedItems.forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    });

    // Show the modal
    const modal = document.getElementById("champion-modal");
    modal.style.display = "block";
    modal.setAttribute("aria-hidden", "false");

  } catch (error) {
    alert("Could not load champion details. Please try again later.");
    console.error(error);
  }
}

// Close modal logic
document.getElementById("modal-close").addEventListener("click", () => {
  const modal = document.getElementById("champion-modal");
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
});

// Also close modal if user clicks outside the modal-content
window.addEventListener("click", (e) => {
  const modal = document.getElementById("champion-modal");
  if (e.target === modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
});
