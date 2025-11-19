const CONFIG = window.APP_CONFIG;

// --- ÉTATS GLOBAUX ---
const STATE = {
  people: [],
  filters: {
    search: "",
    village: "Suna", // Suna par défaut
    kekkei: "",
    clan: "",
    status: "alive", // En vie par défaut
    nature: ""
  },
  isAdmin: false
};

const PLACEHOLDER_IMG = "https://placehold.co/600x600/0c121c/8b97a6?text=Photo";

// --- SUPABASE INIT ---
const { createClient } = supabase;
const supabaseClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// --- UTILITAIRES ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Sécurité XSS : Nettoie le HTML avant affichage
const sanitize = (html) => window.DOMPurify ? DOMPurify.sanitize(html) : html;

// Helpers Images
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

// --- LOGIQUE MÉTIER ---

// Tri intelligent : Rang > Statut > Nom
function sortPeople(list) {
  return list.sort((a, b) => {
    // Valeurs numériques pour les grades
    const getVal = (g) => {
      const vals = {'kage':6, 'jonin':5, 'commandant jonin':5, 'chunin confirmé':4, 'tokubetsu jonin':4, 'chunin':3, 'tokubetsu chunin':3, 'genin confirmé':2, 'genin':1};
      return vals[(g||'').toLowerCase()] || 0;
    };
    
    // 1. Tri par Rang
    const rankDiff = getVal(b.grade) - getVal(a.grade);
    if (rankDiff !== 0) return rankDiff;

    // 2. Tri par Statut (Décédés à la fin)
    if (a.status !== b.status) return (a.status === 'deceased') ? 1 : -1;

    // 3. Alphabétique (Prénom)
    return (a.firstName || '').localeCompare(b.firstName || '');
  });
}

// Rendu de la grille
function renderGrid() {
  const grid = $("#grid");
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  const tmpl = $("#cardTemplate");
  const f = STATE.filters;

  const filtered = STATE.people.filter(p => {
    // Recherche textuelle
    const searchHaystack = (p.firstName+" "+p.lastName+" "+(p.clan||"")).toLowerCase();
    if (f.search && !searchHaystack.includes(f.search.toLowerCase())) return false;

    // Filtres exacts
    if (f.village && p.village !== f.village) return false;
    if (f.status && f.status === 'alive' && p.status === 'deceased') return false;
    if (f.status && f.status === 'deceased' && p.status !== 'deceased') return false;
    
    // Filtres optionnels
    if (f.kekkei) {
      if (f.kekkei === "IS_NULL" && p.kekkeiGenkai) return false;
      if (f.kekkei !== "IS_NULL" && p.kekkeiGenkai !== f.kekkei) return false;
    }
    if (f.clan) {
      if (f.clan === "IS_NULL" && p.clan) return false;
      if (f.clan !== "IS_NULL" && p.clan !== f.clan) return false;
    }
    if (f.nature && (!p.chakraNatures || !p.chakraNatures.includes(f.nature))) return false;

    return true;
  });

  $("#stats").textContent = `${filtered.length} / ${STATE.people.length} ninjas`;

  filtered.forEach((p, idx) => {
    const clone = tmpl.content.cloneNode(true);
    const card = clone.querySelector('.card');
    card.dataset.id = p.id;
    
    // Animation cascade
    card.style.animationDelay = `${Math.min(idx * 50, 800)}ms`;

    const img = card.querySelector('.card-img');
    img.src = p.photoUrl || PLACEHOLDER_IMG;
    img.alt = p.firstName;

    card.querySelector('.card-name').textContent = `${p.firstName} ${p.lastName}`;

    // Logos
    const setLogo = (sel, src) => {
      const el = card.querySelector(sel);
      if(src) { el.src = src; el.classList.remove('hidden'); }
      else el.classList.add('hidden');
    };

    setLogo('.card-kg-logo', p.kekkeiGenkai && p.kekkeiGenkai !== 'Aucun' ? `kg/${p.kekkeiGenkai.toLowerCase()}.png` : null);
    setLogo('.card-village-logo', p.village ? `villages/${p.village.toLowerCase()}.png` : null);
    setLogo('.card-rank-logo', p.grade ? `rangs/${getRankImage(p.grade)}` : null);
    setLogo('.card-kage-logo', p.grade === 'Kage' ? `kage/${getKageImage(p.village)}` : null);

    // Natures (miniatures sur carte)
    const natureWrap = card.querySelector('.card-natures-wrapper');
    if(p.chakraNatures && p.chakraNatures.length > 0){
      natureWrap.classList.remove('hidden');
      p.chakraNatures.slice(0,2).forEach(n => {
        const i = document.createElement('img');
        i.src = `natures/${n.toLowerCase()}.png`;
        natureWrap.appendChild(i);
      });
    }

    // Statut Décédé
    if (p.status === 'deceased') {
      card.classList.add('card--deceased');
      card.querySelector('.card-status-badge').classList.remove('hidden');
    }

    // Bouton Admin
    if (STATE.isAdmin) card.querySelector('.card-del').classList.remove('hidden');

    frag.appendChild(clone);
  });

  grid.appendChild(frag);
}

// --- GESTION MODALE (Lecture & Édition) ---

let currentEditingId = null;
let currentPhotoUrl = null;

function openModal(p, editMode = false) {
  const modal = $("#personModal");
  const isDead = p?.status === 'deceased';
  
  // Reset visuels
  $("#modalPhoto").className = isDead ? 'deceased' : '';
  $("#modalNameView").className = isDead ? 'deceased' : '';

  if (!editMode) {
    // === MODE LECTURE ===
    $("#modalPhoto").src = p.photoUrl || PLACEHOLDER_IMG;
    $("#modalNameView").textContent = `${p.firstName} ${p.lastName}`;

    // Helper d'affichage conditionnel
    const show = (id, cond, fn) => {
      const el = $(id);
      if(cond) { el.classList.remove('hidden'); if(fn) fn(el); }
      else el.classList.add('hidden');
    };

    show("#modalKageLogoView", p.grade === 'Kage', el => el.src = `kage/${getKageImage(p.village)}`);
    
    show("#gradeInfo", p.grade, () => {
      $("#modalGradeView").textContent = p.grade;
      $("#modalGradeLogo").src = `rangs/${getRankImage(p.grade)}`;
      $("#modalGradeLogo").classList.remove('hidden');
    });

    show("#villageInfo", p.village, () => {
      $("#modalVillageView").textContent = p.village;
      $("#modalVillageLogo").src = `villages/${p.village.toLowerCase()}.png`;
      $("#modalVillageLogo").classList.remove('hidden');
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
        img.classList.add("nature-logo");
        img.title = n;
        natureBox.appendChild(img);
      });
    });

    const bio = $("#modalInfoView");
    if(p.information) {
      bio.innerHTML = sanitize(p.information); // SÉCURITÉ
      bio.classList.remove('hidden');
    } else {
      bio.classList.add('hidden');
    }

    // Toggle UI
    $$(".ed").forEach(e => e.classList.add("hidden"));
    $$(".ro").forEach(e => e.classList.remove("hidden"));
    $("#editActions").classList.add("hidden");
    $("#dropZone").classList.add("hidden");

  } else {
    // === MODE ÉDITION ===
    currentEditingId = p?.id || null;
    currentPhotoUrl = p?.photoUrl || null;

    $("#modalPhoto").src = p?.photoUrl || PLACEHOLDER_IMG;
    $("#firstNameInput").value = p?.firstName || "";
    $("#lastNameInput").value = p?.lastName || "";
    $("#gradeInput").value = p?.grade || "";
    $("#villageInput").value = p?.village || "";
    $("#clanInput").value = p?.clan || "";
    $("#kekkeiGenkaiInput").value = p?.kekkeiGenkai || "";
    $("#statusInput").value = p?.status || "alive";

    // Checkboxes
    $$("#natureInput input").forEach(cb => {
      cb.checked = p?.chakraNatures?.includes(cb.value) || false;
    });

    // Bio (Editable)
    $("#informationInput").innerHTML = p?.information || "";

    // Toggle UI
    $$(".ro").forEach(e => e.classList.add("hidden"));
    $$(".ed").forEach(e => e.classList.remove("hidden"));
    $("#editActions").classList.remove("hidden");
    $("#dropZone").classList.remove("hidden");
  }

  modal.showModal();
}

// --- INTERACTIONS ---

// Click Carte
$("#grid").addEventListener("click", e => {
  const card = e.target.closest('.card');
  if(!card) return;
  const p = STATE.people.find(x => x.id === card.dataset.id);

  // Suppression
  if(e.target.classList.contains('card-del')) {
    e.stopPropagation();
    if(confirm(`Supprimer ${p.firstName} ?`)) deletePerson(p.id);
    return;
  }
  
  // Ouvrir (Admin = Edit, User = Read)
  openModal(p, STATE.isAdmin);
});

// Filtres Onglets Villages
$(".village-tabs").addEventListener("click", e => {
  if(!e.target.classList.contains("village-tab")) return;
  $(".village-tab.active").classList.remove("active");
  e.target.classList.add("active");
  STATE.filters.village = e.target.dataset.village;
  renderGrid();
});

// Autres Filtres
["kekkeiFilter", "clanFilter", "statusFilter", "natureFilter"].forEach(id => {
  $(`#${id}`).addEventListener("input", e => {
    const key = id.replace("Filter", "");
    STATE.filters[key] = e.target.value;
    renderGrid();
  });
});

$("#searchInput").addEventListener("input", e => {
  STATE.filters.search = e.target.value;
  renderGrid();
});

$("#clearFiltersBtn").addEventListener("click", () => {
  $$("select").forEach(s => s.value = "");
  $("#searchInput").value = "";
  $(".village-tab.active").classList.remove("active");
  $('.village-tab[data-village=""]').classList.add("active");
  
  STATE.filters = { search:"", village:"", kekkei:"", clan:"", status:"", nature:"" };
  renderGrid();
});

// Sauvegarde (Create/Update)
$("#saveBtn").addEventListener("click", async () => {
  const cleanBio = sanitize($("#informationInput").innerHTML);
  
  const payload = {
    firstName: $("#firstNameInput").value,
    lastName: $("#lastNameInput").value,
    grade: $("#gradeInput").value,
    village: $("#villageInput").value,
    clan: $("#clanInput").value,
    kekkeiGenkai: $("#kekkeiGenkaiInput").value,
    status: $("#statusInput").value,
    chakraNatures: $$("#natureInput input:checked").map(c => c.value),
    information: cleanBio,
    photoUrl: currentPhotoUrl
  };

  if(currentEditingId) payload.id = currentEditingId;

  const { data, error } = await supabaseClient.from('people').upsert(payload).select().single();

  if(error) {
    alert("Erreur: " + error.message);
  } else {
    await loadData(); // Recharge tout
    $("#personModal").close();
  }
});

// Suppression
async function deletePerson(id) {
  const { error } = await supabaseClient.from('people').delete().eq('id', id);
  if(error) alert("Erreur suppression (Vérifiez vos droits)");
  else await loadData();
}

// Upload Image (Compression basique)
function handleFile(file) {
  if(!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    // Ici on pourrait ajouter la compression canvas si besoin
    currentPhotoUrl = e.target.result; 
    $("#modalPhoto").src = currentPhotoUrl;
  };
  reader.readAsDataURL(file);
}

$("#dropZone").addEventListener("click", () => $("#photoFile").click());
$("#photoFile").addEventListener("change", e => handleFile(e.target.files[0]));

// --- AUTH & CHARGEMENT ---

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    STATE.isAdmin = true;
    $("#adminLoginToggle").textContent = "🔓 Logout";
    $("#addBtn").classList.remove("hidden");
    $("#exportBtn").classList.remove("hidden");
    renderGrid(); // Refresh pour afficher les poubelles
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
  const { error } = await supabaseClient.auth.signInWithPassword({
    email: $("#loginEmail").value,
    password: $("#loginPassword").value
  });
  if(error) $("#loginError").textContent = "Erreur d'identification";
  else {
    $("#loginModal").close();
    checkSession();
  }
});

// Bouton Ajout
$("#addBtn").addEventListener("click", () => openModal(null, true));

// Bouton Export JSON
$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(STATE.people, null, 2)], {type : 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sajin_backup.json';
  a.click();
});

// Chargement Initial
async function loadData() {
  const { data } = await supabaseClient.from('people').select('*');
  if(data) {
    STATE.people = sortPeople(data);
    renderGrid();
  }
}

// Helpers fermeture
$$(".modal-close, #closeEditBtn").forEach(b => b.onclick = function(){ this.closest("dialog").close() });

// Start
loadData();
checkSession();