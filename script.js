// script.js (Version avec masquage des champs N/A et correctif ENUM)

const CONFIG = window.APP_CONFIG;
let PEOPLE = [];
let FILTER = "";
let VILLAGE_FILTER = "";
let KEKKEI_FILTER = "";
let CLAN_FILTER = "";
let isAdmin = false;
let adminMode = false;
let currentSortKey = "lastName";

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

const villageFilter = $("#villageFilter");
const kekkeiFilter = $("#kekkeiFilter");
const clanFilter = $("#clanFilter");
const clearFiltersBtn = $("#clearFiltersBtn");

const personModal = $("#personModal");
const dropZone = $("#dropZone");
const photoFile = $("#photoFile");
const statusInput = $("#statusInput");

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

function personMatches(p, term){
  if(!term) return true;
  const hay = (p.firstName+" "+p.lastName+" "+(p.grade||"")+" "+(p.information||"")+" "+(p.clan||"")).toLowerCase();
  return hay.includes(term.toLowerCase());
}

function sortPeople() {
  PEOPLE.sort((a, b) => {
    const aFirst = (a.firstName || '').toLowerCase();
    const bFirst = (b.firstName || '').toLowerCase();
    const aLast = (a.lastName || '').toLowerCase();
    const bLast = (b.lastName || '').toLowerCase();
    if (currentSortKey === 'firstName') {
      return aFirst.localeCompare(bFirst) || aLast.localeCompare(bLast);
    }
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
    const kekkeiMatch = !KEKKEI_FILTER || p.kekkeiGenkai === KEKKEI_FILTER;
    const clanMatch = !CLAN_FILTER || p.clan === CLAN_FILTER;
    return searchMatch && villageMatch && kekkeiMatch && clanMatch;
  });
  
  filtered.forEach(p=>{
    const c = tmpl.content.firstElementChild.cloneNode(true);
    c.dataset.id = p.id;
    const img = c.querySelector('.card-img');
    img.src = p.photoUrl || PLACEHOLDER_IMG;
    img.alt = `${p.firstName} ${p.lastName}`;
    c.querySelector('.card-name').textContent = `${p.firstName} ${p.lastName}`;
    
    // Logique du logo KG
    const kgLogo = c.querySelector('.card-kg-logo');
    if (p.kekkeiGenkai) {
      kgLogo.src = `kg/${p.kekkeiGenkai.toLowerCase()}.png`;
      kgLogo.alt = p.kekkeiGenkai;
      kgLogo.classList.remove('hidden');
    } else {
      kgLogo.classList.add('hidden');
    }

    // Logique du logo Village
    const villageLogo = c.querySelector('.card-village-logo');
    if (p.village) {
      villageLogo.src = `villages/${p.village.toLowerCase()}.png`;
      villageLogo.alt = p.village;
      villageLogo.classList.remove('hidden');
    } else {
      villageLogo.classList.add('hidden');
    }
    
    // Logique du logo de Rang
    const rankLogo = c.querySelector('.card-rank-logo');
    const rankImg = getRankImage(p.grade);
    if (rankImg) {
      rankLogo.src = `rangs/${rankImg}`;
      rankLogo.alt = p.grade;
      rankLogo.classList.remove('hidden');
    } else {
      rankLogo.classList.add('hidden');
    }
    
    // Gère le statut décédé
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

// CORRIGÉ : Logique de masquage des champs N/A
function openModalReadOnly(p){
  $("#modalPhoto").src = p.photoUrl || PLACEHOLDER_IMG;
  $("#modalNameView").textContent = `${p.firstName} ${p.lastName}`;
  
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
  if (p.clan) {
    $("#modalClanView").textContent = p.clan;
    clanInfo.classList.remove("hidden");
  } else {
    clanInfo.classList.add("hidden");
  }
  
  // Village
  const villageInfo = $("#villageInfo");
  if (p.village) {
    const villageName = p.village;
    const logoSrc = `villages/${villageName.toLowerCase()}.png`;
    $("#modalVillageView").innerHTML = `<img class="village-logo" src="${logoSrc}" alt="${villageName}"> ${villageName}`;
    villageInfo.classList.remove("hidden");
  } else {
    villageInfo.classList.add("hidden");
  }

  // Kekkei Genkai
  const kekkeiBox = $("#kekkeiInfo");
  const kekkeiContent = $("#modalKekkeiContent");
  if (p.kekkeiGenkai) {
    const kgName = p.kekkeiGenkai;
    const logoSrc = `kg/${kgName.toLowerCase()}.png`;
    
    $("#modalKekkeiLogo").src = logoSrc;
    $("#modalKekkeiLogo").alt = kgName;
    
    kekkeiContent.classList.remove("hidden");
    kekkeiBox.classList.remove("hidden");
  } else {
    kekkeiContent.classList.add("hidden");
    kekkeiBox.classList.add("hidden");
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
    infoView.innerHTML = p.information; // Utilise innerHTML
    infoView.classList.remove("hidden");
  } else {
    infoView.classList.add("hidden");
  }
  
  $$(".ro").forEach(el=>el.classList.remove("hidden"));
  $$(".ed").forEach(el=>el.classList.add("hidden"));
  $("#editActions").classList.add("hidden");
  dropZone.classList.add("hidden"); 

  personModal.showModal();
  requestAnimationFrame(() => $("#modalClose").focus());
}

// CORRIGÉ : Gère le 'null' (en mettant "") pour tous les champs ENUM
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
  $("#informationInput").innerHTML = p?.information || ""; // Utilise innerHTML
  $("#statusInput").value = p?.status || ""; // Gère 'null'
  
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

// CORRIGÉ : Tous les champs ENUM envoient 'null' au lieu de '""'
$("#saveBtn").addEventListener("click", async ()=>{
  const p = {
    id: currentEditingId || undefined, 
    firstName: $("#firstNameInput").value.trim(),
    lastName: $("#lastNameInput").value.trim(),
    photoUrl: photoDataUrl || null,
    grade: $("#gradeInput").value || null,
    village: $("#villageInput").value || null,
    kekkeiGenkai: $("#kekkeiGenkaiInput").value || null,
    clan: $("#clanInput").value || null,
    information: $("#informationInput").innerHTML.trim() || null,
    status: $("#statusInput").value || null
  };
  
  if(!p.firstName || !p.lastName){
    alert("Prénom et nom sont obligatoires."); return;
  }
  
  const { error } = await supabaseClient
    .from('people')
    .upsert(p)
    .select();

  if(error){
    console.error("Erreur de sauvegarde:", error.message);
    alert(`La sauvegarde a échoué: ${error.message}`);
  } else {
    await loadPeople();
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
villageFilter.addEventListener("input", (e) => {
  VILLAGE_FILTER = e.target.value;
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

clearFiltersBtn.addEventListener("click", () => {
  VILLAGE_FILTER = "";
  KEKKEI_FILTER = "";
  CLAN_FILTER = "";
  villageFilter.value = "";
  kekkeiFilter.value = "";
  clanFilter.value = "";
  renderGrid();
});


// Init
async function init() {
  await loadPeople();
  await checkSession();
}

init();