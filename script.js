// script.js (Version Finale avec Authentification)

const CONFIG = window.APP_CONFIG;
let PEOPLE = [];
let FILTER = "";
let isAdmin = false;
let adminMode = false;
let currentSortKey = "lastName";

// Initialisation de Supabase
const { createClient } = supabase;
const supabaseClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);


const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// Sélecteurs
const grid = $("#grid");
const statsEl = $("#stats");
const modal = $("#personModal");
const dropZone = $("#dropZone");
const photoFile = $("#photoFile");
const sortButtons = {
  lastName: $("#sortLastNameBtn"),
  firstName: $("#sortFirstNameBtn"),
};

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
    img.src = p.photoUrl;
    img.alt = `${p.firstName} ${p.lastName}`;
    c.querySelector('.card-name').textContent = `${p.firstName} ${p.lastName}`;
    const del = c.querySelector('.card-del');
    if(adminMode){ del.classList.remove("hidden"); }
    frag.appendChild(c);
  });
  grid.appendChild(frag);
  statsEl.textContent = `${filtered.length} / ${PEOPLE.length} personnes`;
}

function openModalReadOnly(p){
  $("#modalPhoto").src = p.photoUrl;
  $("#modalNameView").textContent = `${p.firstName} ${p.lastName}`;
  $("#modalGradeView").textContent = p.grade || "N/A";
  $("#modalInfoView").textContent = p.information || "";
  const tags = $("#modalTags");
  tags.innerHTML = "";
  (p.tags||[]).forEach(t=>{
    const span = document.createElement("span");
    span.className = "tag"; span.textContent = t; tags.appendChild(span);
  });
  $$(".ro").forEach(el=>el.classList.remove("hidden"));
  $$(".ed").forEach(el=>el.classList.add("hidden"));
  $("#editActions").classList.add("hidden");
  dropZone.classList.add("hidden");
  modal.showModal();
  requestAnimationFrame(() => $("#modalClose").focus());
}

function openModalEdit(p){
  currentEditingId = p?.id || null;
  photoDataUrl = p?.photoUrl || null;
  $("#modalPhoto").src = photoDataUrl || "";
  $("#firstNameInput").value = p?.firstName || "";
  $("#lastNameInput").value = p?.lastName || "";
  $("#gradeInput").value = p?.grade || "";
  $("#informationInput").value = p?.information || "";
  $("#tagsInput").value = (p?.tags||[]).join(", ");
  $$(".ro").forEach(el=>el.classList.add("hidden"));
  $$(".ed").forEach(el=>el.classList.remove("hidden"));
  $("#editActions").classList.remove("hidden");
  dropZone.classList.remove("hidden");
  modal.showModal();
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

$("#modalClose").addEventListener("click",()=>modal.close());
modal.addEventListener('click', (e)=>{ if(e.target === modal) modal.close(); });

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
    
    const { error } = await supabaseClient
      .from('people')
      .delete()
      .eq('id', p.id);

    if (error) {
      console.error("Erreur de suppression:", error);
      alert("La suppression a échoué.");
    } else {
      loadPeople(); 
    }
    return;
  }

  if(adminMode){
    openModalEdit(p);
  } else {
    openModalReadOnly(p);
  }
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

// --- AUTHENTIFICATION (SECTION MISE À JOUR) ---

/**
 * Affiche ou cache les boutons d'administration
 * @param {boolean} state - true pour admin, false pour public
 */
function setAdminUIVisible(state) {
  isAdmin = state;
  adminMode = state; // Par défaut, si on est admin, on est en mode admin
  
  $("#adminSwitchWrap").classList.toggle("hidden", !state);
  $("#addBtn").classList.toggle("hidden", !state);
  $("#exportBtn").classList.toggle("hidden", !state);
  $("#importWrap").classList.add("hidden"); // L'import est désactivé
  
  if (state) {
    $("#adminModeSwitch").checked = true;
  }
  
  toggleAdminUI(state);
}

/**
 * Gère la connexion/déconnexion admin
 */
async function adminLoginFlow(){
  // 1. Vérifie si on est déjà connecté
  const { data: { session } } = await supabaseClient.auth.getSession();
  
  if (session) {
    // Si oui, on se déconnecte
    const logout = confirm("Vous êtes connecté. Voulez-vous vous déconnecter ?");
    if(logout) {
      const { error } = await supabaseClient.auth.signOut();
      if(error) {
        alert("Erreur lors de la déconnexion.");
      } else {
        setAdminUIVisible(false);
      }
    }
    return;
  }

  // 2. Si non, on tente de se connecter
  const email = prompt("Email admin :");
  if(!email) return;
  const pass = prompt("Mot de passe admin :");
  if(!pass) return;

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: pass,
  });

  if(error){
    alert("Email ou mot de passe incorrect.");
  } else {
    // Connexion réussie !
    alert("Connecté !");
    setAdminUIVisible(true);
  }
}

/**
 * Gère le basculement visuel du mode admin (icônes poubelle)
 */
function toggleAdminUI(state){
  if(state){
    $$(".card-del").forEach(b=>b.classList.remove("hidden"));
  }else{
    $$(".card-del").forEach(b=>b.classList.add("hidden"));
  }
  renderGrid();
}

$("#adminLoginToggle").addEventListener("click", adminLoginFlow);

$("#adminModeSwitch").addEventListener("change", (e)=>{
  // On ne peut désactiver le mode admin que si on est admin
  if(!isAdmin) {
    e.target.checked = false;
    return;
  }
  adminMode = e.target.checked;
  toggleAdminUI(adminMode);
});

/**
 * Vérifie la session au chargement de la page
 */
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
  if(!modal.open || !adminMode) return;
  const items = e.clipboardData?.items || [];
  for(const it of items){
    if(it.type.startsWith("image/")){
      handleFiles([it.getAsFile()]);
      break;
    }
  }
});

// Save / Cancel
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
  
  const { data, error } = await supabaseClient
    .from('people')
    .upsert(p)
    .select();

  if(error){
    console.error("Erreur de sauvegarde:", error);
    alert("La sauvegarde a échoué. Vérifiez la console (F12).");
  } else {
    await loadPeople();
    modal.close();
  }
});
$("#closeEditBtn").addEventListener("click", ()=> modal.close());

// Persistence & load
function savePeople(){
  // N'est plus utilisé.
}

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