const CONFIG = window.APP_CONFIG;

// --- ÉTAT GLOBAL ---
const STATE = {
    people: [],
    filters: { search: "", village: "Suna", kekkei: "", clan: "", status: "alive", nature: "" },
    isAdmin: false,
    currentEditingId: null,
    currentPhotoUrl: null,
};

// --- CLIENT SUPABASE ---
const { createClient } = supabase;
const supabaseClient = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const sanitize = (html) => window.DOMPurify ? DOMPurify.sanitize(html) : html;
const PLACEHOLDER_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Crect width='600' height='600' fill='%230f172a'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='40' fill='%23334155'%3ESHINOBI%3C/text%3E%3C/svg%3E";


// --- SYSTÈME DE SÉCURITÉ GLOBAL (Via Supabase) ---
const SecuritySystem = {
    config: {
        isEnabled: true, 
        pinCode: '0000',
        isUnlocked: sessionStorage.getItem('seal_unlocked') === 'true'
    },

    async init() {
        const pinInput = document.getElementById('pinInput');
        const grid = document.getElementById('grid');
        const overlay = document.getElementById('grid-lock-overlay');

        // 1. Verrouillage préventif au chargement (anti-flash)
        if(!this.config.isUnlocked) {
            grid.classList.add('blur-locked');
            overlay.classList.remove('hidden');
        }

        // 2. Récupérer la configuration serveur
        await this.fetchGlobalSettings();

        // 3. Appliquer l'état initial
        this.applySecurityState();

        // 4. Écouteur saisie PIN
        if(pinInput) {
            pinInput.addEventListener('keyup', (e) => {
                if (e.target.value.length === 4) {
                    this.checkPin(e.target.value);
                }
            });
        }
        
        // 5. SURVEILLANCE TEMPS RÉEL (La partie importante pour toi)
        // Permet de bloquer instantanément les utilisateurs si l'admin change le code
        supabaseClient
            .channel('settings-updates')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings' }, (payload) => {
                const newSettings = payload.new;
                const oldPin = this.config.pinCode;
                const wasEnabled = this.config.isEnabled;

                // Mise à jour de la config locale
                this.config.isEnabled = newSettings.seal_enabled;
                this.config.pinCode = newSettings.seal_pin;

                // CAS 1 : La sécurité vient d'être DÉSACTIVÉE
                if (!this.config.isEnabled) {
                    this.unlockVisuals(true);
                    return;
                }

                // CAS 2 : La sécurité est ACTIVE
                // On vérifie si le code a changé OU si on vient de l'activer
                const pinHasChanged = newSettings.seal_pin !== oldPin;
                const justActivated = !wasEnabled && this.config.isEnabled;

                if (pinHasChanged || justActivated) {
                    // SÉCURITÉ MAXIMALE : On révoque l'accès immédiatement
                    console.log("Changement de sécurité détecté : Verrouillage immédiat.");
                    this.config.isUnlocked = false;
                    sessionStorage.removeItem('seal_unlocked'); // On supprime le "cookie" de session
                    
                    // On réapplique le flou et l'overlay
                    this.applySecurityState(); 
                    
                    if(pinHasChanged) showToast("Le code d'accès a été modifié.", "error");
                }
            })
            .subscribe();
    },

    async fetchGlobalSettings() {
        const { data, error } = await supabaseClient
            .from('settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (data) {
            this.config.isEnabled = data.seal_enabled;
            this.config.pinCode = data.seal_pin;
        }
    },

    applySecurityState() {
        const overlay = document.getElementById('grid-lock-overlay');
        const grid = document.getElementById('grid');
        const pinInput = document.getElementById('pinInput');

        // Si désactivé globalement OU si l'utilisateur a le bon token de session
        if (this.config.isEnabled === false || this.config.isUnlocked === true) {
            this.unlockVisuals(true);
        } else {
            // Sinon VERROUILLAGE
            overlay.classList.remove('hidden');
            overlay.style.opacity = '1';
            grid.classList.add('blur-locked');
            if(pinInput) {
                pinInput.value = '';
                // Focus automatique si l'utilisateur est actif
                if (document.activeElement !== document.body) setTimeout(() => pinInput.focus(), 100);
            }
        }
    },

    checkPin(inputCode) {
        const errorMsg = document.getElementById('pinErrorMsg');
        const inputField = document.getElementById('pinInput');

        if (inputCode === this.config.pinCode) {
            this.unlockVisuals();
            sessionStorage.setItem('seal_unlocked', 'true');
            this.config.isUnlocked = true;
            inputField.blur();
        } else {
            errorMsg.classList.remove('hidden');
            inputField.value = '';
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
            overlay.style.transition = 'opacity 0.5s ease';
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.classList.add('hidden');
                grid.classList.remove('blur-locked');
                overlay.style.opacity = '1'; 
            }, 500);
        }
    },

    // ADMIN : Mise à jour vers Supabase
    async updateSettings(isEnabled, newPin) {
        // On met à jour localement tout de suite (Optimistic UI)
        // Note: L'écouteur realtime se déclenchera aussi, mais ce n'est pas grave
        const { error } = await supabaseClient
            .from('settings')
            .upsert({ id: 1, seal_enabled: isEnabled, seal_pin: newPin });

        if (error) {
            showToast("Erreur sauvegarde : " + error.message, "error");
            return;
        }

        if (!isEnabled) {
            this.unlockVisuals(true);
            showToast("Sécurité désactivée pour TOUS 🔓");
        } else {
            // Pour l'admin qui modifie, on re-verrouille aussi pour tester
            this.config.isEnabled = true;
            this.config.pinCode = newPin;
            this.config.isUnlocked = false;
            sessionStorage.removeItem('seal_unlocked');
            this.applySecurityState();
            showToast(`Code défini sur : ${newPin} 🔒`);
        }
    }
};

// --- TOOLS UI ---
function updateTheme(village) {
    const themeName = village || "Tous";
    document.body.setAttribute('data-theme', themeName);
}

function showToast(message, type = 'success') {
    const container = $("#toast-container");
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span style="font-size:1.2rem">${type === 'success' ? '✅' : 'ℹ️'}</span><span>${message}</span>`;
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

    // Admin Login
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