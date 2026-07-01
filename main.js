// ==========================================================================
// 0. MAGIC LINK ONBOARDING (Reverse Last 5)
// ==========================================================================
const urlParams = new URLSearchParams(window.location.search);
const setupUrl = urlParams.get('sb_url');
const setupKey = urlParams.get('sb_key');
const setupGemini = urlParams.get('gemini_key');

// Helper function to reverse only the last 5 characters back to normal
const reverseLastFive = (str) => {
    if (!str || str.length < 5) return str;
    const core = str.slice(0, -5);
    const tail = str.slice(-5).split('').reverse().join('');
    return core + tail;
};

if (setupUrl && setupKey && setupGemini) {
    try {
        const finalKey = reverseLastFive(setupKey);
        const finalGemini = reverseLastFive(setupGemini);

        localStorage.setItem('locate_sb_url', setupUrl);
        localStorage.setItem('locate_sb_key', finalKey);
        localStorage.setItem('locate_gemini_key', finalGemini);
        
        const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    } catch (e) {
        console.error("Invalid magic link format.");
    }
}

// ==========================================================================
// 1. INITIALIZATION & DATABASE CONNECTION
// ==========================================================================
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

// ==========================================================================
// 2. ADMIN TELEMETRY & QUOTA ENFORCEMENT
// ==========================================================================
const ADMIN_EMAILS = ["josephtiongson@hotmail.com"]; 

let GEMINI_DAILY_LIMIT = 970; 
let SUPABASE_MONTHLY_LIMIT = 47500; 
let currentGeminiUsage = 0;
let currentSupabaseUsage = 0;

async function logApiUsage(serviceName) {
    if (!mySupabaseDb) return;
    try {
        await mySupabaseDb.from('api_usage').insert([{ service: serviceName }]);
        if (serviceName === 'Gemini') currentGeminiUsage++;
        if (serviceName === 'Supabase') currentSupabaseUsage++;
    } catch (e) { console.error("Telemetry error:", e); }
}

async function fetchCurrentQuotas() {
    if (!mySupabaseDb) return;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    try {
        // Fetch Settings (Limits)
        const { data: settings } = await mySupabaseDb.from('app_settings').select('*');
        if (settings) {
            settings.forEach(s => {
                if (s.id === 'gemini_daily_limit') GEMINI_DAILY_LIMIT = s.setting_value;
                if (s.id === 'supabase_monthly_limit') SUPABASE_MONTHLY_LIMIT = s.setting_value;
            });
        }

        // Fetch Usage Counts
        const { count: gCount } = await mySupabaseDb.from('api_usage').select('*', { count: 'exact', head: true }).eq('service', 'Gemini').gte('created_at', startOfDay);
        const { count: sCount } = await mySupabaseDb.from('api_usage').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth);
        
        currentGeminiUsage = gCount || 0;
        currentSupabaseUsage = sCount || 0;
        
        if (typeof window.triggerUnlockCheck === 'function') window.triggerUnlockCheck();
    } catch (e) { console.error("Quota fetch failed."); }
}

// ==========================================================================
// 3. DYNAMIC LOCATION FETCHER
// ==========================================================================
async function refreshDynamicLocations() {
    if (!mySupabaseDb) return;
    try {
        const { data, error } = await mySupabaseDb.from('items').select('location');
        if (error || !data) return;

        window.globalLocations = [...new Set(data.map(item => item.location).filter(Boolean))].sort();
        const optionsHtml = window.globalLocations.map(l => `<option value="${l}">${l}</option>`).join('');
        
        const baseHome = `<option value="">-- Select a Location --</option><option value="NEW" style="font-weight:bold; color:#007aff;">➕ Create New Location...</option>`;
        const baseModal = `<option value="NEW" style="font-weight:bold; color:#007aff;">➕ Create New Location...</option>`;
        const baseFilter = `<option value="All">All Locations</option>`;

        const homeSelect = document.getElementById('location-select');
        const modalSelect = document.getElementById('modal-location-select');
        const filterSelect = document.getElementById('inventory-filter');

        const currentHomeVal = homeSelect ? homeSelect.value : "";
        const currentModalVal = modalSelect ? modalSelect.value : "";
        const currentFilterVal = filterSelect ? filterSelect.value : "All";

        if (homeSelect) { homeSelect.innerHTML = baseHome + optionsHtml; if (currentHomeVal) homeSelect.value = currentHomeVal; }
        if (modalSelect) { modalSelect.innerHTML = baseModal + optionsHtml; if (currentModalVal) modalSelect.value = currentModalVal; }
        if (filterSelect) { filterSelect.innerHTML = baseFilter + optionsHtml; if (currentFilterVal) filterSelect.value = currentFilterVal; }
    } catch (e) { console.error("Failed to fetch locations", e); }
}

// ==========================================================================
// 4. AI SCANNER FUNCTION
// ==========================================================================
async function scanContainerWithAI(base64Image) {
    if (!GEMINI_API_KEY) {
        alert("System Error: AI Key missing.");
        return [];
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

    const prompt = "Analyze this storage location image. Identify all distinct, separate items visible. Ensure the bounding box encompasses the entire visible object, including extended parts, handles, or blades, leaving a small margin of space around the edges. Provide a concise Title (2-4 words), a brief Description, and a bounding box for each item. Return the data strictly as a valid JSON array of objects with 'title', 'description', and 'box_2d' keys. The 'box_2d' must be an array of 4 numbers [ymin, xmin, ymax, xmax] representing the normalized bounding box (0 to 1000) of the item. Do not use markdown wrappers.";

    const payload = { contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Image } }] }] };

    try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const result = await response.json();
        
        if (result.error) { 
            alert("AI Error: " + result.error.message); 
            return []; 
        }

        // Successfully hit the API, log the request!
        await logApiUsage('Gemini');

        let rawText = result.candidates[0].content.parts[0].text.trim();
        if (rawText.startsWith("```json")) rawText = rawText.replaceAll("```json", "").replaceAll("```", "").trim();
        return JSON.parse(rawText); 
    } catch (error) { 
        alert("Failed to parse AI response."); 
        return []; 
    }
}

// ==========================================================================
// 5. UI INITIALIZATION & MAIN LOGIC
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    if (SUPABASE_URL && GEMINI_API_KEY) refreshDynamicLocations();

    // A. UI LOCK/UNLOCK & CIRCUIT BREAKER
    const locSelect = document.getElementById('location-select');
    const newLocInput = document.getElementById('new-location-input-home');
    const camBtnLabel = document.getElementById('camera-btn-label');
    const uploadBtnLabel = document.getElementById('upload-btn-label');
    const camInput = document.getElementById('camera-input');
    const uploadInput = document.getElementById('upload-input');

    function checkHomeUnlockStatus() {
        if(!locSelect || !newLocInput || !camBtnLabel || !uploadBtnLabel || !camInput || !uploadInput) return;
        
        // HARD STOP: Check Gemini Quota
        if (currentGeminiUsage >= GEMINI_DAILY_LIMIT) {
            camBtnLabel.style.background = "#dc3545"; 
            camBtnLabel.style.color = "white";
            camBtnLabel.style.cursor = "not-allowed";
            camBtnLabel.innerText = "🛑 Daily AI Limit Reached";
            camInput.disabled = true;

            uploadBtnLabel.style.background = "#dc3545"; 
            uploadBtnLabel.style.color = "white";
            uploadBtnLabel.style.cursor = "not-allowed";
            uploadBtnLabel.innerText = "🛑 Daily AI Limit Reached";
            uploadInput.disabled = true;
            return;
        }

        // NORMAL BEHAVIOR: Check Location
        let finalVal = locSelect.value === "NEW" ? newLocInput.value.trim() : locSelect.value.trim();

        if (finalVal !== "") {
            camBtnLabel.style.background = "#20c997";
            camBtnLabel.style.color = "white";
            camBtnLabel.style.cursor = "pointer";
            camBtnLabel.innerText = "📸 Take Photo";
            camInput.disabled = false;

            uploadBtnLabel.style.background = "#007aff";
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
    
    window.triggerUnlockCheck = checkHomeUnlockStatus;

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

    // Modal Location Logic
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

    // C. CAMERA PROCESSING (With 15% Padding Logic)
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
                    
                    // Calculate original coordinates
                    let origYmin = (item.box_2d[0] / 1000) * img.height;
                    let origXmin = (item.box_2d[1] / 1000) * img.width;
                    let origW = ((item.box_2d[3] - item.box_2d[1]) / 1000) * img.width;
                    let origH = ((item.box_2d[2] - item.box_2d[0]) / 1000) * img.height;

                    // Calculate 15% padding
                    let padX = origW * 0.15;
                    let padY = origH * 0.15;

                    // Apply padding without exceeding image boundaries
                    let xmin = Math.max(0, origXmin - padX);
                    let ymin = Math.max(0, origYmin - padY);
                    let w = Math.min(img.width - xmin, origW + (padX * 2));
                    let h = Math.min(img.height - ymin, origH + (padY * 2));

                    c.width = w; c.height = h;
                    ctx.drawImage(img, xmin, ymin, w, h, 0, 0, w, h);
                    base64Str = c.toDataURL('image/jpeg', 0.8);
                    
                    // Updated styling for unclipped views
                    thumbHtml = `<img src="${base64Str}" style="width:80px; height:80px; border-radius:4px; object-fit:contain; background:#f8f9fa;">`;
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

    // D. SAVE BULK TO DATABASE
    const btnSaveBulk = document.getElementById('btn-save-bulk');
    if (btnSaveBulk) {
        btnSaveBulk.addEventListener('click', async () => {
            if (!mySupabaseDb) return alert("System Error: Database not connected.");

            const selectElement = document.getElementById('location-select');
            let targetLocation = selectElement.value;
            if (targetLocation === "NEW") targetLocation = document.getElementById('new-location-input-home').value.trim();

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

            // HARD STOP: Check Supabase Quota
            if (currentSupabaseUsage >= SUPABASE_MONTHLY_LIMIT) {
                alert("🛑 Monthly Database limit reached to prevent billing. Please wait until next month, or contact the Admin.");
                return;
            }

            btnSaveBulk.innerText = "⏳ Saving...";

            const { error } = await mySupabaseDb.from('items').insert(toInsert);
            
            if (error) {
                alert("Database Error: " + error.message);
            } else { 
                await logApiUsage('Supabase'); // Log the successful insert
                alert(`Successfully saved ${toInsert.length} item(s)!`); 
                
                // Clear out the previous photo verification rows
                document.getElementById('verification-area').classList.add('hidden');
                document.getElementById('verification-table-body').innerHTML = ""; 
                
                // 1. Refresh dynamic locations from database so the new choice is registered
                await refreshDynamicLocations();
                
                // 2. Lock the dropdown back onto the location you just used
                selectElement.value = targetLocation;
                
                // 3. Clean up and hide the text box if you had used a "NEW" location
                const homeTextInput = document.getElementById('new-location-input-home');
                if (homeTextInput) {
                    homeTextInput.classList.add('hidden');
                    homeTextInput.value = "";
                }
                
                // 4. Force a status check to keep camera/upload buttons unlocked and ready
                if (typeof window.triggerUnlockCheck === 'function') window.triggerUnlockCheck();
            }
            btnSaveBulk.innerText = "💾 Save Confirmed Items";
        });
    }
    
});

// ==========================================================================
// 6. INVENTORY MANAGEMENT & MODAL (With Google-Like Search)
// ==========================================================================
let currentInventory = [];

async function loadInventory() {
    if (!mySupabaseDb) return;
    
    const tbody = document.getElementById('items-table-body');
    if (tbody) tbody.innerHTML = '';
    
    const loadingDiv = document.getElementById('inventory-loading');
    if(loadingDiv) {
        // Upgrade the loader to include a progress text element
        loadingDiv.innerHTML = `
            <div class="loader-dot"></div><div class="loader-dot"></div><div class="loader-dot"></div>
            <br><span id="loading-progress-text" style="display:block; margin-top:15px; font-weight:bold; color:#007bff; font-size: 1.1rem;">Calculating payload...</span>
        `;
        loadingDiv.classList.remove('hidden');
    }

    try {
        // Step 1: Get the exact total count of items first
        const { count, error: countError } = await mySupabaseDb.from('items').select('*', { count: 'exact', head: true });
        if (countError) throw new Error("Count Exception: " + countError.message);
        
        let allData = [];
        const pageSize = 100; // Fetch 100 items at a time
        
        // Step 2: Loop and fetch in batches
        for (let i = 0; i < count; i += pageSize) {
            const progressText = document.getElementById('loading-progress-text');
            if (progressText) {
                // Entertain the user with live progress metrics
                progressText.innerText = `Fetching ${Math.min(i + pageSize, count)} of ${count} items...`;
            }
            
            const { data, error } = await mySupabaseDb.from('items')
                .select('*')
                .order('created_at', { ascending: false })
                .range(i, i + pageSize - 1);
                
            if (error) throw new Error(`Batch Exception at offset ${i}: ` + error.message);
            
            allData = allData.concat(data);
        }
        
        currentInventory = allData || [];
        refreshDynamicLocations(); 
        window.renderInventoryTable();
        
    } catch (err) {
        // Strict visibility into transaction failures
        alert(`Data Retrieval Exception:\n${err.message}\n\nPlease check the console for deeper diagnostic details.`);
        console.error("Inventory Fetch Architecture Error:", err);
    } finally {
        if(loadingDiv) loadingDiv.classList.add('hidden');
    }
}

window.renderInventoryTable = function() {
    const tbody = document.getElementById('items-table-body');
    if(!tbody) return;

    const loc = document.getElementById('inventory-filter').value;
    const searchInput = document.getElementById('inventory-search') ? document.getElementById('inventory-search').value.toLowerCase() : "";
    
    // Split search input into individual words, filtering out empty spaces
    const searchTerms = searchInput.split(' ').filter(term => term.length > 0);
    
    tbody.innerHTML = '';
    
    const filteredData = currentInventory.filter(item => {
        // 1. Check Location Match
        const matchesLocation = (loc === "All" || item.location === loc);
        
        // 2. Google-Like Match: EVERY search term must be present in either title OR description
        const matchesSearch = searchTerms.every(term => 
            item.title.toLowerCase().includes(term) || 
            item.description.toLowerCase().includes(term)
        );

        return matchesLocation && matchesSearch;
    });

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

window.bulkDeleteItems = async function() {
    const checkedBoxes = document.querySelectorAll('.row-cb:checked');
    if (checkedBoxes.length === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${checkedBoxes.length} item(s)?`)) return;

    const idsToDelete = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

    try {
        const loadingDiv = document.getElementById('inventory-loading');
        if(loadingDiv) loadingDiv.classList.remove('hidden');
        const tbody = document.getElementById('items-table-body');
        if (tbody) tbody.innerHTML = '';

        const { error } = await mySupabaseDb.from('items').delete().in('id', idsToDelete);
        if (error) throw error;
        
        await loadInventory(); 
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
    if (locInput === "NEW") locInput = document.getElementById('modal-location-input').value.trim();

    const newTitle = document.getElementById('modal-title-input').value.trim();
    const newDesc = document.getElementById('modal-desc-input').value.trim();

    if (!locInput || !newTitle) return alert("Location and Title cannot be empty.");

    const { error } = await mySupabaseDb.from('items').update({ 
        location: locInput, title: newTitle, description: newDesc
    }).eq('id', window.activeItemId);
    
    if (error) alert("Error: " + error.message); 
    else {
        document.getElementById('item-modal').classList.add('hidden');
        loadInventory(); 
    }
};

window.closeModal = () => document.getElementById('item-modal').classList.add('hidden');

// ==========================================================================
// 7. ADMIN DASHBOARD LOGIC
// ==========================================================================
document.getElementById('btn-open-admin').addEventListener('click', () => {
    document.querySelectorAll('.view-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('screen-admin').classList.remove('hidden');
    loadAdminDashboard();
});

document.getElementById('btn-close-admin').addEventListener('click', () => {
    document.querySelectorAll('.view-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('screen-home').classList.remove('hidden');
});

async function loadAdminDashboard() {
    if (!mySupabaseDb) return;
    await fetchCurrentQuotas();

    document.getElementById('gemini-daily-count').innerText = currentGeminiUsage;
    document.getElementById('supabase-monthly-count').innerText = currentSupabaseUsage;

    document.getElementById('input-gemini-limit').value = GEMINI_DAILY_LIMIT;
    document.getElementById('input-supabase-limit').value = SUPABASE_MONTHLY_LIMIT;

    document.getElementById('gemini-progress').max = GEMINI_DAILY_LIMIT;
    document.getElementById('gemini-progress').value = currentGeminiUsage;
    
    document.getElementById('supabase-progress').max = SUPABASE_MONTHLY_LIMIT;
    document.getElementById('supabase-progress').value = currentSupabaseUsage;
}

document.getElementById('btn-save-limits').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-limits');
    const newGemini = parseInt(document.getElementById('input-gemini-limit').value);
    const newSupabase = parseInt(document.getElementById('input-supabase-limit').value);

    if (isNaN(newGemini) || isNaN(newSupabase)) return alert("Limits must be valid numbers.");

    btn.innerText = "⏳ Saving...";

    const { error } = await mySupabaseDb.from('app_settings').upsert([
        { id: 'gemini_daily_limit', setting_value: newGemini },
        { id: 'supabase_monthly_limit', setting_value: newSupabase }
    ]);

    if (error) {
        alert("Failed to save settings: " + error.message);
    } else {
        GEMINI_DAILY_LIMIT = newGemini;
        SUPABASE_MONTHLY_LIMIT = newSupabase;
        document.getElementById('gemini-progress').max = GEMINI_DAILY_LIMIT;
        document.getElementById('supabase-progress').max = SUPABASE_MONTHLY_LIMIT;
        
        if (typeof window.triggerUnlockCheck === 'function') window.triggerUnlockCheck();
        alert("Limits updated successfully!");
    }
    btn.innerText = "💾 Save New Limits";
});

// ==========================================================================
// 8. AUTHENTICATION & ACCOUNTS
// ==========================================================================
let isSignUp = false;
window.toggleAuthMode = () => {
    isSignUp = !isSignUp;
    document.getElementById('auth-title').innerText = isSignUp ? "Create Account" : "Welcome back";
    document.getElementById('auth-btn').innerText = isSignUp ? "Register" : "Secure Login";
    document.getElementById('auth-toggle').innerText = isSignUp ? "Already have an account? Sign In" : "Don't have an account? Register Here";
};

window.handleAuth = async () => {
    if (!mySupabaseDb) return alert("System Error: Database not connected.");
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

// Auto-check login status
if (mySupabaseDb) {
    mySupabaseDb.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-content').classList.remove('hidden');
            
            fetchCurrentQuotas();
            
            const userEmail = session.user.email;
            const createdDate = new Date(session.user.created_at).toLocaleString();
            const lastSignInDate = new Date(session.user.last_sign_in_at).toLocaleString();
            
            const homeDisplay = document.getElementById('home-user-display');
            const accountEmailDisplay = document.getElementById('account-email-display');
            const accountCreatedDisplay = document.getElementById('account-created-display');
            const accountLastSigninDisplay = document.getElementById('account-last-signin-display');
            
            if (homeDisplay) homeDisplay.innerText = `👤 ${userEmail}`;
            if (accountEmailDisplay) accountEmailDisplay.innerText = userEmail;
            if (accountCreatedDisplay) accountCreatedDisplay.innerText = createdDate;
            if (accountLastSigninDisplay) accountLastSigninDisplay.innerText = lastSignInDate;

            // Admin button visibility toggle
            if (ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
                document.getElementById('admin-controls').classList.remove('hidden');
            } else {
                document.getElementById('admin-controls').classList.add('hidden');
            }
            
        } else {
            document.getElementById('auth-screen').style.display = 'flex';
            document.getElementById('app-content').classList.add('hidden');
        }
    });
}

// ==========================================================================
// 9. NATIVE PULL-TO-REFRESH MECHANICS
// ==========================================================================
let pwaTouchstartY = 0;
let pwaTouchendY = 0;

// Listen to the entire document or a specific scrollable container
document.addEventListener('touchstart', e => {
    // Only register the start if we are at the very top of the page
    if (window.scrollY === 0) {
        pwaTouchstartY = e.changedTouches[0].screenY;
    }
}, { passive: true });

document.addEventListener('touchend', e => {
    if (window.scrollY === 0) {
        pwaTouchendY = e.changedTouches[0].screenY;
        
        // If the user pulled down more than 150 pixels, trigger the hard reset
        if (pwaTouchendY > pwaTouchstartY + 150) {
            
            // Optional visual feedback before reload
            document.body.style.opacity = "0.5"; 
            document.body.style.transition = "opacity 0.2s ease";
            
            // Hard reload clears memory leaks and restores baseline predictability 
            location.reload(); 
        }
    }
}, { passive: true });
