const CONFIG = window.APP_CONFIG;

// --- STATE ---
const STATE = {
  people: [],
  filters: { search: "", village: "Suna", kekkei: "", clan: "", status: "alive", nature: "" },
  isAdmin: false,
  currentEditingId: null,
  currentPhotoUrl: null,
  // Paramètres globaux (simulés localement)
  settings: {
      sealEnabled: localStorage.getItem('site_seal_enabled') !== 'false' // Par défaut TRUE
  }
};

// --- INITIALISATION DU SCEAU (V3 FIXED) ---
function initSealSystem() {
    const overlay = document.getElementById('seal-overlay');
    
    // 1. Vérifier si le sceau est ACTIVÉ globalement
    if (!STATE.settings.sealEnabled) {
        overlay.classList.add('hidden');
        return;
    }

    // 2. Vérifier si l'utilisateur a DÉJÀ brisé le sceau dans cette session
    if (sessionStorage.getItem('sealBroken') === 'true') {
        overlay.classList.add('hidden');
        return;
    }

    // Si on arrive ici, on affiche et on anime le sceau
    const btn = document.getElementById('breakSealBtn');
    const ofudaRing = document.getElementById('ofuda-circle');
    const particles = document.getElementById('particles-container');

    // Création des Talismans
    const count = 12; 
    const radius = 190; 
    ofudaRing.innerHTML = ''; // Reset au cas où
    
    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'ofuda';
        el.innerText = "禁"; 
        const angle = (360 / count) * i;
        el.style.transform = `rotate(${angle}deg) translateY(-${radius}px)`;
        ofudaRing.appendChild(el);
    }

    // Système de Particules
    function spawnEmber() {
        if (overlay.classList.contains('hidden')) return;
        const e = document.createElement('div');
        e.className = 'ember';
        e.style.left = Math.random() * 100 + '%';
        e.style.animationDuration = (Math.random() * 2 + 3) + 's';
        particles.appendChild(e);
        setTimeout(() => e.remove(), 5000);
    }
    setInterval(spawnEmber, 150);

    // Interaction (Click)
    btn.onclick = () => {
        overlay.classList.add('seal-burn');
        setTimeout(() => {
            overlay.classList.add('hidden');
            sessionStorage.setItem('sealBroken', 'true');
        }, 1000);
    };
}

// --- GESTION DES PARAMÈTRES ---
function initSettings() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const toggle = document.getElementById('sealToggle');

    // Ouvrir
    settingsBtn.addEventListener('click', () => {
        // Charger l'état actuel
        toggle.checked = STATE.settings.sealEnabled;
        settingsModal.showModal();
    });

    // Sauvegarder
    saveBtn.addEventListener('click', () => {
        const newState = toggle.checked;
        STATE.settings.sealEnabled = newState;
        
        // Persistance (Local Storage pour démo, DB pour prod)
        localStorage.setItem('site_seal_enabled', newState);
        
        settingsModal.close();
        showToast("Paramètres sauvegardés !");
        
        // Appliquer immédiatement (recharger pour voir l'effet du sceau si activé)
        if (newState) {
            // Si on réactive, on reset la session pour le revoir
            sessionStorage.removeItem('sealBroken');
            location.reload(); 
        } else {
            // Si on désactive, on le cache direct
            document.getElementById('seal-overlay').classList.add('hidden');
        }
    });
    
    document.getElementById('settingsClose').onclick = () => settingsModal.close();
}

// Lancement au chargement
document.addEventListener('DOMContentLoaded', () => {
    initSealSystem();
    initSettings();
});


// --- SUPABASE & LOGIQUE MÉTIER ---
const { createClient } = supabase;
const supabaseClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const sanitize = (html) => window.DOMPurify ? DOMPurify.sanitize(html) : html;
const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Crect width='600' height='600' fill='%230f172a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='40' fill='%23334155'%3ESHINOBI%3C/text%3E%3C/svg%3E";

function updateTheme(village) {
  const themeName = village || "Tous";
  document.body.setAttribute('data-theme', themeName);
}

function showToast(message, type = 'success') {
  const container = $("#toast-container");
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-size:1.2rem">${type === 'success' ? '✅' : '❌'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

const getRankImage = (grade) => {
  if (!grade) return null;
  const map = { 'genin': 'rangd.png', 'genin confirmé': 'rangc.png', 'chunin': 'rangb.png', 'tokubetsu chunin': 'rangb.png', 'chunin confirmé': 'ranga.png', 'tokubetsu jonin': 'ranga.png', 'jonin': 'rangs.png', 'commandant jonin': 'rangs.png', 'kage': 'rangss.png' };
  return map[grade.toLowerCase()] || null;
};
const getKageImage = (village) => {
  if (!village) return null;
  const map = { 'konoha': 'hokage.png', 'suna': 'kazekage.png', 'kiri': 'mizukage.png', 'kumo': 'raikage.png', 'iwa': 'tsuchikage.png' };
  return map[village.toLowerCase()] || null;
};

function sortPeople(list) {
  return list.sort((a, b) => {
    const getVal = (g) => { const vals = {'kage':10, 'commandant jonin':9, 'jonin':8, 'tokubetsu jonin':7, 'chunin confirmé':6, 'chunin':5, 'tokubetsu chunin':4, 'genin confirmé':3, 'genin':2}; return vals[(g||'').toLowerCase()] || 1; };
    const rankDiff = getVal(b.grade) - getVal(a.grade);
    if (rankDiff !== 0) return rankDiff;
    if (a.status !== b.status) return (a.status === 'deceased') ? 1 : -1;
    return (a.firstName || '').localeCompare(b.firstName || '');
  });
}

function renderGrid() {
  const grid = $("#grid"); grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  const f = STATE.filters;
  const filtered = STATE.people.filter(p => {
    const haystack = (p.firstName + " " + p.lastName + " " + (p.clan||"")).toLowerCase();
    if (f.search && !haystack.includes(f.search.toLowerCase())) return false;
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
    card.dataset.id = p.id; card.style.animationDelay = `${Math.min(idx * 50, 1000)}ms`;
    const img = card.querySelector('.card-img'); img.src = p.photoUrl || PLACEHOLDER_IMG;
    card.querySelector('.card-name').textContent = `${p.firstName} ${p.lastName}`;
    const setLogo = (sel, src) => { const el = card.querySelector(sel); if(src) { el.src = src; el.classList.remove('hidden'); } };
    setLogo('.card-kg-logo', p.kekkeiGenkai && p.kekkeiGenkai !== 'Aucun' ? `kg/${p.kekkeiGenkai.toLowerCase()}.png` : null);
    setLogo('.card-village-logo', p.village ? `villages/${p.village.toLowerCase()}.png` : null);
    setLogo('.card-rank-logo', getRankImage(p.grade) ? `rangs/${getRankImage(p.grade)}` : null);
    setLogo('.card-kage-logo', p.grade === 'Kage' ? `kage/${getKageImage(p.village)}` : null);
    if(p.chakraNatures?.length > 0){ const wrap = card.querySelector('.card-natures-wrapper'); wrap.classList.remove('hidden'); p.chakraNatures.slice(0,2).forEach(n => { const i = document.createElement('img'); i.src = `natures/${n.toLowerCase()}.png`; wrap.appendChild(i); }); }
    if (p.status === 'deceased') { card.classList.add('card--deceased'); card.querySelector('.status-badge').classList.remove('hidden'); }
    if (STATE.isAdmin) card.querySelector('.card-del').classList.remove('hidden');
    frag.appendChild(clone);
  });
  grid.appendChild(frag);
}

function openModal(p, editMode = false) {
  const modal = $("#personModal");
  const isDead = p?.status === 'deceased';
  $("#modalPhoto").style.filter = isDead ? 'grayscale(1)' : 'none';
  if (!editMode) {
    $("#modalPhoto").src = p.photoUrl || PLACEHOLDER_IMG;
    $("#modalNameView").textContent = `${p.firstName} ${p.lastName}`;
    const show = (id, cond, fn) => { const el = $(id); if(cond) { el.classList.remove('hidden'); if(fn) fn(el); } else { el.classList.add('hidden'); } };
    show("#modalKageLogoView", p.grade === 'Kage', el => el.src = `kage/${getKageImage(p.village)}`);
    show("#gradeInfo", p.grade, () => { $("#modalGradeView").textContent = p.grade; const rankImg = getRankImage(p.grade); show("#modalGradeLogo", rankImg, el => el.src = `rangs/${rankImg}`); });
    show("#villageInfo", p.village, () => { $("#modalVillageView").textContent = p.village; $("#modalVillageLogo").src = `villages/${p.village.toLowerCase()}.png`; });
    show("#clanInfo", p.clan, () => $("#modalClanView").textContent = p.clan);
    show("#kekkeiInfo", p.kekkeiGenkai && p.kekkeiGenkai !== 'Aucun', () => { $("#modalKekkeiLogo").src = `kg/${p.kekkeiGenkai.toLowerCase()}.png`; $("#modalKekkeiView").textContent = p.kekkeiGenkai; });
    const natureBox = $("#modalNatureView"); natureBox.innerHTML = "";
    show("#natureInfo", p.chakraNatures?.length, () => { p.chakraNatures.forEach(n => { const img = document.createElement("img"); img.src = `natures/${n.toLowerCase()}.png`; natureBox.appendChild(img); }); });
    const bio = $("#modalInfoView"); if(p.information) { bio.innerHTML = sanitize(p.information); bio.parentElement.classList.remove('hidden'); } else { bio.parentElement.classList.add('hidden'); }
    $$(".ed").forEach(e => e.classList.add("hidden")); $$(".ro").forEach(e => e.classList.remove("hidden")); $("#dropZone").classList.add("hidden");
  } else {
    STATE.currentEditingId = p?.id || null; STATE.currentPhotoUrl = p?.photoUrl || null;
    $("#modalPhoto").src = p?.photoUrl || PLACEHOLDER_IMG;
    $("#firstNameInput").value = p?.firstName || ""; $("#lastNameInput").value = p?.lastName || ""; $("#gradeInput").value = p?.grade || ""; $("#villageInput").value = p?.village || ""; $("#clanInput").value = p?.clan || ""; $("#kekkeiGenkaiInput").value = p?.kekkeiGenkai || ""; $("#statusInput").value = p?.status || "alive";
    $$("#natureInput input").forEach(cb => { cb.checked = p?.chakraNatures?.includes(cb.value) || false; });
    $("#informationInput").innerHTML = p?.information || ""; $("#informationInput").parentElement.classList.remove('hidden');
    $$(".ro").forEach(e => e.classList.add("hidden")); $$(".ed").forEach(e => e.classList.remove("hidden")); $("#editActions").classList.remove("hidden"); $("#dropZone").classList.remove("hidden");
  }
  modal.showModal();
}

async function loadData() {
  const { data, error } = await supabaseClient.from('people').select('*');
  if(error) { console.error("Erreur chargement:", error); showToast("Erreur de chargement", "error"); } else { STATE.people = sortPeople(data || []); renderGrid(); }
}

$("#saveBtn").addEventListener("click", async () => {
  const payload = { firstName: $("#firstNameInput").value, lastName: $("#lastNameInput").value, grade: $("#gradeInput").value, village: $("#villageInput").value, clan: $("#clanInput").value, kekkeiGenkai: $("#kekkeiGenkaiInput").value, status: $("#statusInput").value, chakraNatures: $$("#natureInput input:checked").map(c => c.value), information: sanitize($("#informationInput").innerHTML), photoUrl: STATE.currentPhotoUrl };
  if(STATE.currentEditingId) payload.id = STATE.currentEditingId;
  const { error } = await supabaseClient.from('people').upsert(payload);
  if(error) showToast(error.message, 'error'); else { showToast("Personnage enregistré !"); $("#personModal").close(); loadData(); }
});

async function deletePerson(id) {
  const { error } = await supabaseClient.from('people').delete().eq('id', id);
  if(error) showToast("Erreur suppression : " + error.message, 'error'); else { showToast("Personnage supprimé"); loadData(); }
}

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    STATE.isAdmin = true;
    $("#adminText").textContent = "Déconnexion";
    $("#addBtn").classList.remove("hidden");
    $("#exportBtn").classList.remove("hidden");
    $("#settingsBtn").classList.remove("hidden"); // Afficher le bouton settings
    renderGrid(); 
  }
}

$("#adminLoginToggle").addEventListener("click", async () => {
  if(STATE.isAdmin) { await supabaseClient.auth.signOut(); location.reload(); } else { $("#loginModal").showModal(); }
});

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault(); $("#loginSubmitBtn").textContent = "Connexion...";
  const { error } = await supabaseClient.auth.signInWithPassword({ email: $("#loginEmail").value, password: $("#loginPassword").value });
  if(error) { showToast("Identifiants incorrects", 'error'); $("#loginSubmitBtn").textContent = "Connexion"; } else { $("#loginModal").close(); showToast("Connexion réussie"); checkSession(); }
});

$("#grid").addEventListener("click", e => {
  const card = e.target.closest('.card'); if(!card) return;
  const targetId = String(card.dataset.id); const p = STATE.people.find(x => String(x.id) === targetId);
  if (!p) return;
  if(e.target.closest('.card-del')) { e.stopPropagation(); if(confirm(`Confirmer la suppression de ${p.firstName} ?`)) deletePerson(p.id); return; }
  openModal(p, STATE.isAdmin);
});

$(".village-tabs").addEventListener("click", e => { if(!e.target.classList.contains("village-tab")) return; $(".village-tab.active").classList.remove("active"); e.target.classList.add("active"); const villageName = e.target.dataset.village; STATE.filters.village = villageName; updateTheme(villageName); renderGrid(); });
["kekkeiFilter", "clanFilter", "statusFilter", "natureFilter"].forEach(id => { $(`#${id}`).addEventListener("input", e => { STATE.filters[id.replace("Filter", "")] = e.target.value; renderGrid(); }); });
$("#searchInput").addEventListener("input", e => { STATE.filters.search = e.target.value; $("#clearSearch").classList.toggle("hidden", !e.target.value); renderGrid(); });
$("#clearSearch").addEventListener("click", () => { $("#searchInput").value = ""; STATE.filters.search = ""; renderGrid(); });
$("#clearFiltersBtn").addEventListener("click", () => { $$("select").forEach(s => s.value = ""); $("#searchInput").value = ""; $(".village-tab.active").classList.remove("active"); $('.village-tab[data-village=""]').classList.add("active"); STATE.filters = { search:"", village:"", kekkei:"", clan:"", status:"", nature:"" }; updateTheme(""); renderGrid(); });
$("#dropZone").addEventListener("click", () => $("#photoFile").click());
$("#photoFile").addEventListener("change", e => { const file = e.target.files[0]; if(file && file.type.startsWith('image/')){ const reader = new FileReader(); reader.onload = ev => { STATE.currentPhotoUrl = ev.target.result; $("#modalPhoto").src = ev.target.result; }; reader.readAsDataURL(file); } });
$("#addBtn").addEventListener("click", () => openModal(null, true));
$("#exportBtn").addEventListener("click", () => { const blob = new Blob([JSON.stringify(STATE.people, null, 2)], {type : 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Sajin_Backup.json`; a.click(); });
$$(".modal-close, #closeEditBtn").forEach(b => b.onclick = function(){ this.closest("dialog").close() });

updateTheme("Suna"); loadData(); checkSession();