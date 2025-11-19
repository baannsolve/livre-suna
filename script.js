const CONFIG = window.APP_CONFIG;

// --- STATE ---
const STATE = {
  people: [],
  filters: { search: "", village: "Suna", kekkei: "", clan: "", status: "alive", nature: "" },
  isAdmin: false,
  currentEditingId: null,
  currentPhotoUrl: null
};

const PLACEHOLDER_IMG = "https://placehold.co/600x600/0f172a/1e293b?text=SHINOBI";

// --- SUPABASE ---
const { createClient } = supabase;
const supabaseClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// --- DOM HELPERS ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const sanitize = (html) => window.DOMPurify ? DOMPurify.sanitize(html) : html;

// --- THEME MANAGER ---
function updateTheme(village) {
  const themeName = village || "Tous";
  document.body.setAttribute('data-theme', themeName);
}

// --- UI HELPERS (TOASTS) ---
function showToast(message, type = 'success') {
  const container = $("#toast-container");
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span style="font-size:1.2rem">${type === 'success' ? '✅' : '❌'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// --- ASSET MAPPERS ---
const getRankImage = (grade) => {
  if (!grade) return null;
  const map = {
    'genin': 'rangd.png', 'genin confirmé': 'rangc.png',
    'chunin': 'rangb.png', 'tokubetsu chunin': 'rangb.png',
    'chunin confirmé': 'ranga.png', 'tokubetsu jonin': 'ranga.png',
    'jonin': 'rangs.png', 'commandant jonin': 'rangs.png',
    'kage': 'rangss.png'
  };
  return map[grade.toLowerCase()] || null;
};

const getKageImage = (village) => {
  if (!village) return null;
  const map = {
    'konoha': 'hokage.png', 'suna': 'kazekage.png',
    'kiri': 'mizukage.png', 'kumo': 'raikage.png', 'iwa': 'tsuchikage.png'
  };
  return map[village.toLowerCase()] || null;
};

// --- CORE LOGIC ---

function sortPeople(list) {
  return list.sort((a, b) => {
    const getVal = (g) => {
      const vals = {'kage':10, 'commandant jonin':9, 'jonin':8, 'tokubetsu jonin':7, 'chunin confirmé':6, 'chunin':5, 'tokubetsu chunin':4, 'genin confirmé':3, 'genin':2};
      return vals[(g||'').toLowerCase()] || 1;
    };
    
    // 1. Rang (Plus haut en premier)
    const rankDiff = getVal(b.grade) - getVal(a.grade);
    if (rankDiff !== 0) return rankDiff;

    // 2. Vivant avant Mort
    if (a.status !== b.status) return (a.status === 'deceased') ? 1 : -1;

    // 3. Alphabétique
    return (a.firstName || '').localeCompare(b.firstName || '');
  });
}

function renderGrid() {
  const grid = $("#grid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  const f = STATE.filters;

  const filtered = STATE.people.filter(p => {
    // Search text
    const haystack = (p.firstName + " " + p.lastName + " " + (p.clan||"")).toLowerCase();
    if (f.search && !haystack.includes(f.search.toLowerCase())) return false;

    // Filters
    if (f.village && p.village !== f.village) return false;
    if (f.status && f.status === 'alive' && p.status === 'deceased') return false;
    if (f.status && f.status === 'deceased' && p.status !== 'deceased') return false;
    
    if (f.kekkei && f.kekkei !== "IS_NULL" && p.kekkeiGenkai !== f.kekkei) return false;
    if (f.kekkei === "IS_NULL" && p.kekkeiGenkai) return false;

    if (f.clan && f.clan !== "IS_NULL" && p.clan !== f.clan) return false;
    if (f.clan === "IS_NULL" && p.clan) return false;
    
    if (f.nature && (!p.chakraNatures || !p.chakraNatures.includes(f.nature))) return false;

    return true;
  });

  $("#stats").textContent = `${filtered.length} Ninja${filtered.length > 1 ? 's' : ''} répertoriés`;

  filtered.forEach((p, idx) => {
    const clone = $("#cardTemplate").content.cloneNode(true);
    const card = clone.querySelector('.card');
    card.dataset.id = p.id;
    card.style.animationDelay = `${Math.min(idx * 50, 1000)}ms`; // Cascade effect

    const img = card.querySelector('.card-img');
    img.src = p.photoUrl || PLACEHOLDER_IMG;
    
    card.querySelector('.card-name').textContent = `${p.firstName} ${p.lastName}`;

    // Icons
    const setLogo = (sel, src) => {
      const el = card.querySelector(sel);
      if(src) { el.src = src; el.classList.remove('hidden'); }
    };

    setLogo('.card-kg-logo', p.kekkeiGenkai && p.kekkeiGenkai !== 'Aucun' ? `kg/${p.kekkeiGenkai.toLowerCase()}.png` : null);
    setLogo('.card-village-logo', p.village ? `villages/${p.village.toLowerCase()}.png` : null);
    setLogo('.card-rank-logo', getRankImage(p.grade) ? `rangs/${getRankImage(p.grade)}` : null);
    setLogo('.card-kage-logo', p.grade === 'Kage' ? `kage/${getKageImage(p.village)}` : null);

    // Natures Mini
    if(p.chakraNatures?.length > 0){
      const wrap = card.querySelector('.card-natures-wrapper');
      wrap.classList.remove('hidden');
      p.chakraNatures.slice(0,2).forEach(n => {
        const i = document.createElement('img');
        i.src = `natures/${n.toLowerCase()}.png`;
        wrap.appendChild(i);
      });
    }

    // Dead Status
    if (p.status === 'deceased') {
      card.classList.add('card--deceased');
      card.querySelector('.status-badge').classList.remove('hidden');
    }

    if (STATE.isAdmin) card.querySelector('.card-del').classList.remove('hidden');
    frag.appendChild(clone);
  });

  grid.appendChild(frag);
}

// --- MODAL SYSTEM ---

function openModal(p, editMode = false) {
  const modal = $("#personModal");
  const isDead = p?.status === 'deceased';
  
  // Reset Styles
  $("#modalPhoto").style.filter = isDead ? 'grayscale(1)' : 'none';

  if (!editMode) {
    // --- VIEW MODE ---
    $("#modalPhoto").src = p.photoUrl || PLACEHOLDER_IMG;
    $("#modalNameView").textContent = `${p.firstName} ${p.lastName}`;

    // Smart Display Helper
    const show = (id, cond, fn) => {
      const el = $(id);
      if(cond) { el.classList.remove('hidden'); if(fn) fn(el); } else { el.classList.add('hidden'); }
    };

    show("#modalKageLogoView", p.grade === 'Kage', el => el.src = `kage/${getKageImage(p.village)}`);
    
    show("#gradeInfo", p.grade, () => {
       $("#modalGradeView").textContent = p.grade;
       const rankImg = getRankImage(p.grade);
       show("#modalGradeLogo", rankImg, el => el.src = `rangs/${rankImg}`);
    });

    show("#villageInfo", p.village, () => {
      $("#modalVillageView").textContent = p.village;
      $("#modalVillageLogo").src = `villages/${p.village.toLowerCase()}.png`;
    });

    show("#clanInfo", p.clan, () => $("#modalClanView").textContent = p.clan);

    show("#kekkeiInfo", p.kekkeiGenkai && p.kekkeiGenkai !== 'Aucun', () => {
      $("#modalKekkeiLogo").src = `kg/${p.kekkeiGenkai.toLowerCase()}.png`;
      $("#modalKekkeiView").textContent = p.kekkeiGenkai;
    });

    const natureBox = $("#modalNatureView");
    natureBox.innerHTML = "";
    show("#natureInfo", p.chakraNatures?.length, () => {
      p.chakraNatures.forEach(n => {
        const img = document.createElement("img");
        img.src = `natures/${n.toLowerCase()}.png`;
        natureBox.appendChild(img);
      });
    });

    const bio = $("#modalInfoView");
    if(p.information) {
      bio.innerHTML = sanitize(p.information);
      bio.parentElement.classList.remove('hidden');
    } else {
      bio.parentElement.classList.add('hidden');
    }

    // Hide Edit UI
    $$(".ed").forEach(e => e.classList.add("hidden"));
    $$(".ro").forEach(e => e.classList.remove("hidden"));
    $("#dropZone").classList.add("hidden");

  } else {
    // --- EDIT MODE ---
    STATE.currentEditingId = p?.id || null;
    STATE.currentPhotoUrl = p?.photoUrl || null;

    $("#modalPhoto").src = p?.photoUrl || PLACEHOLDER_IMG;
    $("#firstNameInput").value = p?.firstName || "";
    $("#lastNameInput").value = p?.lastName || "";
    $("#gradeInput").value = p?.grade || "";
    $("#villageInput").value = p?.village || "";
    $("#clanInput").value = p?.clan || "";
    $("#kekkeiGenkaiInput").value = p?.kekkeiGenkai || "";
    $("#statusInput").value = p?.status || "alive";

    $$("#natureInput input").forEach(cb => {
      cb.checked = p?.chakraNatures?.includes(cb.value) || false;
    });

    $("#informationInput").innerHTML = p?.information || "";
    $("#informationInput").parentElement.classList.remove('hidden');

    // Show Edit UI
    $$(".ro").forEach(e => e.classList.add("hidden"));
    $$(".ed").forEach(e => e.classList.remove("hidden"));
    $("#editActions").classList.remove("hidden");
    $("#dropZone").classList.remove("hidden");
  }

  modal.showModal();
}

// --- EVENTS ---

// Card Clicks
$("#grid").addEventListener("click", e => {
  const card = e.target.closest('.card');
  if(!card) return;
  const p = STATE.people.find(x => x.id === card.dataset.id);

  // Delete
  if(e.target.closest('.card-del')) {
    e.stopPropagation();
    if(confirm(`Confirmer la suppression de ${p.firstName} ?`)) deletePerson(p.id);
    return;
  }
  openModal(p, STATE.isAdmin);
});

// Tabs (Village Filters & Themes)
$(".village-tabs").addEventListener("click", e => {
  if(!e.target.classList.contains("village-tab")) return;
  
  // UI Updates
  $(".village-tab.active").classList.remove("active");
  e.target.classList.add("active");
  
  // Logic Updates
  const villageName = e.target.dataset.village;
  STATE.filters.village = villageName;
  
  // Update Theme
  updateTheme(villageName);
  
  renderGrid();
});

// Filters
["kekkeiFilter", "clanFilter", "statusFilter", "natureFilter"].forEach(id => {
  $(`#${id}`).addEventListener("input", e => {
    const key = id.replace("Filter", "");
    STATE.filters[key] = e.target.value;
    renderGrid();
  });
});

$("#searchInput").addEventListener("input", e => {
  STATE.filters.search = e.target.value;
  $("#clearSearch").classList.toggle("hidden", !e.target.value);
  renderGrid();
});

$("#clearSearch").addEventListener("click", () => {
    $("#searchInput").value = "";
    STATE.filters.search = "";
    renderGrid();
});

$("#clearFiltersBtn").addEventListener("click", () => {
  $$("select").forEach(s => s.value = "");
  $("#searchInput").value = "";
  
  // Reset UI
  $(".village-tab.active").classList.remove("active");
  // Reset to default Suna? Or All? Let's reset to "All" or Suna as per preference.
  // Let's default to Suna as requested in original prompt, or user preference.
  // Here resetting to "Tous" for better UX
  const defaultTab = $('.village-tab[data-village=""]');
  if(defaultTab) defaultTab.classList.add("active");
  
  STATE.filters = { search:"", village:"", kekkei:"", clan:"", status:"", nature:"" };
  updateTheme(""); // Reset theme
  renderGrid();
});

// --- DATA OPERATIONS ---

// Save
$("#saveBtn").addEventListener("click", async () => {
  const payload = {
    firstName: $("#firstNameInput").value,
    lastName: $("#lastNameInput").value,
    grade: $("#gradeInput").value,
    village: $("#villageInput").value,
    clan: $("#clanInput").value,
    kekkeiGenkai: $("#kekkeiGenkaiInput").value,
    status: $("#statusInput").value,
    chakraNatures: $$("#natureInput input:checked").map(c => c.value),
    information: sanitize($("#informationInput").innerHTML),
    photoUrl: STATE.currentPhotoUrl
  };

  if(STATE.currentEditingId) payload.id = STATE.currentEditingId;

  const { error } = await supabaseClient.from('people').upsert(payload);

  if(error) showToast(error.message, 'error');
  else {
    showToast("Personnage enregistré !");
    $("#personModal").close();
    loadData();
  }
});

// Delete
async function deletePerson(id) {
  const { error } = await supabaseClient.from('people').delete().eq('id', id);
  if(error) showToast("Erreur suppression (Droits ?)", 'error');
  else {
    showToast("Personnage supprimé");
    loadData();
  }
}

// Image Upload
$("#dropZone").addEventListener("click", () => $("#photoFile").click());
$("#photoFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if(file && file.type.startsWith('image/')){
        const reader = new FileReader();
        reader.onload = ev => {
            STATE.currentPhotoUrl = ev.target.result; 
            $("#modalPhoto").src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// --- AUTH ---

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    STATE.isAdmin = true;
    $("#adminText").textContent = "Déconnexion";
    $("#addBtn").classList.remove("hidden");
    $("#exportBtn").classList.remove("hidden");
    renderGrid(); 
  }
}

$("#adminLoginToggle").addEventListener("click", async () => {
  if(STATE.isAdmin) {
    await supabaseClient.auth.signOut();
    location.reload();
  } else {
    $("#loginModal").showModal();
  }
});

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginSubmitBtn").textContent = "Connexion...";
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: $("#loginEmail").value,
    password: $("#loginPassword").value
  });
  if(error) {
      showToast("Identifiants incorrects", 'error');
      $("#loginSubmitBtn").textContent = "Connexion";
  } else {
    $("#loginModal").close();
    showToast("Connexion réussie");
    checkSession();
  }
});

$("#addBtn").addEventListener("click", () => openModal(null, true));

// Export JSON
$("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(STATE.people, null, 2)], {type : 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Sajin_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
});

// --- INIT ---
async function loadData() {
  const { data } = await supabaseClient.from('people').select('*');
  if(data) {
    STATE.people = sortPeople(data);
    renderGrid();
  }
}

$$(".modal-close, #closeEditBtn").forEach(b => b.onclick = function(){ this.closest("dialog").close() });

// Set Initial Theme (Suna)
updateTheme("Suna");

loadData();
checkSession();