const CONFIG = window.APP_CONFIG;
let PEOPLE = [];
let FILTER = "";
let isAdmin = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function renderGrid() {
  const grid = $("#grid");
  grid.innerHTML = "";
  const tmpl = $("#cardTemplate");
  PEOPLE.filter(p => !FILTER || (p.firstName + p.lastName + (p.tags || []).join(" ")).toLowerCase().includes(FILTER.toLowerCase()))
    .forEach(p => {
      const c = tmpl.content.firstElementChild.cloneNode(true);
      c.querySelector(".card-image").style.backgroundImage = `url('${p.photoUrl}')`;
      c.querySelector(".card-name").textContent = p.firstName + " " + p.lastName;
      c.addEventListener("click", () => openModal(p));
      grid.appendChild(c);
    });
  $("#stats").textContent = `${PEOPLE.length} personnes`;
}

function openModal(p) {
  $("#modalPhoto").src = p.photoUrl;
  $("#modalName").textContent = p.firstName + " " + p.lastName;
  $("#modalRole").textContent = p.role || "";
  $("#modalBio").textContent = p.bio || "";
  const tags = $("#modalTags");
  tags.innerHTML = "";
  (p.tags || []).forEach(t => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = t;
    tags.appendChild(span);
  });
  $("#personModal").showModal();
}
$("#modalClose").addEventListener("click", () => $("#personModal").close());

$("#searchInput").addEventListener("input", e => {
  FILTER = e.target.value.trim();
  renderGrid();
});
$("#clearSearch").addEventListener("click", () => {
  $("#searchInput").value = "";
  FILTER = "";
  renderGrid();
});

async function loadPeople() {
  const res = await fetch("data/people.json");
  if (res.ok) PEOPLE = await res.json();
  renderGrid();
}

async function adminLogin() {
  const pass = $("#adminPassword").value;
  const hash = await sha256Hex(pass);
  if (hash === CONFIG.adminPasswordHash) {
    isAdmin = true;
    $("#adminLogin").classList.add("hidden");
    $("#adminActions").classList.remove("hidden");
  } else {
    $("#adminLoginMsg").textContent = "Mot de passe incorrect.";
  }
}

function savePeople() {
  localStorage.setItem("people-data", JSON.stringify(PEOPLE));
}

function savePerson() {
  const id = $("#pfId").value || crypto.randomUUID();
  const p = {
    id,
    firstName: $("#pfFirstName").value,
    lastName: $("#pfLastName").value,
    photoUrl: $("#pfPhotoUrl").value,
    role: $("#pfRole").value,
    bio: $("#pfBio").value,
    tags: $("#pfTags").value.split(",").map(t => t.trim()).filter(Boolean)
  };
  const idx = PEOPLE.findIndex(x => x.id === id);
  if (idx >= 0) PEOPLE[idx] = p; else PEOPLE.push(p);
  savePeople();
  renderGrid();
  alert("Personne enregistrée !");
}

function deletePerson() {
  const id = $("#pfId").value;
  if (!id) return;
  PEOPLE = PEOPLE.filter(p => p.id !== id);
  savePeople();
  renderGrid();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(PEOPLE, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "people.json";
  a.click();
}

$("#adminFab").addEventListener("click", () => $("#adminPanel").showModal());
$("#adminClose").addEventListener("click", () => $("#adminPanel").close());
$("#adminLoginBtn").addEventListener("click", adminLogin);
$("#savePersonBtn").addEventListener("click", savePerson);
$("#deletePersonBtn").addEventListener("click", deletePerson);
$("#exportJsonBtn").addEventListener("click", exportJson);
$("#importBtn").addEventListener("click", async () => {
  const f = $("#importFile").files[0];
  if (!f) return;
  const txt = await f.text();
  PEOPLE = JSON.parse(txt);
  renderGrid();
});

loadPeople();
