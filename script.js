const CONFIG = window.APP_CONFIG;

// --- ÉTAT GLOBAL ---
const STATE = {
    people: [],
    filters: { search: "", village: "Suna", kekkei: "", clan: "", status: "alive", nature: "" },
    isAdmin: false,
    currentEditingId: null,
    currentPhotoUrl: null,
};

// --- SYSTÈME DE SÉCURITÉ CIBLÉ (GRID ONLY) ---
const SecuritySystem = {
    config: {
        isEnabled: localStorage.getItem('seal_enabled') !== 'false', // Activé par défaut
        pinCode: localStorage.getItem('seal_pin') || '0000',       // Code par défaut
        isUnlocked: sessionStorage.getItem('seal_unlocked') === 'true'
    },

    init() {
        const overlay = document.getElementById('grid-lock-overlay');
        const grid = document.getElementById('grid');
        const pinInput = document.getElementById('pinInput');

        // 1. Vérifier l'état
        if (!this.config.isEnabled || this.config.isUnlocked) {
            this.unlockVisuals(true);
            return;
        }

        // 2. Verrouiller (Flou + Overlay)
        overlay.classList.remove('hidden');
        grid.classList.add('blur-locked');
        
        // 3. Focus automatique pratique pour l'utilisateur
        // On attend un peu que le DOM soit prêt visuellement
        setTimeout(() => pinInput?.focus(), 500);

        // 4. Écoute saisie PIN
        pinInput.addEventListener('keyup', (e) => {
            if (e.target.value.length === 4) {
                this.checkPin(e.target.value);
            }
        });
    },

    checkPin(inputCode) {
        const errorMsg = document.getElementById('pinErrorMsg');
        const inputField = document.getElementById('pinInput');

        if (inputCode === this.config.pinCode) {
            // SUCCÈS
            this.unlockVisuals();
            sessionStorage.setItem('seal_unlocked', 'true');
            inputField.blur();
        } else {
            // ÉCHEC
            errorMsg.classList.remove('hidden');
            inputField.value = '';
            inputField.classList.add('shake-anim'); // Animation CSS si dispo
            setTimeout(() => errorMsg.classList.add('hidden'), 2000);
        }
    },

    unlockVisuals(immediate = false) {
        const overlay = document.getElementById('grid-lock-overlay');
        const grid = document.getElementById('grid');

        if (immediate) {
            overlay.classList.add('hidden');
            grid.classList.remove('blur-locked');
        } else {
            // Petite transition de sortie
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                overlay.classList.add('hidden');
                grid.classList.remove('blur-locked');
                // Reset style pour prochaine fois
                overlay.style.opacity = '';
            }, 500);
        }
    },

    updateSettings(isEnabled, newPin) {
        this.config.isEnabled = isEnabled;
        this.config.pinCode = newPin;

        localStorage.setItem('seal_enabled', isEnabled);
        localStorage.setItem('seal_pin', newPin);

        showToast("Paramètres de sécurité mis à jour !");
        
        // Si on active la sécurité, on recharge pour appliquer le flou
        if (isEnabled && !sessionStorage.getItem('seal_unlocked')) {
            setTimeout(() => location.reload(), 500);
        }
    }
};

// --- CLIENT SUPABASE & OUTILS ---
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

// --- UI MANAGER ---
const UIManager = {
    getRankImage(grade) {
        if (!grade) return null;
        const map = { 
            'genin': 'rangd.png', 'genin confirmé': 'rangc.png', 
            'chunin': 'rangb.png', 'tokubetsu chunin': 'rangb.png', 
            'chunin confirmé': 'ranga.png', 'tokubetsu jonin': 'ranga.png', 
            'jonin': 'rangs.png', 'commandant jonin': 'rangs.png', 
            'kage': 'rangss.png' 
        };
        return map[grade.toLowerCase()] || null;
    },
    getKageImage(village) {
        if (!village) return null;
        const map = { 'konoha': 'hokage.png', 'suna': 'kazekage.png', 'kiri': 'mizukage.png', 'kumo': 'raikage.png', 'iwa': 'tsuchikage.png' };
        return map[village.toLowerCase()] || null;
    },

    renderGrid() {
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
            card.dataset.id = p.id; 
            card.style.animationDelay = `${Math.min(idx * 50, 1000)}ms`;
            
            const img = card.querySelector('.card-img'); 
            img.src = p.photoUrl || PLACEHOLDER_IMG;
            card.querySelector('.card-name').textContent = `${p.firstName} ${p.lastName}`;
            
            const setLogo = (sel, src) => { const el = card.querySelector(sel); if(src) { el.src = src; el.classList.remove('hidden'); } };
            setLogo('.card-kg-logo', p.kekkeiGenkai && p.kekkeiGenkai !== 'Aucun' ? `kg/${p.kekkeiGenkai.toLowerCase()}.png` : null);
            setLogo('.card-village-logo', p.village ? `villages/${p.village.toLowerCase()}.png` : null);
            setLogo('.card-rank-logo', this.getRankImage(p.grade) ? `rangs/${this.getRankImage(p.grade)}` : null);
            setLogo('.card-kage-logo', p.grade === 'Kage' ? `kage/${this.getKageImage(p.village)}` : null);

            if(p.chakraNatures?.length > 0){ 
                const wrap = card.querySelector('.card-natures-wrapper'); 
                wrap.classList.remove('hidden'); 
                p.chakraNatures.slice(0,2).forEach(n => { 
                    const i = document.createElement('img'); i.src = `natures/${n.toLowerCase()}.png`; wrap.appendChild(i); 
                }); 
            }

            if (p.status === 'deceased') { 
                card.classList.add('card--deceased'); 
                card.querySelector('.status-badge').classList.remove('hidden'); 
            }
            
            if (STATE.isAdmin) {
                const delBtn = card.querySelector('.card-del');
                delBtn.classList.remove('hidden');
                delBtn.onclick = (e) => { e.stopPropagation(); if(confirm(`Supprimer ${p.firstName} ?`)) DataManager.deletePerson(p.id); };
            }

            card.onclick = (e) => { 
                // Petite sécurité supplémentaire : empêcher le clic si flouté (géré aussi par CSS pointer-events)
                if(document.getElementById('grid').classList.contains('blur-locked')) return;
                if(!e.target.closest('.card-del')) this.openModal(p, STATE.isAdmin); 
            };
            frag.appendChild(clone);
        });
        grid.appendChild(frag);
    },

    openModal(p, editMode = false) {
        const modal = $("#personModal");
        if (!editMode && p) {
            const isDead = p.status === 'deceased';
            $("#modalPhoto").src = p.photoUrl || PLACEHOLDER_IMG;
            $("#modalPhoto").style.filter = isDead ? 'grayscale(1)' : 'none';
            $("#modalNameView").textContent = `${p.firstName} ${p.lastName}`;
            
            const show = (id, cond, fn) => { const el = $(id); if(cond) { el.classList.remove('hidden'); if(fn) fn(el); } else { el.classList.add('hidden'); } };
            
            show("#modalKageLogoView", p.grade === 'Kage', el => el.src = `kage/${this.getKageImage(p.village)}`);
            show("#gradeInfo", p.grade, () => { 
                $("#modalGradeView").textContent = p.grade; 
                const rankImg = this.getRankImage(p.grade); 
                show("#modalGradeLogo", rankImg, el => el.src = `rangs/${rankImg}`); 
            });
            
            show("#villageInfo", p.village, () => { $("#modalVillageView").textContent = p.village; $("#modalVillageLogo").src = `villages/${p.village.toLowerCase()}.png`; });
            show("#clanInfo", p.clan, () => $("#modalClanView").textContent = p.clan);
            show("#kekkeiInfo", p.kekkeiGenkai && p.kekkeiGenkai !== 'Aucun', () => { $("#modalKekkeiLogo").src = `kg/${p.kekkeiGenkai.toLowerCase()}.png`; $("#modalKekkeiView").textContent = p.kekkeiGenkai; });
            
            const natureBox = $("#modalNatureView"); natureBox.innerHTML = "";
            show("#natureInfo", p.chakraNatures?.length, () => { 
                p.chakraNatures.forEach(n => { const img = document.createElement("img"); img.src = `natures/${n.toLowerCase()}.png`; natureBox.appendChild(img); }); 
            });
            
            const bio = $("#modalInfoView"); 
            if(p.information) { bio.innerHTML = sanitize(p.information); bio.parentElement.classList.remove('hidden'); } else { bio.parentElement.classList.add('hidden'); }
            
            $$(".ed").forEach(e => e.classList.add("hidden")); 
            $$(".ro").forEach(e => e.classList.remove("hidden")); 
            $("#dropZone").classList.add("hidden");
        } else {
            STATE.currentEditingId = p?.id || null; 
            STATE.currentPhotoUrl = p?.photoUrl || null;
            $("#modalPhoto").src = p?.photoUrl || PLACEHOLDER_IMG;
            $("#modalPhoto").style.filter = 'none';

            $("#firstNameInput").value = p?.firstName || ""; 
            $("#lastNameInput").value = p?.lastName || ""; 
            $("#gradeInput").value = p?.grade || ""; 
            $("#villageInput").value = p?.village || ""; 
            $("#clanInput").value = p?.clan || ""; 
            $("#kekkeiGenkaiInput").value = p?.kekkeiGenkai || ""; 
            $("#statusInput").value = p?.status || "alive";
            
            $$("#natureInput input").forEach(cb => { cb.checked = p?.chakraNatures?.includes(cb.value) || false; });
            $("#informationInput").innerHTML = p?.information || ""; 
            $("#informationInput").parentElement.classList.remove('hidden');
            
            $$(".ro").forEach(e => e.classList.add("hidden")); 
            $$(".ed").forEach(e => e.classList.remove("hidden")); 
            $("#editActions").classList.remove("hidden"); 
            $("#dropZone").classList.remove("hidden");
        }
        modal.showModal();
    }
};

const DataManager = {
    async load() {
        const { data, error } = await supabaseClient.from('people').select('*');
        if(error) { console.error(error); showToast("Erreur de chargement", "error"); } 
        else { 
            STATE.people = data.sort((a, b) => {
                const getVal = (g) => { const vals = {'kage':10, 'commandant jonin':9, 'jonin':8, 'tokubetsu jonin':7, 'chunin confirmé':6, 'chunin':5, 'tokubetsu chunin':4, 'genin confirmé':3, 'genin':2}; return vals[(g||'').toLowerCase()] || 1; };
                const rankDiff = getVal(b.grade) - getVal(a.grade);
                if (rankDiff !== 0) return rankDiff;
                if (a.status !== b.status) return (a.status === 'deceased') ? 1 : -1;
                return (a.firstName || '').localeCompare(b.firstName || '');
            });
            UIManager.renderGrid(); 
        }
    },
    async save() {
        const payload = { 
            firstName: $("#firstNameInput").value, 
            lastName: $("#lastNameInput").value, 
            grade: $("#gradeInput").value, 
            village: $("#villageInput").value, 
            clan: $("#clanInput").value, 
            kekkeiGenkai: $("#kekkeiGenkaiInput").value, 
            status: $("#statusInput").value, 
            chakraNatures: $$("#natureInput input:checked").map(c => c.value), 
            information: sanitize($("#informationInput").innerHTML), 
            photoUrl: STATE.currentPhotoUrl 
        };
        if(STATE.currentEditingId) payload.id = STATE.currentEditingId;
        
        const { error } = await supabaseClient.from('people').upsert(payload);
        if(error) showToast(error.message, 'error'); 
        else { showToast("Sauvegardé !"); $("#personModal").close(); this.load(); }
    },
    async deletePerson(id) {
        const { error } = await supabaseClient.from('people').delete().eq('id', id);
        if(error) showToast(error.message, 'error'); else { showToast("Supprimé"); this.load(); }
    }
};

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
    SecuritySystem.init(); 
    
    // Settings
    $("#settingsBtn").onclick = () => {
        $("#sealToggle").checked = SecuritySystem.config.isEnabled;
        $("#adminPinInput").value = SecuritySystem.config.pinCode;
        $("#settingsModal").showModal();
    };
    $("#settingsClose").onclick = () => $("#settingsModal").close();
    
    $("#saveSettingsBtn").onclick = () => {
        const enabled = $("#sealToggle").checked;
        const pin = $("#adminPinInput").value;
        if(pin.length !== 4 || isNaN(pin)) { showToast("Le code doit faire 4 chiffres", "error"); return; }
        SecuritySystem.updateSettings(enabled, pin);
        $("#settingsModal").close();
    };

    DataManager.load();
    checkSession();
    
    // UI Events
    $("#searchInput").oninput = e => { STATE.filters.search = e.target.value; $("#clearSearch").classList.toggle("hidden", !e.target.value); UIManager.renderGrid(); };
    $("#clearSearch").onclick = () => { $("#searchInput").value = ""; STATE.filters.search = ""; UIManager.renderGrid(); };
    $("#clearFiltersBtn").onclick = () => { $$("select").forEach(s => s.value = ""); $("#searchInput").value = ""; STATE.filters = { search:"", village:"", kekkei:"", clan:"", status:"", nature:"" }; updateTheme(""); UIManager.renderGrid(); };
    
    $(".village-tabs").onclick = e => { if(e.target.classList.contains("village-tab")) { $(".village-tab.active").classList.remove("active"); e.target.classList.add("active"); STATE.filters.village = e.target.dataset.village; updateTheme(STATE.filters.village); UIManager.renderGrid(); } };
    ["kekkeiFilter", "clanFilter", "statusFilter", "natureFilter"].forEach(id => { $(`#${id}`).oninput = e => { STATE.filters[id.replace("Filter", "")] = e.target.value; UIManager.renderGrid(); }; });

    // Admin
    $("#adminLoginToggle").onclick = async () => { if(STATE.isAdmin) { await supabaseClient.auth.signOut(); location.reload(); } else { $("#loginModal").showModal(); } };
    $("#loginForm").onsubmit = async e => { e.preventDefault(); const { error } = await supabaseClient.auth.signInWithPassword({ email: $("#loginEmail").value, password: $("#loginPassword").value }); if(error) showToast("Erreur identifiants", 'error'); else { $("#loginModal").close(); checkSession(); } };

    // Edition
    $("#saveBtn").onclick = () => DataManager.save();
    $("#closeEditBtn").onclick = () => $("#personModal").close();
    $("#dropZone").onclick = () => $("#photoFile").click();
    $("#photoFile").onchange = e => { const file = e.target.files[0]; if(file){ const r = new FileReader(); r.onload = ev => { STATE.currentPhotoUrl = ev.target.result; $("#modalPhoto").src = ev.target.result; }; r.readAsDataURL(file); } };
    
    $("#addBtn").onclick = () => UIManager.openModal(null, true);
    $("#exportBtn").onclick = () => { const blob = new Blob([JSON.stringify(STATE.people, null, 2)], {type : 'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Sajin_Backup.json`; a.click(); };
    
    $$(".modal-close").forEach(b => b.onclick = function(){ this.closest("dialog").close() });
    
    updateTheme("Suna");
});

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    STATE.isAdmin = true;
    $("#adminText").textContent = "Déconnexion";
    $("#addBtn").classList.remove("hidden");
    $("#exportBtn").classList.remove("hidden");
    $("#settingsBtn").classList.remove("hidden");
    UIManager.renderGrid(); 
  }
}