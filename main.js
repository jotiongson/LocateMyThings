// --- 1. ERROR PROOF INITIALIZATION ---
let SUPABASE_URL = "";
let SUPABASE_ANON_KEY = "";
let GEMINI_API_KEY = "";

try {
    SUPABASE_URL = localStorage.getItem('locate_sb_url') || "";
    SUPABASE_ANON_KEY = localStorage.getItem('locate_sb_key') || "";
    GEMINI_API_KEY = localStorage.getItem('locate_gemini_key') || "";
} catch (error) { console.warn("Local storage unavailable."); }

let mySupabaseDb = null; 
if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
    mySupabaseDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

window.globalLocations = []; 

// --- DYNAMIC LOCATION FETCHER ---
async function refreshDynamicLocations() {
    if (!mySupabaseDb) return;
    
    try {
        const { data, error } = await mySupabaseDb.from('items').select('location');
        if (error || !data) return;

        window.globalLocations = [...new Set(data.map(item => item.location).filter(Boolean))].sort();
        
        const optionsHtml = window.globalLocations.map(l => `<option value="${l}">${l}</option>`).join('');
        
        const baseHome = `<option value="">-- Select a Location --</option><option value="NEW" style="font-weight:bold; color:#007bff;">➕ Create New Location...</option>`;
        const baseModal = `<option value="NEW" style="font-weight:bold; color:#007bff;">➕ Create New Location...</option>`;
        const baseFilter = `<option value="All">All Locations</option>`;

        // 1. CAPTURE EXISTING VALUES BEFORE REWRITING HTML
        const homeSelect = document.getElementById('location-select');
        const modalSelect = document.getElementById('modal-location-select');
        const filterSelect = document.getElementById('inventory-filter');

        const currentHomeVal = homeSelect ? homeSelect.value : "";
        const currentModalVal = modalSelect ? modalSelect.value : "";
        const currentFilterVal = filterSelect ? filterSelect.value : "All";

        // 2. REWRITE HTML AND RESTORE PREVIOUS VALUES
        if (homeSelect) {
            homeSelect.innerHTML = baseHome + optionsHtml;
            if (currentHomeVal) homeSelect.value = currentHomeVal;
        }

        if (modalSelect) {
            modalSelect.innerHTML = baseModal + optionsHtml;
            if (currentModalVal) modalSelect.value = currentModalVal;
        }

        if (filterSelect) {
            filterSelect.innerHTML = baseFilter + optionsHtml;
            // Restore the filter choice (e.g. "Garage Table Drawer 3")
            if (currentFilterVal) filterSelect.value = currentFilterVal;
        }
    } catch (e) {
        console.error("Failed to fetch locations", e);
    }
}

// --- 2. AI SCANNER FUNCTION ---
async function scanContainerWithAI(base64Image) {
    if (!GEMINI_API_KEY) {
        alert("Please save your Gemini API Key in the Settings tab first!");
        return [];
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const prompt = "Analyze this storage location image. Identify all distinct, separate items visible. Provide a concise Title (2-4 words), a brief Description, and a bounding box for each item. Return the data strictly as a valid JSON array of objects with 'title', 'description', and 'box_2d' keys. The 'box_2d' must be an array of 4 numbers [ymin, xmin, ymax, xmax] representing the normalized bounding box (0 to 1000) of the item. Do not use markdown wrappers.";

    const payload = { contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Image } }] }] };

    try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (result.error) { alert("AI Error: " + result.error.message); return []; }

        let rawText = result.candidates[0].content.parts[0].text.trim();
        if (rawText.startsWith("```json")) rawText = rawText.replaceAll("```json", "").replaceAll("```", "").trim();
        return JSON.parse(rawText); 
    } catch (error) { alert("Failed to parse AI response."); return []; }
}

// --- 3. UI INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    if (SUPABASE_URL && GEMINI_API_KEY) {
        refreshDynamicLocations();
    }

    // A. UI LOCK/UNLOCK LOGIC
    const locSelect = document.getElementById('location-select');
    const newLocInput = document.getElementById('new-location-input-home');
    
    const camBtnLabel = document.getElementById('camera-btn-label');
    const uploadBtnLabel = document.getElementById('upload-btn-label');
    const camInput = document.getElementById('camera-input');
    const uploadInput = document.getElementById('upload-input');

    function checkHomeUnlockStatus() {
        if(!locSelect || !newLocInput || !camBtnLabel || !uploadBtnLabel || !camInput || !uploadInput) return;
        
        let finalVal = locSelect.value === "NEW" ? newLocInput.value.trim() : locSelect.value.trim();

        if (finalVal !== "") {
            camBtnLabel.style.background = "#20c997";
            camBtnLabel.style.color = "white";
            camBtnLabel.style.cursor = "pointer";
            camBtnLabel.innerText = "📸 Take Photo";
            camInput.disabled = false;

            uploadBtnLabel.style.background = "#007bff";
            uploadBtnLabel.style.color = "white";
            uploadBtnLabel.style.cursor = "pointer";
            uploadBtnLabel.innerText = "📁 Select File";
            uploadInput.disabled = false;
        } else {
            camBtnLabel.style.background = "#e2e8f0";
            camBtnLabel.style.color = "#94a3b8";
            camBtnLabel.style.cursor = "not-allowed";
            camBtnLabel.innerText = "🔒 Location Required";
            camInput.disabled = true;

            uploadBtnLabel.style.background = "#e2e8f0";
            uploadBtnLabel.style.color = "#94a3b8";
            uploadBtnLabel.style.cursor = "not-allowed";
            uploadBtnLabel.innerText = "🔒 Location Required";
            uploadInput.disabled = true;
        }
    }

    if (locSelect) {
        locSelect.addEventListener('change', () => {
            if (locSelect.value === "NEW") {
                newLocInput.classList.remove('hidden');
                newLocInput.focus();
            } else {
                newLocInput.classList.add('hidden');
                newLocInput.value = ""; 
            }
            checkHomeUnlockStatus();
        });
    }
    
    if (newLocInput) newLocInput.addEventListener('input', checkHomeUnlockStatus);

    // Modal UI Toggle Logic
    const modalSelect = document.getElementById('modal-location-select');
    const modalInput = document.getElementById('modal-location-input');
    if (modalSelect && modalInput) {
        modalSelect.addEventListener('change', () => {
            if (modalSelect.value === "NEW") {
                modalInput.classList.remove('hidden');
                modalInput.focus();
            } else {
                modalInput.classList.add('hidden');
                modalInput.value = "";
            }
        });
    }

    // B. SETTINGS
    const sbUrlInput = document.getElementById('sb-url-input');
    const sbKeyInput = document.getElementById('sb-key-input');
    const apiKeyInput = document.getElementById('api-key-input');
    if(sbUrlInput) sbUrlInput.value = SUPABASE_URL;
    if(sbKeyInput) sbKeyInput.value = SUPABASE_ANON_KEY;
    if(apiKeyInput) apiKeyInput.value = GEMINI_API_KEY;
    
    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
            let cleanUrl = sbUrlInput.value.trim().replace(/^HTTPS:/i, 'https:').replace(/^HTTP:/i, 'http:');
            let cleanKey = sbKeyInput.value.trim();
            let cleanGemini = apiKeyInput.value.trim();
        
            localStorage.setItem('locate_sb_url', cleanUrl);
            localStorage.setItem('locate_sb_key', cleanKey);
            localStorage.setItem('locate_gemini_key', cleanGemini);
            
            location.reload();
        });
    }

    // C. NAVIGATION
    const navItems = document.querySelectorAll('.nav-item');
    const viewPanels = document.querySelectorAll('.view-panel');

    navItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const currentButton = e.currentTarget;
            const target = currentButton.getAttribute('data-target');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            currentButton.classList.add('active');

            viewPanels.forEach(p => p.classList.add('hidden'));
            const targetElement = document.getElementById(target);
            if(targetElement) targetElement.classList.remove('hidden');
            
            if (target === 'screen-manage') loadInventory();
        });
    });

    // D. CAMERA PROCESSING
    const handleImageSelection = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        document.getElementById('loading-status').classList.remove('hidden');
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 800; canvas.height = img.height * (800 / img.width);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const base64Data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]; 
            const detectedItems = await scanContainerWithAI(base64Data);
            document.getElementById('loading-status').classList.add('hidden');
            
            document.getElementById('verification-table-body').innerHTML = ""; 
            
            detectedItems.forEach((item, index) => {
                let thumbHtml = "", base64Str = "";
                if (item.box_2d) {
                    const c = document.createElement('canvas'), ctx = c.getContext('2d');
                    const ymin = (item.box_2d[0]/1000)*img.height, xmin = (item.box_2d[1]/1000)*img.width;
                    const w = (item.box_2d[3]-item.box_2d[1])/1000*img.width, h = (item.box_2d[2]-item.box_2d[0])/1000*img.height;
                    c.width = w; c.height = h;
                    ctx.drawImage(img, xmin, ymin, w, h, 0, 0, w, h);
                    base64Str = c.toDataURL('image/jpeg', 0.6);
                    thumbHtml = `<img src="${base64Str}" style="width:50px; height:50px; border-radius:4px; object-fit:cover;">`;
                }
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td style="text-align:center; font-weight:bold; color:#6c757d;">${index + 1}</td>
                    <td style="text-align:center;"><input type="checkbox" class="item-confirm" checked></td>
                    <td style="text-align:center;">${thumbHtml}<input type="hidden" class="item-img-base64" value="${base64Str}"></td>
                    <td><input type="text" class="item-title" value="${item.title}" style="width:100%; box-sizing: border-box;"></td>
                    <td><input type="text" class="item-desc" value="${item.description}" style="width:100%; box-sizing: border-box;"></td>`;
                document.getElementById('verification-table-body').appendChild(row);
            });
            document.getElementById('verification-area').classList.remove('hidden');
        };
        img.src = URL.createObjectURL(file);
        e.target.value = ""; 
    };

    if (camInput) camInput.addEventListener('change', handleImageSelection);
    if (uploadInput) uploadInput.addEventListener('change', handleImageSelection);

    // E. SAVE BULK
    const btnSaveBulk = document.getElementById('btn-save-bulk');
    if (btnSaveBulk) {
        btnSaveBulk.addEventListener('click', async () => {
            if (!mySupabaseDb) return alert("Database not connected! Check Settings.");

            const selectElement = document.getElementById('location-select');
            let targetLocation = selectElement.value;
            
            if (targetLocation === "NEW") {
                targetLocation = document.getElementById('new-location-input-home').value.trim();
            }

            if (!targetLocation) {
                alert("Please enter or select a location before saving.");
                return;
            }

            const rows = document.querySelectorAll('#verification-table-body tr');
            let toInsert = [];
            rows.forEach(row => {
                if (row.querySelector('.item-confirm').checked) {
                    toInsert.push({ 
                        title: row.querySelector('.item-title').value,
                        description: row.querySelector('.item-desc').value,
                        location: targetLocation,
                        image_base64: row.querySelector('.item-img-base64').value
                    });
                }
            });

            if (toInsert.length === 0) {
                alert("No items selected to save.");
                return;
            }

            btnSaveBulk.innerText = "⏳ Saving...";

            const { error } = await mySupabaseDb.from('items').insert(toInsert);
            
            if (error) {
                alert("Database Error: " + error.message);
            } else { 
                alert(`Successfully saved ${toInsert.length} item(s)!`); 
                document.getElementById('verification-area').classList.add('hidden');
                document.getElementById('verification-table-body').innerHTML = ""; 
                
                selectElement.value = "";
                document.getElementById('new-location-input-home').classList.add('hidden');
                document.getElementById('new-location-input-home').value = "";
                selectElement.dispatchEvent(new Event('change'));
                
                refreshDynamicLocations();
            }
            
            btnSaveBulk.innerText = "💾 Save Confirmed Items to Database";
        });
    }
});

// --- 4. INVENTORY MANAGEMENT & MODAL ---
let currentInventory = [];

async function loadInventory() {
    if (!mySupabaseDb) return;
    
    // PERFECT UX: Clear the old list instantly before showing the animation
    const tbody = document.getElementById('items-table-body');
    if (tbody) tbody.innerHTML = '';
    
    const loadingDiv = document.getElementById('inventory-loading');
    if(loadingDiv) loadingDiv.classList.remove('hidden');

    const { data } = await mySupabaseDb.from('items').select('*').order('created_at', { ascending: false });
    currentInventory = data || [];
    refreshDynamicLocations(); 
    window.renderInventoryTable();

    if(loadingDiv) loadingDiv.classList.add('hidden');
}

window.renderInventoryTable = function() {
    const tbody = document.getElementById('items-table-body');
    if(!tbody) return;

    const loc = document.getElementById('inventory-filter').value;
    const search = document.getElementById('inventory-search') ? document.getElementById('inventory-search').value.toLowerCase() : "";
    
    tbody.innerHTML = '';
    
    const filteredData = currentInventory.filter(item => 
        (loc === "All" || item.location === loc) && 
        (item.title.toLowerCase().includes(search) || item.description.toLowerCase().includes(search))
    );

    const countSpan = document.getElementById('inventory-count');
    if (countSpan) countSpan.innerText = `${filteredData.length} Item${filteredData.length !== 1 ? 's' : ''}`;

    const btnBulkDelete = document.getElementById('btn-bulk-delete');
    if(btnBulkDelete) btnBulkDelete.classList.add('hidden');
    
    const selectAllCb = document.getElementById('select-all-cb');
    if (selectAllCb) selectAllCb.checked = false;

    filteredData.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.cursor = "pointer";
        
        tr.onclick = (e) => {
            if (e.target.tagName.toLowerCase() === 'input') return;
            openModal(item);
        };

        tr.innerHTML = `
            <td style="text-align: center;">
                <input type="checkbox" class="row-cb" value="${item.id}" onchange="checkBulkDeleteStatus()">
            </td>
            <td><img src="${item.image_base64 || ''}" style="width:40px; height:40px; object-fit:cover; border-radius: 4px;"></td>
            <td style="font-weight: bold;">${item.title}</td>
            <td style="color: #666;">${item.description.substring(0, 25)}...</td>
            <td><span style="background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; display:inline-block; white-space:nowrap;">📍 ${item.location}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleSelectAll = function() {
    const masterCb = document.getElementById('select-all-cb');
    const rowCbs = document.querySelectorAll('.row-cb');
    rowCbs.forEach(cb => cb.checked = masterCb.checked);
    checkBulkDeleteStatus();
}

window.checkBulkDeleteStatus = function() {
    const anyChecked = document.querySelector('.row-cb:checked') !== null;
    const btn = document.getElementById('btn-bulk-delete');
    if (anyChecked) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

// PERFECT UX: Better Deletion Sequencing
window.bulkDeleteItems = async function() {
    const checkedBoxes = document.querySelectorAll('.row-cb:checked');
    if (checkedBoxes.length === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${checkedBoxes.length} item(s)?`)) return;

    const idsToDelete = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

    try {
        // 1. Show animation & wipe list instantly to freeze UI
        const loadingDiv = document.getElementById('inventory-loading');
        if(loadingDiv) loadingDiv.classList.remove('hidden');
        const tbody = document.getElementById('items-table-body');
        if (tbody) tbody.innerHTML = '';

        // 2. Perform the database delete silently
        const { error } = await mySupabaseDb.from('items').delete().in('id', idsToDelete);
        if (error) throw error;
        
        // 3. Wait for the list to completely refresh (this turns off the animation)
        await loadInventory(); 
        
        // 4. Show success popup ONLY after everything is done
        alert(`Successfully deleted ${checkedBoxes.length} item(s).`);

    } catch (err) {
        alert("Error deleting items: " + err.message);
        const loadingDiv = document.getElementById('inventory-loading');
        if(loadingDiv) loadingDiv.classList.add('hidden');
    }
}

function openModal(item) {
    document.getElementById('modal-img').src = item.image_base64 || '';
    document.getElementById('modal-title-input').value = item.title;
    document.getElementById('modal-desc-input').value = item.description;
    window.activeItemId = item.id;

    const modalSelect = document.getElementById('modal-location-select');
    const modalInput = document.getElementById('modal-location-input');
    
    if (modalSelect) {
        modalSelect.value = item.location;
        modalInput.classList.add('hidden');
        modalInput.value = "";
    }

    document.getElementById('item-modal').classList.remove('hidden');
}

window.saveModalChanges = async () => {
    if (!mySupabaseDb) return;
    
    const selectElement = document.getElementById('modal-location-select');
    let locInput = selectElement.value;
    
    if (locInput === "NEW") {
        locInput = document.getElementById('modal-location-input').value.trim();
    }

    const newTitle = document.getElementById('modal-title-input').value.trim();
    const newDesc = document.getElementById('modal-desc-input').value.trim();

    if (!locInput) return alert("Location cannot be empty.");
    if (!newTitle) return alert("Title cannot be empty.");

    const { error } = await mySupabaseDb.from('items').update({ 
        location: locInput,
        title: newTitle,
        description: newDesc
    }).eq('id', window.activeItemId);
    
    if (error) alert("Error: " + error.message); 
    else {
        document.getElementById('item-modal').classList.add('hidden');
        loadInventory(); 
    }
};

window.closeModal = () => document.getElementById('item-modal').classList.add('hidden');


// --- 5. AUTHENTICATION & ACCOUNTS ---
let isSignUp = false;
window.toggleAuthMode = () => {
    isSignUp = !isSignUp;
    document.getElementById('auth-title').innerText = isSignUp ? "Create Account" : "Welcome back";
    document.getElementById('auth-btn').innerText = isSignUp ? "Register" : "Secure Login";
    document.getElementById('auth-toggle').innerText = isSignUp ? "Already have an account? Sign In" : "Don't have an account? Register Here";
};

window.handleAuth = async () => {
    if (!mySupabaseDb) return alert("Database not connected! Check Settings.");
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Please enter both email and password.");
    
    document.getElementById('auth-btn').innerText = "⏳ Processing...";
    
    const { error } = isSignUp 
        ? await mySupabaseDb.auth.signUp({email, password}) 
        : await mySupabaseDb.auth.signInWithPassword({email, password});
        
    if (error) {
        alert(error.message);
        document.getElementById('auth-btn').innerText = isSignUp ? "Register" : "Secure Login";
    } else {
        if (isSignUp) alert("Registration successful!");
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-password').value = '';
    }
};

window.logout = async () => { 
    if (!mySupabaseDb) return;
    await mySupabaseDb.auth.signOut(); 
    location.reload(); 
};

// Auto-check login status to show/hide the app
if (mySupabaseDb) {
    mySupabaseDb.auth.onAuthStateChange((event, session) => {
        if (session) {
            // User is logged in: Hide login screen, show app
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').classList.remove('hidden');
            
            // NEW: Extract user details from the session and update the UI
            const userEmail = session.user.email;
            const userId = session.user.id;
            
            const homeDisplay = document.getElementById('home-user-display');
            const accountEmailDisplay = document.getElementById('account-email-display');
            const accountIdDisplay = document.getElementById('account-id-display');
            
            if (homeDisplay) homeDisplay.innerText = `👤 ${userEmail}`;
            if (accountEmailDisplay) accountEmailDisplay.innerText = userEmail;
            if (accountIdDisplay) accountIdDisplay.innerText = userId;
            
        } else {
            // User is logged out: Show login screen, hide app
            document.getElementById('auth-screen').style.display = 'flex';
            document.getElementById('app-content').classList.add('hidden');
        }
    });
}
