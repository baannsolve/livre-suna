const CONFIG = window.APP_CONFIG;
let PEOPLE = [];
let FILTER = "";
let isAdmin = false;
let adminMode = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const grid = $("#grid");
const statsEl = $("#stats");
const modal = $("#personModal");
const dropZone = $("#dropZone");
const photoFile = $("#photoFile");
const toast = $("#toast");
const undoBtn = $("#undoBtn");

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

function personMatches(p, term){
  if(!term) return true;
  const hay = (p.firstName+" "+p.lastName+" "+(p.role||"")+" "+(p.tags||[]).join(" ")).toLowerCase();
  return hay.includes(term.toLowerCase());
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
}

function readFileToDataURL(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handleFiles(files){
  const f = files && files[0];
  if(!f) return;
  if(!f.type.startsWith("image/")) return alert("Veuillez déposer une image.");
  readFileToDataURL(f).then((data)=>{
    photoDataUrl = data;
    $("#modalPhoto").src = data;
  });
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
  PEOPLE.sort((a,b)=> (a.lastName||'').localeCompare(b.lastName||'') || (a.firstName||'').localeCompare(b.firstName||''));
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
      PEOPLE.sort((a,b)=> (a.lastName||'').localeCompare(b.lastName||'') || (a.firstName||'').localeCompare(b.firstName||''));
      savePeople();
    }
  }catch{}
  renderGrid();
}

loadPeople();
