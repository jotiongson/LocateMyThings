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
    updateHomeDropdown();
    renderLocationsTab();

    // A. SETTINGS
    const sbUrlInput = document.getElementById('sb-url-input');
    const sbKeyInput = document.getElementById('sb-key-input');
    const apiKeyInput = document.getElementById('api-key-input');
    if(sbUrlInput) sbUrlInput.value = SUPABASE_URL;
    if(sbKeyInput) sbKeyInput.value = SUPABASE_ANON_KEY;
    if(apiKeyInput) apiKeyInput.value = GEMINI_API_KEY;
    
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        localStorage.setItem('locate_sb_url', sbUrlInput.value.trim());
        localStorage.setItem('locate_sb_key', sbKeyInput.value.trim());
        localStorage.setItem('locate_gemini_key', apiKeyInput.value.trim());
        location.reload();
    });

    // B. NAVIGATION
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = btn.getAttribute('data-target');
            document.querySelectorAll('.view-panel').forEach(p => p.classList.add('hidden'));
            document.getElementById(target).classList.remove('hidden');
            if (target === 'screen-manage') loadInventory();
        });
    });

    // C. CAMERA & GRID
    const imageInput = document.getElementById('image-input');
    if (imageInput) {
        imageInput.addEventListener('change', async (e) => {
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
        const rows = document.querySelectorAll('#verification-table-body tr');
        let toInsert = [];
        rows.forEach(row => {
            if (row.querySelector('.item-confirm').checked) {
                toInsert.push({ 
                    title: row.querySelector('.item-title').value,
                    description: row.querySelector('.item-desc').value,
                    location: document.getElementById('location-select').value,
                    image_base64: row.querySelector('.item-img-base64').value
                });
            }
        });
        const { error } = await mySupabaseDb.from('items').insert(toInsert);
        if (error) alert(error.message); else { alert("Success!"); loadInventory(); }
    });
});

// --- 4. INVENTORY MANAGEMENT & MODAL ---
let currentInventory = [];

async function loadInventory() {
    const { data } = await mySupabaseDb.from('items').select('*').order('created_at', { ascending: false });
    currentInventory = data || [];
    populateFilterDropdown();
    window.renderInventoryTable();
}

function populateFilterDropdown() {
    const filter = document.getElementById('inventory-filter');
    const locations = [...new Set(currentInventory.map(i => i.location).filter(Boolean))];
    filter.innerHTML = `<option value="All">All Locations</option>` + locations.map(l => `<option value="${l}">${l}</option>`).join('');
}

window.renderInventoryTable = function() {
    const tbody = document.getElementById('items-table-body');
    const loc = document.getElementById('inventory-filter').value;
    const search = document.getElementById('inventory-search').value.toLowerCase();
    tbody.innerHTML = '';
    currentInventory.filter(item => (loc === "All" || item.location === loc) && (item.title.toLowerCase().includes(search) || item.description.toLowerCase().includes(search)))
    .forEach(item => {
        const tr = document.createElement('tr');
        tr.style.cursor = "pointer";
        tr.onclick = () => openModal(item);
        tr.innerHTML = `<td><img src="${item.image_base64 || ''}" style="width:40px; height:40px; object-fit:cover;"></td><td>${item.title}</td><td>${item.description.substring(0, 20)}...</td><td>${item.location}</td>`;
        tbody.appendChild(tr);
    });
}

function openModal(item) {
    document.getElementById('modal-img').src = item.image_base64 || '';
    document.getElementById('modal-title').innerText = item.title;
    document.getElementById('modal-desc').innerText = item.description;
    document.getElementById('modal-location').value = item.location;
    window.activeItemId = item.id;

    // Build the dropdown options dynamically from your saved zones
    const datalist = document.getElementById('modal-location-options');
    if (datalist) {
        datalist.innerHTML = getSavedLocations().map(loc => `<option value="${loc}">`).join('');
    }

    document.getElementById('item-modal').classList.remove('hidden');
}

window.saveModalChanges = async () => {
    const locInput = document.getElementById('modal-location').value.trim();
    if (!locInput) return alert("Location cannot be empty.");

    // SAFETY NET: If the user typed a completely new location, save it to their zones!
    let savedLocs = getSavedLocations();
    if (!savedLocs.includes(locInput)) {
        savedLocs.push(locInput);
        localStorage.setItem('locate_custom_zones', JSON.stringify(savedLocs));
        
        // Update all other menus in the background so everything stays in sync
        renderLocationsTab();
        updateHomeDropdown();
        populateFilterDropdown(); 
    }

    // Push the update to the Supabase database
    const { error } = await mySupabaseDb
        .from('items')
        .update({ location: locInput })
        .eq('id', window.activeItemId);

    if (error) {
        alert("Error updating database: " + error.message);
    } else {
        document.getElementById('item-modal').classList.add('hidden');
        loadInventory(); // Instantly refreshes the list so you see the change
    }
};

window.closeModal = () => document.getElementById('item-modal').classList.add('hidden');

// --- 5. LOCATIONS LOGIC ---
function getSavedLocations() {
    return JSON.parse(localStorage.getItem('locate_custom_zones')) || ["Garage Table Drawer A", "Master Bedroom Closet Bin B", "Kitchen Pantry Top Shelf"];
}

function renderLocationsTab() {
    const list = document.getElementById('locations-list');
    list.innerHTML = getSavedLocations().map(loc => `<li style="background:#f8f9fa; margin-bottom:10px; padding:15px; border:1px solid #ddd; display:flex; justify-content:space-between;">${loc} <button onclick="removeLocation('${loc}')">🗑️</button></li>`).join('');
}

function updateHomeDropdown() {
    const select = document.getElementById('location-select');
    select.innerHTML = getSavedLocations().map(l => `<option value="${l}">${l}</option>`).join('');
}

window.addNewLocation = () => {
    const val = document.getElementById('new-location-input').value;
    let locs = getSavedLocations();
    locs.push(val);
    localStorage.setItem('locate_custom_zones', JSON.stringify(locs));
    renderLocationsTab();
    updateHomeDropdown();
};

window.removeLocation = (l) => {
    let locs = getSavedLocations().filter(item => item !== l);
    localStorage.setItem('locate_custom_zones', JSON.stringify(locs));
    renderLocationsTab();
    updateHomeDropdown();
};
