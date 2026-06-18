// --- 1. SUPABASE INITIALIZATION & AUTH ---
// IMPORTANT: Paste your Supabase URL and Anon Key here. They are safe to be public!
const SUPABASE_URL = "https://etmogzjhmvuwpvbuwryh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bW9nempobXZ1d3B2YnV3cnloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDU2OTUsImV4cCI6MjA5NzI4MTY5NX0.uu8C3xdciivAPYX5EYspOskyDIka7cWNB6jsEIrwWrw";

window.mySupabaseDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.globalLocations = []; 

// Listen for Login/Logout events to show or hide the app
window.mySupabaseDb.auth.onAuthStateChange((event, session) => {
    const authScreen = document.getElementById('auth-screen');
    if (session) {
        authScreen.classList.add('hidden');
        refreshDynamicLocations();
        // If they are on the manage tab when logging in, load inventory
        if(!document.getElementById('screen-manage').classList.contains('hidden')) {
            loadInventory();
        }
    } else {
        authScreen.classList.remove('hidden');
    }
});

window.sendMagicLink = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const errorDiv = document.getElementById('auth-error');
    const btn = document.getElementById('main-auth-btn');

    if (!email.includes('@')) return errorDiv.innerText = "Please enter a valid email.";
    
    btn.innerText = "Sending link...";
    btn.disabled = true;

    const { error } = await window.mySupabaseDb.auth.signInWithOtp({
        email: email,
        options: { 
            // FIXED: Explicitly telling it exactly where the app lives!
            emailRedirectTo: "https://jotiongson.github.io/LocateMyThings/" 
        }
    });

    if (error) {
        errorDiv.innerText = error.message;
        btn.innerText = "Send Magic Link";
        btn.disabled = false;
    } else {
        errorDiv.style.color = "#20c997";
        errorDiv.innerText = "Check your email for the sign-in link!";
    }
};

window.handleLogout = async () => {
    await window.mySupabaseDb.auth.signOut();
    // Clear out memory so the next user doesn't see old dropdowns
    document.getElementById('verification-table-body').innerHTML = '';
    document.getElementById('items-table-body').innerHTML = '';
};


// --- DYNAMIC LOCATION FETCHER ---
async function refreshDynamicLocations() {
    try {
        const { data, error } = await window.mySupabaseDb.from('items').select('location');
        if (error || !data) return;

        window.globalLocations = [...new Set(data.map(item => item.location).filter(Boolean))].sort();
        
        const optionsHtml = window.globalLocations.map(l => `<option value="${l}">${l}</option>`).join('');
        
        const baseHome = `<option value="">-- Select a Location --</option><option value="NEW" style="font-weight:bold; color:#007bff;">➕ Create New Location...</option>`;
        const baseModal = `<option value="NEW" style="font-weight:bold; color:#007bff;">➕ Create New Location...</option>`;
        const baseFilter = `<option value="All">All Locations</option>`;

        const homeSelect = document.getElementById('location-select');
        if (homeSelect) homeSelect.innerHTML = baseHome + optionsHtml;

        const modalSelect = document.getElementById('modal-location-select');
        if (modalSelect) modalSelect.innerHTML = baseModal + optionsHtml;

        const filterSelect = document.getElementById('inventory-filter');
        if (filterSelect) filterSelect.innerHTML = baseFilter + optionsHtml;
    } catch (e) { console.error("Failed to fetch locations", e); }
}


// --- 2. SECURE AI SCANNER FUNCTION (EDGE FUNCTION CALL) ---
async function scanContainerWithAI(base64Image) {
    try {
        // Send the image to your secure Edge Function instead of Google directly!
        const { data, error } = await window.mySupabaseDb.functions.invoke('scan-image', {
            body: { base64Image: base64Image }
        });

        if (error) {
            alert("Edge Function Error: " + error.message);
            return [];
        }

        if (data.error) {
            alert("AI Error: " + data.error.message);
            return [];
        }

        let rawText = data.candidates[0].content.parts[0].text.trim();
        if (rawText.startsWith("```json")) rawText = rawText.replaceAll("```json", "").replaceAll("```", "").trim();
        return JSON.parse(rawText); 
        
    } catch (error) { 
        alert("Failed to communicate with secure server. Ensure Edge Function is deployed."); 
        return []; 
    }
}


// --- 3. UI INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {

    // A. TIMBREBOX UI LOCK/UNLOCK LOGIC
    const locSelect = document.getElementById('location-select');
    const newLocInput = document.getElementById('new-location-input-home');
    const camBtnLabel = document.getElementById('camera-btn-label');
    const imgInput = document.getElementById('image-input');

    function checkHomeUnlockStatus() {
        if(!locSelect || !newLocInput || !camBtnLabel || !imgInput) return;
        
        let finalVal = locSelect.value === "NEW" ? newLocInput.value.trim() : locSelect.value.trim();

        if (finalVal !== "") {
            camBtnLabel.style.background = "#20c997";
            camBtnLabel.style.color = "white";
            camBtnLabel.style.cursor = "pointer";
            camBtnLabel.innerText = "📸 Take Photo or Upload Image";
            imgInput.disabled = false;
        } else {
            camBtnLabel.style.background = "#e2e8f0";
            camBtnLabel.style.color = "#94a3b8";
            camBtnLabel.style.cursor = "not-allowed";
            camBtnLabel.innerText = "🔒 Select Location to Unlock Scanner";
            imgInput.disabled = true;
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

    // B. NAVIGATION
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

    // C. CAMERA PROCESSING
    if (imgInput) {
        imgInput.addEventListener('change', async (e) => {
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
                
                detectedItems.forEach(item => {
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
                    row.innerHTML = `<td><input type="checkbox" class="item-confirm" checked></td><td>${thumbHtml}<input type="hidden" class="item-img-base64" value="${base64Str}"></td><td><input type="text" class="item-title" value="${item.title}" style="width:100%;"></td><td><input type="text" class="item-desc" value="${item.description}" style="width:100%;"></td>`;
                    document.getElementById('verification-table-body').appendChild(row);
                });
                document.getElementById('verification-area').classList.remove('hidden');
            };
            img.src = URL.createObjectURL(file);
        });
    }

    // D. SAVE BULK
    document.getElementById('btn-save-bulk').addEventListener('click', async () => {
        const selectElement = document.getElementById('location-select');
        let targetLocation = selectElement.value;
        
        if (targetLocation === "NEW") {
            targetLocation = document.getElementById('new-location-input-home').value.trim();
        }

        if (!targetLocation) return alert("Please enter or select a location before saving.");

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

        if (toInsert.length === 0) return alert("No items selected to save.");

        document.getElementById('btn-save-bulk').innerText = "⏳ Saving...";

        const { error } = await window.mySupabaseDb.from('items').insert(toInsert);
        
        if (error) {
            alert("Database Error: " + error.message);
        } else { 
            alert("Success!"); 
            document.getElementById('verification-area').classList.add('hidden');
            document.getElementById('verification-table-body').innerHTML = ""; 
            
            selectElement.value = "";
            document.getElementById('new-location-input-home').classList.add('hidden');
            document.getElementById('new-location-input-home').value = "";
            selectElement.dispatchEvent(new Event('change'));
            
            refreshDynamicLocations();
        }
        
        document.getElementById('btn-save-bulk').innerText = "💾 Save Confirmed Items to Database";
    });
});

// --- 4. INVENTORY MANAGEMENT & MODAL ---
let currentInventory = [];

async function loadInventory() {
    const { data } = await window.mySupabaseDb.from('items').select('*').order('created_at', { ascending: false });
    currentInventory = data || [];
    refreshDynamicLocations(); 
    window.renderInventoryTable();
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
            <td style="text-align: center;"><input type="checkbox" class="row-cb" value="${item.id}" onchange="checkBulkDeleteStatus()"></td>
            <td><img src="${item.image_base64 || ''}" style="width:40px; height:40px; object-fit:cover; border-radius: 4px;"></td>
            <td style="font-weight: bold;">${item.title}</td>
            <td style="color: #666;">${item.description.substring(0, 25)}...</td>
            <td><span style="background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; display:inline-block; white-space:nowrap;">📍 ${item.location}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

// BULK DELETE
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

window.bulkDeleteItems = async function() {
    const checkedBoxes = document.querySelectorAll('.row-cb:checked');
    if (checkedBoxes.length === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${checkedBoxes.length} item(s)?`)) return;

    const idsToDelete = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

    try {
        const { error } = await window.mySupabaseDb.from('items').delete().in('id', idsToDelete);
        if (error) throw error;
        alert(`Successfully deleted ${checkedBoxes.length} item(s).`);
        loadInventory(); 
    } catch (err) { alert("Error deleting items: " + err.message); }
}

// MODAL
function openModal(item) {
    document.getElementById('modal-img').src = item.image_base64 || '';
    document.getElementById('modal-title').innerText = item.title;
    document.getElementById('modal-desc').innerText = item.description;
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
    const selectElement = document.getElementById('modal-location-select');
    let locInput = selectElement.value;
    
    if (locInput === "NEW") {
        locInput = document.getElementById('modal-location-input').value.trim();
    }

    if (!locInput) return alert("Location cannot be empty.");

    const { error } = await window.mySupabaseDb.from('items').update({ location: locInput }).eq('id', window.activeItemId);
    
    if (error) alert("Error: " + error.message); 
    else {
        document.getElementById('item-modal').classList.add('hidden');
        loadInventory(); 
    }
};

let isLoginMode = true;

window.toggleAuthMode = () => {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "Log In" : "Create Account";
    document.getElementById('main-auth-btn').innerText = isLoginMode ? "Log In" : "Sign Up";
    document.getElementById('toggle-text').innerHTML = isLoginMode ? 
        'Need an account? <span onclick="toggleAuthMode()" style="color: #007bff; font-weight: bold; cursor: pointer; text-decoration: underline;">Sign Up</span>' :
        'Already have an account? <span onclick="toggleAuthMode()" style="color: #007bff; font-weight: bold; cursor: pointer; text-decoration: underline;">Log In</span>';
    document.getElementById('auth-error').innerText = "";
};

window.executeAuth = () => {
    if (isLoginMode) handleLogin();
    else handleSignup();
};

window.closeModal = () => document.getElementById('item-modal').classList.add('hidden');
