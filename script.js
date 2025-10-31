const CONFIG = window.APP_CONFIG;
let PEOPLE = [];
let FILTER = "";
let isAdmin = false;
let adminMode = false;
let currentSortKey = "lastName"; // "lastName" ou "firstName"

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const grid = $("#grid");
const statsEl = $("#stats");
const modal = $("#personModal");
const dropZone = $("#dropZone");
const photoFile = $("#photoFile");
const toast = $("#toast");
const undoBtn = $("#undoBtn");
const sortButtons = {
  lastName: $("#sortLastNameBtn"),
  firstName: $("#sortFirstNameBtn"),
};

let currentEditingId = null;
let photoDataUrl = null;
let deletedStack = [];

function debounce(fn, delay = 150){
  let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),delay)}
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * NOUVELLE FONCTION : Compresse et redimensionne une image
 * @param {string} dataUrl - L'image en Data URL (base64)
 * @param {number} maxWidth - Largeur maximale
 * @param {number} maxHeight - Hauteur maximale
 * @param {number} quality - Qualité JPEG (0 à 1)
 * @returns {Promise<string>} - La nouvelle image en Data URL (base64, JPEG)
 */
function compressImage(dataUrl, maxWidth = 600, maxHeight = 600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calcul du redimensionnement en gardant les proportions
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

      // Résout avec la nouvelle image en JPEG
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function personMatches(p, term){
  if(!term) return true;
  const hay = (p.firstName+" "+p.lastName+" "+(p.role||"")+" "+(p.tags||[]).join(" ")).toLowerCase();
  return hay.includes(term.toLowerCase());
}

/**
 * NOUVELLE FONCTION : Trie le tableau PEOPLE en place
 */
function sortPeople() {
  PEOPLE.sort((a, b) => {
    const aFirst = (a.firstName || '').toLowerCase();
    const bFirst = (b.firstName || '').toLowerCase();
    const aLast = (a.lastName || '').toLowerCase();
    const bLast = (b.lastName || '').toLowerCase();

    if (currentSortKey === 'firstName') {
      // Tri par prénom, puis par nom
      return aFirst.localeCompare(bFirst) || aLast.localeCompare(bLast);
    }
    // Tri par nom (défaut), puis par prénom
    return aLast.localeCompare(bLast) || aFirst.localeCompare(bFirst);
  });
}

function renderGrid(){
  const frag = document.createDocumentFragment();
  grid.innerHTML = "";
  const tmpl = $("#cardTemplate");

  // Le tri est déjà fait dans PEOPLE, on filtre seulement
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
  $("#modalRoleView").textContent = p.role || "";
  $("#modalBioView").textContent = p.bio || "";
  const tags = $("#modalTags");
  tags.innerHTML = "";
  (p.tags||[]).forEach(t=>{
    const span = document.createElement("span");
    span.className = "tag"; span.textContent = t; tags.appendChild(span);
  });
  // read-only vs edit fields
  $$(".ro").forEach(el=>el.classList.remove("hidden"));
  $$(".ed").forEach(el=>el.classList.add("hidden"));
  $("#editActions").classList.add("hidden");
  dropZone.classList.add("hidden");
  modal.showModal();
  
  // AMÉLIORATION Accessibilité
  requestAnimationFrame(() => $("#modalClose").focus());
}

function openModalEdit(p){
  currentEditingId = p?.id || null;
  photoDataUrl = p?.photoUrl || null;
  $("#modalPhoto").src = photoDataUrl || "";
  $("#firstNameInput").value = p?.firstName || "";
  $("#lastNameInput").value = p?.lastName || "";
  $("#roleInput").value = p?.role || "";
  $("#bioInput").value = p?.bio || "";
  $("#tagsInput").value = (p?.tags||[]).join(", ");
  // show edit fields
  $$(".ro").forEach(el=>el.classList.add("hidden"));
  $$(".ed").forEach(el=>el.classList.remove("hidden"));
  $("#editActions").classList.remove("hidden");
  dropZone.classList.remove("hidden");
  modal.showModal();
  
  // AMÉLIORATION Accessibilité
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

/**
 * FONCTION MISE À JOUR : Gère les fichiers (upload/drop/paste)
 * Utilise maintenant la compression d'image.
 */
async function handleFiles(files) {
  const f = files && files[0];
  if (!f) return;
  if (!f.type.startsWith("image/")) return alert("Veuillez déposer une image.");

  try {
    const data = await readFileToDataURL(f);
    // AMÉLIORATION Performance : Compresser l'image avant de la stocker
    const compressedData = await compressImage(data);
    photoDataUrl = compressedData;
    $("#modalPhoto").src = compressedData;
  } catch (err) {
    console.error("Erreur lors de la compression de l'image:", err);
    alert("Une erreur est survenue lors du traitement de l'image.");
  }
}

$("#modalClose").addEventListener("click",()=>modal.close());
modal.addEventListener('click', (e)=>{ if(e.target === modal) modal.close(); });

// Card interactions
grid.addEventListener('click', (e)=>{
  const card = e.target.closest('.card');
  if(!card) return;
  const id = card.dataset.id;
  const p = PEOPLE.find(x=>x.id===id);
  if(!p) return;

  if(e.target.classList.contains("card-del")){
    // AMÉLIORATION UX : Confirmation avant suppression
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${p.firstName} ${p.lastName} ?`)) {
      return;
    }
    
    // one-click delete with undo
    deletedStack.push({ person: p, index: PEOPLE.findIndex(x=>x.id===id) });
    PEOPLE = PEOPLE.filter(x=>x.id!==id);
    savePeople(); renderGrid();
    showToast();
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

// Admin auth & mode
async function adminLoginFlow(){
  if(isAdmin){
    // toggle switch visibility
    $("#adminSwitchWrap").classList.toggle("hidden", false);
    adminMode = !adminMode;
    $("#adminModeSwitch").checked = adminMode;
    toggleAdminUI(adminMode);
    return;
  }
  const pass = prompt("Mot de passe admin :");
  if(!pass) return;
  const hash = await sha256Hex(pass);
  if(hash === CONFIG.adminPasswordHash){
    isAdmin = true;
    $("#adminSwitchWrap").classList.remove("hidden");
    $("#addBtn").classList.remove("hidden");
    $("#exportBtn").classList.remove("hidden");
    $("#importWrap").classList.remove("hidden");
    adminMode = true;
    $("#adminModeSwitch").checked = true;
    toggleAdminUI(true);
  } else {
    alert("Mot de passe incorrect.");
  }
}

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
  adminMode = e.target.checked;
  toggleAdminUI(adminMode);
});

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
$("#importFile").addEventListener("change", async (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const txt = await f.text();
  const data = JSON.parse(txt);
  if(Array.isArray(data)){
    PEOPLE = data.map(p=> ({...p, id: p.id || crypto.randomUUID()}));
    sortPeople(); // Tri après import
    savePeople(); renderGrid();
  }
});

// Dropzone & file selection & paste
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
$("#saveBtn").addEventListener("click", ()=>{
  const p = {
    id: currentEditingId || crypto.randomUUID(),
    firstName: $("#firstNameInput").value.trim(),
    lastName: $("#lastNameInput").value.trim(),
    photoUrl: photoDataUrl || "",
    role: $("#roleInput").value.trim(),
    bio: $("#bioInput").value.trim(),
    tags: $("#tagsInput").value.split(",").map(t=>t.trim()).filter(Boolean)
  };
  if(!p.firstName || !p.lastName){
    alert("Prénom et nom sont obligatoires."); return;
  }
  const idx = PEOPLE.findIndex(x=>x.id===p.id);
  if(idx>=0) PEOPLE[idx]=p; else PEOPLE.push(p);
  
  // MISE À JOUR : Utilise la nouvelle fonction de tri
  sortPeople();
  
  savePeople(); renderGrid();
  modal.close();
});
$("#closeEditBtn").addEventListener("click", ()=> modal.close());

// Undo toast
function showToast(){
  toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toast.classList.add("hidden"), 5000);
}
undoBtn.addEventListener("click", ()=>{
  const last = deletedStack.pop();
  if(!last) return;
  PEOPLE.splice(last.index, 0, last.person);
  // Pas besoin de re-trier, on le remet à sa place exacte
  savePeople(); renderGrid();
  toast.classList.add("hidden");
});

// Persistence & load
function savePeople(){
  localStorage.setItem("people-data", JSON.stringify(PEOPLE));
}

async function loadPeople(){
  const cached = localStorage.getItem("people-data");
  if(cached){
    try{ PEOPLE = JSON.parse(cached); }catch{}
  }
  try{
    const res = await fetch("data/people.json", {cache:'no-store'});
    if(res.ok){
      const remote = await res.json();
      const byId = new Map((PEOPLE||[]).map(p=>[p.id,p]));
      remote.forEach(p=>byId.set(p.id||crypto.randomUUID(), {...p, id:p.id||crypto.randomUUID()}));
      PEOPLE = Array.from(byId.values());
      
      // MISE À JOUR : Utilise la nouvelle fonction de tri
      sortPeople();
      savePeople();
    }
  }catch{}
  renderGrid();
}

// NOUVEAU : Listeners pour les boutons de tri
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
loadPeople();