const CONFIG = window.APP_CONFIG;
let PEOPLE = [];
let FILTER = "";
let isAdmin = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const grid = $("#grid");
const statsEl = $("#stats");
const modal = $("#personModal");

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
    frag.appendChild(c);
  });
  grid.appendChild(frag);
  statsEl.textContent = `${filtered.length} / ${PEOPLE.length} personnes`;
}

function openModal(p){
  $("#modalPhoto").src = p.photoUrl;
  $("#modalName").textContent = `${p.firstName} ${p.lastName}`;
  $("#modalRole").textContent = p.role || "";
  $("#modalBio").textContent = p.bio || "";
  const tags = $("#modalTags");
  tags.innerHTML = "";
  (p.tags||[]).forEach(t=>{
    const span = document.createElement("span");
    span.className = "tag"; span.textContent = t; tags.appendChild(span);
  });
  modal.showModal();
}

$("#modalClose").addEventListener("click",()=>modal.close());
modal.addEventListener('click', (e)=>{ if(e.target === modal) modal.close(); });

grid.addEventListener('click', (e)=>{
  const card = e.target.closest('.card');
  if(!card) return;
  const p = PEOPLE.find(x=>x.id===card.dataset.id);
  if(p) openModal(p);
});

grid.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    const card = e.target.closest('.card');
    if(card){
      const p = PEOPLE.find(x=>x.id===card.dataset.id);
      if(p) openModal(p);
    }
  }
});

$("#searchInput").addEventListener("input", debounce(e=>{
  FILTER = e.target.value.trim();
  renderGrid();
}, 180));
$("#clearSearch").addEventListener("click", ()=>{
  $("#searchInput").value = ""; FILTER = ""; renderGrid();
});

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

async function adminLogin(){
  const pass = $("#adminPassword").value;
  const hash = await sha256Hex(pass);
  if(hash === CONFIG.adminPasswordHash){
    isAdmin = true;
    $("#adminLogin").classList.add("hidden");
    $("#adminActions").classList.remove("hidden");
  } else {
    $("#adminLoginMsg").textContent = "Mot de passe incorrect.";
  }
}

function requireAdmin(){ if(!isAdmin){ alert('Veuillez vous connecter en admin.'); return false;} return true; }

function upsertPersonFromForm(){
  const id = $("#pfId").value || crypto.randomUUID();
  const p = {
    id,
    firstName: $("#pfFirstName").value.trim(),
    lastName: $("#pfLastName").value.trim(),
    photoUrl: $("#pfPhotoUrl").value.trim(),
    role: $("#pfRole").value.trim(),
    bio: $("#pfBio").value.trim(),
    tags: $("#pfTags").value.split(",").map(t=>t.trim()).filter(Boolean)
  };
  const idx = PEOPLE.findIndex(x=>x.id===id);
  if(idx>=0) PEOPLE[idx]=p; else PEOPLE.push(p);
  PEOPLE.sort((a,b)=> (a.lastName||'').localeCompare(b.lastName||'') || (a.firstName||'').localeCompare(b.firstName||''));
  savePeople();
  renderGrid();
  alert("Personne enregistrée !");
}

function deletePerson(){
  if(!requireAdmin()) return;
  const id = $("#pfId").value; if(!id) return;
  PEOPLE = PEOPLE.filter(p=>p.id!==id);
  savePeople();
  renderGrid();
}

function exportJson(){
  if(!requireAdmin()) return;
  const blob = new Blob([JSON.stringify(PEOPLE, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "people.json";
  a.click();
}

$("#adminFab").addEventListener("click", ()=> $("#adminPanel").showModal());
$("#adminClose").addEventListener("click", ()=> $("#adminPanel").close());
$("#adminLoginBtn").addEventListener("click", adminLogin);
$("#savePersonBtn").addEventListener("click", ()=>{ if(requireAdmin()) upsertPersonFromForm(); });
$("#deletePersonBtn").addEventListener("click", deletePerson);
$("#exportJsonBtn").addEventListener("click", exportJson);
$("#importBtn").addEventListener("click", async ()=>{
  if(!requireAdmin()) return;
  const f = $("#importFile").files[0];
  if(!f) return;
  const txt = await f.text();
  const data = JSON.parse(txt);
  if(Array.isArray(data)){
    PEOPLE = data.map(p=> ({...p, id: p.id || crypto.randomUUID()}));
    savePeople();
    renderGrid();
  }
});

loadPeople();
