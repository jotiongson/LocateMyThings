// --- 1. ERROR PROOF INITIALIZATION ---
let SUPABASE_URL = "";
let SUPABASE_ANON_KEY = "";
let GEMINI_API_KEY = "";

try {
    SUPABASE_URL = localStorage.getItem('locate_sb_url') || "";
    SUPABASE_ANON_KEY = localStorage.getItem('locate_sb_key') || "";
    GEMINI_API_KEY = localStorage.getItem('locate_gemini_key') || "";
} catch (error) {
    console.warn("Local storage unavailable.");
}

// Renamed to avoid conflicts with the official Supabase CDN
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

    // High-volume model to bypass traffic jams
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    
    // Strict prompt requiring exact bounding box coordinates
    const prompt = "Analyze this storage location image. Identify all distinct, separate items visible. Provide a concise Title (2-4 words), a brief Description, and a bounding box for each item. Return the data strictly as a valid JSON array of objects with 'title', 'description', and 'box_2d' keys. The 'box_2d' must be an array of 4 numbers [ymin, xmin, ymax, xmax] representing the normalized bounding box (0 to 1000) of the item. Do not use markdown wrappers.";

    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]
        }]
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert("AI Error: " + result.error.message);
            return [];
        }

        let rawText = result.candidates[0].content.parts[0].text.trim();
        if (rawText.startsWith("```json")) {
            rawText = rawText.replaceAll("```json", "").replaceAll("```", "").trim();
        }
        return JSON.parse(rawText); 
    } catch (error) {
        alert("Failed to parse AI response.");
        return [];
    }
}

// --- 3. MAIN INTERFACE LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    
    // VISUAL PROOF (Title turns blue if JS loads without crashing)
    const mainTitle = document.querySelector('h2');
    if (mainTitle) {
        mainTitle.innerText = "System Online!";
        mainTitle.style.color = "#007bff"; 
    }

    // A. SETTINGS LOGIC
    const sbUrlInput = document.getElementById('sb-url-input');
    const sbKeyInput = document.getElementById('sb-key-input');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveSettingsBtn = document.getElementById('btn-save-settings');
    
    // Pre-fill existing keys
    if(sbUrlInput) sbUrlInput.value = SUPABASE_URL;
    if(sbKeyInput) sbKeyInput.value = SUPABASE_ANON_KEY;
    if(apiKeyInput) apiKeyInput.value = GEMINI_API_KEY;
    
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            try {
                SUPABASE_URL = sbUrlInput.value.trim();
                SUPABASE_ANON_KEY = sbKeyInput.value.trim();
                GEMINI_API_KEY = apiKeyInput.value.trim();

                localStorage.setItem('locate_sb_url', SUPABASE_URL);
                localStorage.setItem('locate_sb_key', SUPABASE_ANON_KEY);
                localStorage.setItem('locate_gemini_key', GEMINI_API_KEY);
                
                // Reconnect to Supabase with new keys
                if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
                    mySupabaseDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                }

                alert("All keys saved securely to your device!");
            } catch (e) {
                alert("Could not save to device storage.");
            }
        });
    }

    // B. NAVIGATION LOGIC
    const navItems = document.querySelectorAll('.nav-item');
    const viewPanels = document.querySelectorAll('.view-panel');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const currentButton = e.currentTarget;
            const targetScreenId = currentButton.getAttribute('data-target');
            if(!targetScreenId) return;

            navItems.forEach(nav => nav.classList.remove('active'));
            currentButton.classList.add('active');

            viewPanels.forEach(panel => panel.classList.add('hidden'));
            const targetPanel = document.getElementById(targetScreenId);
            if(targetPanel) targetPanel.classList.remove('hidden');

            // NEW: If they clicked the Manage Items tab, fetch the data!
            if (targetScreenId === 'screen-manage') {
                loadInventory();
            }
        });
    });

    // C. CAMERA & GRID LOGIC
    const imageInput = document.getElementById('image-input');
    const loadingStatus = document.getElementById('loading-status');
    const verificationArea = document.getElementById('verification-area');
    const verificationTableBody = document.getElementById('verification-table-body');
    const btnAddManual = document.getElementById('btn-add-manual');
    const btnSaveBulk = document.getElementById('btn-save-bulk');

    if (imageInput) {
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            loadingStatus.classList.remove('hidden');
            verificationArea.classList.add('hidden');
            verificationTableBody.innerHTML = "";

            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const base64Data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]; 
                
                const detectedItems = await scanContainerWithAI(base64Data);
                
                loadingStatus.classList.add('hidden');
                
                if (detectedItems && detectedItems.length > 0) {
                    detectedItems.forEach(item => {
                        let thumbHtml = ""; 
                        let base64StringForDb = ""; 
                        
                        if (item.box_2d && item.box_2d.length === 4) {
                            try {
                                const cropCanvas = document.createElement('canvas');
                                const cropCtx = cropCanvas.getContext('2d');
                                
                                const ymin = (item.box_2d[0] / 1000) * img.height;
                                const xmin = (item.box_2d[1] / 1000) * img.width;
                                const ymax = (item.box_2d[2] / 1000) * img.height;
                                const xmax = (item.box_2d[3] / 1000) * img.width;
                                
                                const cropWidth = xmax - xmin;
                                const cropHeight = ymax - ymin;
                                
                                cropCanvas.width = cropWidth;
                                cropCanvas.height = cropHeight;
                                
                                cropCtx.drawImage(img, xmin, ymin, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                                
                                const thumbData = cropCanvas.toDataURL('image/jpeg', 0.6);
                                base64StringForDb = thumbData; 
                                thumbHtml = `<img src="${thumbData}" style="width: 50px; height: 50px; border-radius: 4px; object-fit: cover; border: 1px solid #ccc;">`;
                            } catch (e) {
                                console.warn("Failed to crop image for", item.title);
                            }
                        }

                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td style="text-align: center;"><input type="checkbox" class="item-confirm" checked></td>
                            <td style="text-align: center;">
                                ${thumbHtml}
                                <input type="hidden" class="item-img-base64" value="${base64StringForDb}">
                            </td>
                            <td><input type="text" class="item-title" value="${item.title}" style="width:100%;"></td>
                            <td><input type="text" class="item-desc" value="${item.description}" style="width:100%;"></td>
                        `;
                        verificationTableBody.appendChild(row);
                    });
                    verificationArea.classList.remove('hidden');
                }
            };
            img.src = URL.createObjectURL(file);
        });
    }

    if (btnAddManual) {
        btnAddManual.addEventListener('click', () => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="text-align: center;"><input type="checkbox" class="item-confirm" checked></td>
                <td style="text-align: center;"></td>
                <td><input type="text" class="item-title" placeholder="Name" style="width:100%;"></td>
                <td><input type="text" class="item-desc" placeholder="Desc" style="width:100%;"></td>
            `;
            verificationTableBody.appendChild(row);
        });
    }

    if (btnSaveBulk) {
        btnSaveBulk.addEventListener('click', async () => {
            if (!mySupabaseDb) {
                alert("Please configure your Supabase keys in the Settings tab first!");
                return;
            }

            const targetLocation = document.getElementById('location-select').value;
            const rows = verificationTableBody.querySelectorAll('tr');
            let itemsToInsert = [];

            rows.forEach(row => {
                const keep = row.querySelector('.item-confirm').checked;
                const title = row.querySelector('.item-title').value.trim();
                const description = row.querySelector('.item-desc').value.trim();
                const base64Img = row.querySelector('.item-img-base64') ? row.querySelector('.item-img-base64').value : "";
                
                if (keep && title) {
                    itemsToInsert.push({ 
                        title: title, 
                        description: description,
                        location: targetLocation,
                        image_base64: base64Img 
                    });
                }
            });

            if (itemsToInsert.length === 0) {
                alert("No confirmed items to save.");
                return;
            }

            btnSaveBulk.innerText = "⏳ Saving to Database...";

            const { data, error } = await mySupabaseDb
                .from('items')
                .insert(itemsToInsert);

            if (error) {
                console.error("Supabase Error:", error);
                alert("Error saving to database: " + error.message);
            } else {
                alert(`Success! Saved ${itemsToInsert.length} items to ${targetLocation}.`);
                verificationTableBody.innerHTML = ""; 
                verificationArea.classList.add('hidden'); 
            }
            
            btnSaveBulk.innerText = "💾 Save Confirmed Items to Database";
        });
    }
});

// --- 4. INVENTORY MANAGEMENT LOGIC ---
async function loadInventory() {
    const tableBody = document.getElementById('items-table-body');
    if (!tableBody) return;

    if (!mySupabaseDb) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Database not connected. Check Settings.</td></tr>`;
        return;
    }

    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">⏳ Loading your inventory...</td></tr>`;

    try {
        const { data, error } = await mySupabaseDb
            .from('items')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        tableBody.innerHTML = ''; 

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:gray;">No items stored yet. Go scan a drawer!</td></tr>`;
            return;
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            
            // Render the thumbnail, or a grey box if none exists
            const imageSrc = item.image_base64 ? item.image_base64 : 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

            tr.innerHTML = `
                <td style="text-align: center;"><img src="${imageSrc}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #ccc;"></td>
                <td style="font-weight: bold;">${item.title || 'Untitled'}</td>
                <td style="color: #666;">${item.description || ''}</td>
                <td><span style="background: #e9ecef; padding: 4px 8px; border-radius: 4px; font-size: 0.85rem;">📍 ${item.location || 'Unassigned'}</span></td>
                <td style="text-align: center;">
                    <button onclick="deleteItem(${item.id})" style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

    } catch (err) {
        console.error('Error fetching inventory:', err.message);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:red;">Failed to load items.</td></tr>`;
    }
}

// Global function so the inline delete button can access it
window.deleteItem = async function(id) {
    if (!confirm("Are you sure you want to permanently delete this item?")) return;
    
    if (!mySupabaseDb) return;

    try {
        const { error } = await mySupabaseDb
            .from('items')
            .delete()
            .eq('id', id);

        if (error) throw error;
        
        // Refresh the list automatically after deletion
        loadInventory();
    } catch (err) {
        alert("Error deleting item: " + err.message);
    }
};