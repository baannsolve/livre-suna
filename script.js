// script.js (Version avec correctif de sauvegarde et de structure)

const CONFIG = window.APP_CONFIG;
let PEOPLE = [];
let FILTER = "";
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

// Sélecteurs Modal Personne
const personModal = $("#personModal");
const dropZone = $("#dropZone");
const photoFile = $("#photoFile");

// Sélecteurs Modal Connexion
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

function personMatches(p, term){
  if(!term) return true;
  const hay = (p.firstName+" "+p.lastName+" "+(p.grade||"")+" "+(p.information||"")+" "+(p.tags||[]).join(" ")).toLowerCase();
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
  const filtered = PEOPLE.filter(p=>personMatches(p,FILTER));
  
  filtered.forEach(p=>{
    const c = tmpl.content.firstElementChild.cloneNode(true);
    c.dataset.id = p.id;
    const img = c.querySelector('.card-img');
    img.src = p.photoUrl || PLACEHOLDER_IMG;
    img.alt = `${p.firstName} ${p.lastName}`;
    c.querySelector('.card-name').textContent = `${p.firstName} ${p.lastName}`;
    const del = c.querySelector('.card-del');
    if(adminMode){ del.classList.remove("hidden"); }
    frag.appendChild(c);
  });
  grid.appendChild(frag);
  statsEl.textContent = `${filtered.length} / ${PEOPLE.length} personnes`;
}

// --- LOGIQUE D'OUVERTURE MODALE CORRIGÉE ---

function openModalReadOnly(p){
  $("#modalPhoto").src = p.photoUrl || PLACEHOLDER_IMG;
  $("#modalNameView").textContent = `${p.firstName} ${p.lastName}`;
  $("#modalGradeView").textContent = p.grade || "N/A";
  $("#modalInfoView").textContent = p.information || "";
  const tags = $("#modalTags");
  tags.innerHTML = "";
  (p.tags||[]).forEach(t=>{
    const span = document.createElement("span");
    span.className = "tag"; span.textContent = t; tags.appendChild(span);
  });
  
  // Afficher/Cacher les bons champs
  $$(".ro").forEach(el=>el.classList.remove("hidden"));
  $$(".ed").forEach(el=>el.classList.add("hidden"));
  $("#editActions").classList.add("hidden");
  
  // Cacher la zone de dépôt (on veut voir que l'image)
  dropZone.classList.add("hidden"); 

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
  $("#informationInput").value = p?.information || "";
  $("#tagsInput").value = (p?.tags||[]).join(", ");
  
  // Afficher/Cacher les bons champs
  $$(".ro").forEach(el=>el.classList.add("hidden"));
  $$(".ed").forEach(el=>el.classList.remove("hidden"));
  $("#editActions").classList.remove("hidden");
  
  // Afficher la zone de dépôt (par-dessus l'image)
  dropZone.classList.remove("hidden");

  personModal.showModal();
  requestAnimationFrame(() => $("#firstNameInput").focus());
}
// --- FIN LOGIQUE MODALE ---


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
    $("#modalPhoto").src = compressedData; // Met à jour l'image en arrière-plan
  } catch (err)
 {
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
      console.error("Erreur de suppression:", error);
      alert("La suppression a échoué.");
    } else {
      // Supprimer localement et re-rendre (plus rapide)
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
  $("#importWrap").classList.add("hidden");
  
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


// Add / Export / Import
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
$("#importFile").addEventListener("change", (e)=>{
  alert("L'importation de JSON est désactivée avec Supabase.");
  e.target.value = null;
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

// --- FONCTION DE SAUVEGARDE (CORRIGÉE) ---
$("#saveBtn").addEventListener("click", async ()=>{
  const p = {
    id: currentEditingId || undefined, 
    firstName: $("#firstNameInput").value.trim(),
    lastName: $("#lastNameInput").value.trim(),
    photoUrl: photoDataUrl || null,
    grade: $("#gradeInput").value || null,
    information: $("#informationInput").value.trim() || null,
    tags: $("#tagsInput").value.split(",").map(t=>t.trim()).filter(Boolean)
  };
  
  if(!p.firstName || !p.lastName){
    alert("Prénom et nom sont obligatoires."); return;
  }
  
  // 1. Sauvegarder dans Supabase ET demander la ligne en retour
  const { data, error } = await supabaseClient
    .from('people')
    .upsert(p)
    .select()
    .single(); // On attend un seul objet en retour

  if(error){
    console.error("Erreur de sauvegarde:", error);
    alert("La sauvegarde a échoué. Vérifiez la console (F12).");
  } else {
    // 2. Mettre à jour la liste LOCALE (au lieu de tout recharger)
    if (currentEditingId) {
      // C'était une MODIFICATION
      const idx = PEOPLE.findIndex(person => person.id === currentEditingId);
      if (idx > -1) PEOPLE[idx] = data; // Remplacer l'ancien objet
    } else {
      // C'était un AJOUT
      PEOPLE.push(data); // Ajouter le nouvel objet
    }
    
    // 3. Re-trier et re-rendre
    sortPeople();
    renderGrid();
    personModal.close();
  }
});
// --- FIN FONCTION DE SAUVEGARDE ---

$("#closeEditBtn").addEventListener("click", ()=> personModal.close());

// Persistence & load
async function loadPeople(){
  const { data, error } = await supabaseClient
    .from('people')
    .select('*');

  if(error) {
    console.error("Erreur de chargement:", error);
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

// Init
async function init() {
  await loadPeople();
  await checkSession(); // Vérifie si l'admin est déjà connecté
}

init();