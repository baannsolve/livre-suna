// script.js (Version avec masquage des champs N/A et correctif ENUM)

const CONFIG = window.APP_CONFIG;
let PEOPLE = [];
let FILTER = "";
let VILLAGE_FILTER = "Suna"; 
let KEKKEI_FILTER = "";
let CLAN_FILTER = "";
let STATUS_FILTER = "alive"; 
let NATURE_FILTER = ""; 
let isAdmin = false;
let adminMode = false;
let currentSortKey = "firstName"; 

const PLACEHOLDER_IMG = "https://placehold.co/600x600/0c121c/8b97a6?text=Photo";

// Initialisation de Supabase
const { createClient } = supabase;
const supabaseClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);


const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Sélecteurs
const grid = $("#grid");
const statsEl = $("#stats");
const sortButtons = {
  lastName: $("#sortLastNameBtn"),
  firstName: $("#sortFirstNameBtn"),
};

const villageTabsContainer = $(".village-tabs"); 
const kekkeiFilter = $("#kekkeiFilter");
const clanFilter = $("#clanFilter");
const statusFilter = $("#statusFilter"); 
const natureFilter = $("#natureFilter"); 
const clearFiltersBtn = $("#clearFiltersBtn");

const personModal = $("#personModal");
const dropZone = $("#dropZone");
const photoFile = $("#photoFile");
const statusInput = $("#statusInput");

const modalNatureView = $("#modalNatureView"); 
const natureInput = $("#natureInput"); 

const loginModal = $("#loginModal");
const loginForm = $("#loginForm");
const loginEmail = $("#loginEmail");
const loginPassword = $("#loginPassword");
const loginError = $("#loginError");
const loginSubmitBtn = $("#loginSubmitBtn");
const loginClose = $("#loginClose");
const loginCancelBtn = $("#loginCancelBtn");


let currentEditingId = null;
let photoDataUrl = null;

function debounce(fn, delay = 150){
  let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),delay)}
}

function compressImage(dataUrl, maxWidth = 600, maxHeight = 600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Fonction pour traduire le grade en image de rang
function getRankImage(grade) {
  if (!grade) return null;
  const g = grade.toLowerCase();
  
  switch (g) {
    case 'genin':
      return 'rangd.png';
    case 'genin confirmé':
      return 'rangc.png';
    case 'tokubetsu chunin':
    case 'chunin':
      return 'rangb.png';
    case 'chunin confirmé':
    case 'tokubetsu jonin':
      return 'ranga.png';
    case 'jonin':
    case 'commandant jonin':
      return 'rangs.png';
    case 'kage':
      return 'rangss.png';
    default:
      return null;
  }
}

// Fonction pour traduire le village en image de Kage
function getKageImage(village) {
  if (!village) return null;
  const v = village.toLowerCase();
  
  switch (v) {
    case 'konoha':
      return 'hokage.png';
    case 'suna':
      return 'kazekage.png';
    case 'kiri':
      return 'mizukage.png';
    case 'kumo':
      return 'raikage.png';
    case 'iwa':
      return 'tsuchikage.png';
    default:
      return null; 
  }
}

function personMatches(p, term){
  if(!term) return true;
  const hay = (p.firstName+" "+p.lastName+" "+(p.grade||"")+" "+(p.information||"")+" "+(p.clan||"")).toLowerCase();
  return hay.includes(term.toLowerCase());
}

// AJOUT : Fonction d'aide pour donner une valeur numérique aux rangs
function getRankSortValue(grade) {
  if (!grade) return 0;
  const g = grade.toLowerCase();
  switch (g) {
    case 'kage': return 6; // SS
    case 'jonin':
    case 'commandant jonin': return 5; // S
    case 'chunin confirmé':
    case 'tokubetsu jonin': return 4; // A
    case 'tokubetsu chunin':
    case 'chunin': return 3; // B
    case 'genin confirmé': return 2; // C
    case 'genin': return 1; // D
    default: return 0;
  }
}

// MODIFIÉ : Ajout du tri par Rang en priorité
function sortPeople() {
  PEOPLE.sort((a, b) => {
    // --- Sort Criterion 1: Rank (SS -> D) ---
    const aRank = getRankSortValue(a.grade);
    const bRank = getRankSortValue(b.grade);
    if (aRank !== bRank) {
      return bRank - aRank; // bRank - aRank pour un tri descendant (SS premier)
    }

    // --- Sort Criterion 2: Status (En vie -> Décédé) ---
    const aAlive = a.status !== 'deceased';
    const bAlive = b.status !== 'deceased';
    if (aAlive && !bAlive) return -1;
    if (!aAlive && bAlive) return 1;

    // --- Sort Criterion 3: Name (selon currentSortKey) ---
    const aFirst = (a.firstName || '').toLowerCase();
    const bFirst = (b.firstName || '').toLowerCase();
    const aLast = (a.lastName || '').toLowerCase();
    const bLast = (b.lastName || '').toLowerCase();
    
    if (currentSortKey === 'firstName') {
      return aFirst.localeCompare(bFirst) || aLast.localeCompare(bLast);
    }
    // Par défaut (ou si currentSortKey === 'lastName')
    return aLast.localeCompare(bLast) || aFirst.localeCompare(bFirst);
  });
}


function renderGrid(){
  const frag = document.createDocumentFragment();
  grid.innerHTML = "";
  const tmpl = $("#cardTemplate");
  
  const filtered = PEOPLE.filter(p => {
    const searchMatch = personMatches(p, FILTER);
    const villageMatch = !VILLAGE_FILTER || p.village === VILLAGE_FILTER;
    
    let kekkeiMatch = true;
    if (KEKKEI_FILTER === "IS_NULL") kekkeiMatch = !p.kekkeiGenkai;
    else if (KEKKEI_FILTER) kekkeiMatch = p.kekkeiGenkai === KEKKEI_FILTER;

    let clanMatch = true;
    if (CLAN_FILTER === "IS_NULL") clanMatch = !p.clan;
    else if (CLAN_FILTER) clanMatch = p.clan === CLAN_FILTER;

    let statusMatch = true;
    if (STATUS_FILTER === 'alive') statusMatch = p.status !== 'deceased';
    else if (STATUS_FILTER === 'deceased') statusMatch = p.status === 'deceased';

    const natureMatch = !NATURE_FILTER || (p.chakraNatures && p.chakraNatures.includes(NATURE_FILTER));

    return searchMatch && villageMatch && kekkeiMatch && clanMatch && statusMatch && natureMatch; 
  });
  
  filtered.forEach(p=>{
    const c = tmpl.content.firstElementChild.cloneNode(true);
    c.dataset.id = p.id;
    const img = c.querySelector('.card-img');
    img.src = p.photoUrl || PLACEHOLDER_IMG;
    img.alt = `${p.firstName} ${p.lastName}`;
    c.querySelector('.card-name').textContent = `${p.firstName} ${p.lastName}`;
    
    // Logo KG
    const kgLogo = c.querySelector('.card-kg-logo');
    if (p.kekkeiGenkai && p.kekkeiGenkai !== 'Aucun') { 
      kgLogo.src = `kg/${p.kekkeiGenkai.toLowerCase()}.png`;
      kgLogo.alt = p.kekkeiGenkai;
      kgLogo.classList.remove('hidden');
    } else {
      kgLogo.classList.add('hidden');
    }

    // Logo Village
    const villageLogo = c.querySelector('.card-village-logo');
    if (p.village) {
      villageLogo.src = `villages/${p.village.toLowerCase()}.png`;
      villageLogo.alt = p.village;
      villageLogo.classList.remove('hidden');
    } else {
      villageLogo.classList.add('hidden');
    }
    
    // Logo Rang
    const rankLogo = c.querySelector('.card-rank-logo');
    const rankImg = getRankImage(p.grade);
    if (rankImg) {
      rankLogo.src = `rangs/${rankImg}`;
      rankLogo.alt = p.grade;
      rankLogo.classList.remove('hidden');
    } else {
      rankLogo.classList.add('hidden');
    }
    
    // Logo Kage
    const kageLogo = c.querySelector('.card-kage-logo');
    if (p.grade === 'Kage') {
      const kageImg = getKageImage(p.village); 
      if (kageImg) {
        kageLogo.src = `kage/${kageImg}`; 
        kageLogo.alt = p.village;
        kageLogo.classList.remove('hidden');
      } else {
        kageLogo.classList.add('hidden'); 
      }
    } else {
      kageLogo.classList.add('hidden'); 
    }

    // Statut décédé
    const statusBadge = c.querySelector('.card-status-badge');
    if (p.status === 'deceased') {
      c.classList.add('card--deceased');
      statusBadge.classList.remove('hidden');
    } else {
      c.classList.remove('card--deceased');
      statusBadge.classList.add('hidden');
    }
    
    const del = c.querySelector('.card-del');
    if(adminMode){ del.classList.remove("hidden"); }
    frag.appendChild(c);
  });
  grid.appendChild(frag);
  statsEl.textContent = `${filtered.length} / ${PEOPLE.length} personnes`;
}

function openModalReadOnly(p){
  $("#modalPhoto").src = p.photoUrl || PLACEHOLDER_IMG;
  $("#modalNameView").textContent = `${p.firstName} ${p.lastName}`;
  
  // Logo Kage
  const kageLogoModal = $("#modalKageLogoView");
  if (p.grade === 'Kage') {
    const kageImg = getKageImage(p.village);
    if (kageImg) {
      kageLogoModal.src = `kage/${kageImg}`;
      kageLogoModal.alt = p.village;
      kageLogoModal.classList.remove('hidden');
    } else {
      kageLogoModal.classList.add('hidden');
    }
  } else {
    kageLogoModal.classList.add('hidden');
  }

  // Grade
  const gradeInfo = $("#gradeInfo");
  const gradeLogo = $("#modalGradeLogo");
  if (p.grade) {
    $("#modalGradeView").textContent = p.grade;
    const rankImg = getRankImage(p.grade);
    if (rankImg) {
      gradeLogo.src = `rangs/${rankImg}`;
      gradeLogo.alt = p.grade;
      gradeLogo.classList.remove("hidden");
    } else {
      gradeLogo.classList.add("hidden");
    }
    gradeInfo.classList.remove("hidden");
  } else {
    gradeInfo.classList.add("hidden");
  }

  // Clan
  const clanInfo = $("#clanInfo");
  $("#modalClanView").textContent = p.clan || "Aucun"; 
  clanInfo.classList.remove("hidden"); 

  
  // Village
  const villageInfo = $("#villageInfo");
  const villageLogo = $("#modalVillageLogo"); 
  if (p.village) {
    const villageName = p.village;
    const logoSrc = `villages/${villageName.toLowerCase()}.png`;
    villageLogo.src = logoSrc; 
    villageLogo.alt = villageName; 
    villageLogo.classList.remove("hidden"); 
    $("#modalVillageView").textContent = villageName; 
    villageInfo.classList.remove("hidden"); 
  } else {
    villageLogo.classList.add("hidden"); 
    villageInfo.classList.add("hidden"); 
  }

  // Kekkei Genkai
  const kekkeiBox = $("#kekkeiInfo");
  const kekkeiLogo = $("#modalKekkeiLogo");
  const kekkeiView = $("#modalKekkeiView"); 
  const kgName = p.kekkeiGenkai || "Aucun"; 

  if (kgName && kgName !== 'Aucun') {
    kekkeiLogo.src = `kg/${kgName.toLowerCase()}.png`;
    kekkeiLogo.alt = kgName;
    kekkeiLogo.classList.remove("hidden");
    kekkeiView.textContent = kgName;
  } else {
    kekkeiLogo.classList.add("hidden");
    kekkeiView.textContent = "Aucun";
  }
  kekkeiBox.classList.remove("hidden"); 
  
  // Affichage des Natures de Chakra
  const natureBox = $("#natureInfo");
  modalNatureView.innerHTML = ""; 
  if (p.chakraNatures && p.chakraNatures.length > 0) {
    p.chakraNatures.forEach(nature => {
      const span = document.createElement("span");
      span.textContent = nature;
      modalNatureView.appendChild(span);
    });
    natureBox.classList.remove("hidden");
  } else {
    natureBox.classList.add("hidden");
  }

  // Statut
  if (p.status === 'deceased') {
    $("#modalPhoto").classList.add('deceased');
    $("#modalNameView").classList.add('deceased');
  } else {
    $("#modalPhoto").classList.remove('deceased');
    $("#modalNameView").classList.remove('deceased');
  }
  
  // Information
  const infoView = $("#modalInfoView");
  if (p.information) {
    infoView.innerHTML = p.information; 
    infoView.classList.remove("hidden");
  } else {
    infoView.classList.add("hidden");
  }
  
  $$(".ed").forEach(el=>el.classList.add("hidden"));
  $("#editActions").classList.add("hidden");
  dropZone.classList.add("hidden"); 

  $(".modal-name-header.ro").classList.remove("hidden");
  $(".info-grid.ro").classList.remove("hidden");
  
  personModal.showModal();
  requestAnimationFrame(() => $("#modalClose").focus());
}

function openModalEdit(p){
  currentEditingId = p?.id || null;
  photoDataUrl = p?.photoUrl || null;
  $("#modalPhoto").src = p?.photoUrl || PLACEHOLDER_IMG;
  $("#firstNameInput").value = p?.firstName || "";
  $("#lastNameInput").value = p?.lastName || "";
  $("#gradeInput").value = p?.grade || "";
  $("#villageInput").value = p?.village || "";
  $("#kekkeiGenkaiInput").value = p?.kekkeiGenkai || ""; 
  $("#clanInput").value = p?.clan || "";
  
  // Logique pour cocher les cases des natures
  $$("#natureInput input[type='checkbox']").forEach(cb => cb.checked = false);
  if (p?.chakraNatures) {
    p.chakraNatures.forEach(nature => {
      const cb = $(`#natureInput input[value="${nature}"]`);
      if (cb) cb.checked = true;
    });
  }

  $("#informationInput").innerHTML = p?.information || ""; 
  $("#statusInput").value = p?.status || ""; 
  
  if (p?.status === 'deceased') {
    $("#modalPhoto").classList.add('deceased');
    $("#modalNameView").classList.add('deceased');
  } else {
    $("#modalPhoto").classList.remove('deceased');
    $("#modalNameView").classList.remove('deceased');
  }
  
  $$(".ro").forEach(el=>el.classList.add("hidden"));
  $$(".ed").forEach(el=>el.classList.remove("hidden"));
  $("#editActions").classList.remove("hidden");
  dropZone.classList.remove("hidden");

  personModal.showModal();
  requestAnimationFrame(() => $("#firstNameInput").focus());
}

function readFileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleFiles(files) {
  const f = files && files[0];
  if (!f) return;
  if (!f.type.startsWith("image/")) return alert("Veuillez déposer une image.");
  try {
    const data = await readFileToDataURL(f);
    const compressedData = await compressImage(data);
    photoDataUrl = compressedData;
    $("#modalPhoto").src = compressedData;
  } catch (err) {
    console.error("Erreur compression image:", err);
    alert("Erreur lors du traitement de l'image.");
  }
}

// Écouteurs Modal Personne
$("#modalClose").addEventListener("click",()=>personModal.close());
personModal.addEventListener("cancel", (e) => {
  e.preventDefault();
});

personModal.addEventListener("close", () => {
  currentEditingId = null;
  photoDataUrl = null;
  $("#modalPhoto").classList.remove('deceased');
  $("#modalNameView").classList.remove('deceased');
  $("#modalKageLogoView").classList.add("hidden");
});


// Card interactions
grid.addEventListener('click', async (e)=>{
  const card = e.target.closest('.card');
  if(!card) return;
  const id = card.dataset.id;
  const p = PEOPLE.find(x=>x.id===id);
  if(!p) return;

  if(e.target.classList.contains("card-del")){
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${p.firstName} ${p.lastName} ?`)) {
      return;
    }
    const { error } = await supabaseClient.from('people').delete().eq('id', p.id);
    if (error) {
      console.error("Erreur de suppression:", error.message);
      alert("La suppression a échoué.");
    } else {
      PEOPLE = PEOPLE.filter(person => person.id !== p.id);
      renderGrid();
    }
    return;
  }
  if(adminMode){ openModalEdit(p); } else { openModalReadOnly(p); }
});

grid.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    const card = e.target.closest('.card');
    if(card){
      const p = PEOPLE.find(x=>x.id===card.dataset.id);
      if(!p) return;
      if(adminMode){ openModalEdit(p); } else { openModalReadOnly(p); }
    }
  }
});

// Search
$("#searchInput").addEventListener("input", debounce(e=>{
  FILTER = e.target.value.trim();
  renderGrid();
}, 180));
$("#clearSearch").addEventListener("click", ()=>{
  $("#searchInput").value = ""; FILTER = ""; renderGrid();
});

// --- AUTHENTIFICATION ---

function setAdminUIVisible(state) {
  isAdmin = state;
  adminMode = state;
  
  $("#adminSwitchWrap").classList.toggle("hidden", !state);
  $("#addBtn").classList.toggle("hidden", !state);
  $("#exportBtn").classList.toggle("hidden", !state);
  
  if (state) {
    $("#adminModeSwitch").checked = true;
  }
  
  toggleAdminUI(state);
}

async function adminLoginFlow(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (session) {
    const logout = confirm("Vous êtes connecté. Voulez-vous vous déconnecter ?");
    if(logout) {
      const { error } = await supabaseClient.auth.signOut();
      if(error) {
        alert("Erreur lors de la déconnexion.");
      } else {
        setAdminUIVisible(false);
      }
    }
  } else {
    loginPassword.value = "";
    loginError.textContent = "";
    loginError.classList.add("hidden");
    loginModal.showModal();
    requestAnimationFrame(() => loginEmail.focus());
  }
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  loginSubmitBtn.disabled = true;
  loginSubmitBtn.textContent = "Connexion...";

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: loginEmail.value,
    password: loginPassword.value,
  });

  if(error){
    loginError.textContent = "Email ou mot de passe incorrect.";
    loginError.classList.remove("hidden");
  } else {
    setAdminUIVisible(true);
    loginModal.close();
  }
  
  loginSubmitBtn.disabled = false;
  loginSubmitBtn.textContent = "Se connecter";
});

loginClose.addEventListener("click", () => loginModal.close());
loginCancelBtn.addEventListener("click", () => loginModal.close());
loginModal.addEventListener('click', (e)=>{ if(e.target === loginModal) loginModal.close(); });


function toggleAdminUI(state){
  $$(".card-del").forEach(b => b.classList.toggle("hidden", !state));
  renderGrid();
}

$("#adminLoginToggle").addEventListener("click", adminLoginFlow);

$("#adminModeSwitch").addEventListener("change", (e)=>{
  if(!isAdmin) {
    e.target.checked = false;
    return;
  }
  adminMode = e.target.checked;
  toggleAdminUI(adminMode);
});

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    setAdminUIVisible(true);
  }
}

// --- FIN AUTHENTIFICATION ---


// Add / Export
$("#addBtn").addEventListener("click", ()=>{
  openModalEdit(null); // create new
});
$("#exportBtn").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(PEOPLE, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "people.json";
  a.click();
});

// Dropzone & file
dropZone.addEventListener("click", ()=> photoFile.click());
dropZone.addEventListener("dragover", (e)=>{ e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", ()=> dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e)=>{
  e.preventDefault(); dropZone.classList.remove("dragover");
  handleFiles(e.dataTransfer.files);
});
photoFile.addEventListener("change", (e)=> handleFiles(e.target.files));
document.addEventListener("paste", (e)=>{
  if(!personModal.open || !adminMode) return;
  const items = e.clipboardData?.items || [];
  for(const it of items){
    if(it.type.startsWith("image/")){
      handleFiles([it.getAsFile()]);
      break;
    }
  }
});


$("#saveBtn").addEventListener("click", async ()=>{
  const selectedNatures = $$("#natureInput input:checked").map(cb => cb.value);

  const p = {
    id: currentEditingId || undefined, 
    firstName: $("#firstNameInput").value.trim(),
    lastName: $("#lastNameInput").value.trim(),
    photoUrl: photoDataUrl || null,
    grade: $("#gradeInput").value || null,
    village: $("#villageInput").value || null,
    kekkeiGenkai: $("#kekkeiGenkaiInput").value || null,
    clan: $("#clanInput").value || null,
    chakraNatures: selectedNatures.length > 0 ? selectedNatures : null, 
    information: $("#informationInput").innerHTML.trim() || null,
    status: $("#statusInput").value || null
  };
  
  if(!p.firstName || !p.lastName){
    alert("Prénom et nom sont obligatoires."); return;
  }
  
  const { data: updatedPerson, error } = await supabaseClient
    .from('people')
    .upsert(p)
    .select()
    .single(); 

  if(error){
    console.error("Erreur de sauvegarde:", error.message);
    alert(`La sauvegarde a échoué: ${error.message}`);
  } else {
    if (currentEditingId) {
      const index = PEOPLE.findIndex(person => person.id === currentEditingId);
      if (index > -1) {
        PEOPLE[index] = updatedPerson; 
      }
    } else {
      PEOPLE.push(updatedPerson); 
    }
    
    sortPeople(); 
    renderGrid(); 
    personModal.close();
  }
});


$("#closeEditBtn").addEventListener("click", ()=> personModal.close());

// Persistence & load
async function loadPeople(){
  const { data, error } = await supabaseClient
    .from('people')
    .select('*');

  if(error) {
    console.error("Erreur de chargement:", error.message);
    alert("Impossible de charger les données. Vérifiez la console (F12).");
    return;
  }
  
  PEOPLE = data || [];
  sortPeople();
  renderGrid();
}

// Sort buttons
sortButtons.lastName.addEventListener("click", () => {
  currentSortKey = "lastName";
  sortButtons.lastName.classList.add("active");
  sortButtons.firstName.classList.remove("active");
  sortPeople();
  renderGrid();
});

sortButtons.firstName.addEventListener("click", () => {
  currentSortKey = "firstName";
  sortButtons.firstName.classList.add("active");
  sortButtons.lastName.classList.remove("active");
  sortPeople();
  renderGrid();
});

// Filtres

// Nouvel écouteur pour les onglets de village
villageTabsContainer.addEventListener("click", (e) => {
  const target = e.target.closest(".village-tab");
  if (!target) return; 

  VILLAGE_FILTER = target.dataset.village;

  const oldActive = villageTabsContainer.querySelector(".active");
  if (oldActive) {
    oldActive.classList.remove("active");
  }
  target.classList.add("active");

  renderGrid();
});

kekkeiFilter.addEventListener("input", (e) => {
  KEKKEI_FILTER = e.target.value;
  renderGrid();
});

clanFilter.addEventListener("input", (e) => {
  CLAN_FILTER = e.target.value;
  renderGrid();
});

// Écouteur pour le filtre de statut
statusFilter.addEventListener("input", (e) => {
  STATUS_FILTER = e.target.value;
  renderGrid();
});

// Écouteur pour le filtre de nature
natureFilter.addEventListener("input", (e) => {
  NATURE_FILTER = e.target.value;
  renderGrid();
});

// Mettre à jour le bouton d'effacement
clearFiltersBtn.addEventListener("click", () => {
  // Réinitialise tout à "zéro"
  VILLAGE_FILTER = "";
  KEKKEI_FILTER = "";
  CLAN_FILTER = "";
  STATUS_FILTER = ""; 
  NATURE_FILTER = ""; 
  
  kekkeiFilter.value = "";
  clanFilter.value = "";
  statusFilter.value = ""; 
  natureFilter.value = ""; 
  
  // Réinitialiser les onglets de village
  const oldActive = villageTabsContainer.querySelector(".active");
  if (oldActive) {
    oldActive.classList.remove("active");
  }
  villageTabsContainer.querySelector('[data-village=""]').classList.add("active");

  renderGrid();
});


// Logique pour limiter les cases à cocher à 2
natureInput.addEventListener('change', (e) => {
  if (e.target.type !== 'checkbox') return; 

  const checkedCount = $$("#natureInput input:checked").length;
  if (checkedCount > 2) {
    alert("Vous ne pouvez sélectionner que 2 natures de chakra au maximum.");
    e.target.checked = false; 
  }
});


// Init
async function init() {
  await loadPeople();
  await checkSession();
}

init();