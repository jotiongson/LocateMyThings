// ==========================================
// 1. GLOBAL CONFIGURATION & KEYS
// ==========================================
// This pulls your keys from the phone's local storage so they actually work!
let SUPABASE_URL = localStorage.getItem('locate_sb_url') || "";
let SUPABASE_ANON_KEY = localStorage.getItem('locate_sb_key') || "";
let GEMINI_API_KEY = localStorage.getItem('locate_gemini_key') || "";

let supabase = null;

function initSupabase() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
}

// ==========================================
// 2. THE AI SCANNER FUNCTION
// ==========================================
async function scanContainerWithAI(base64Image) {
    if (!GEMINI_API_KEY) {
        alert("Please save your Gemini API Key in the Settings tab first!");
        return [];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const prompt = "Analyze this storage location image. Identify all distinct, separate items visible. Provide a concise Title (2-4 words) and a brief Description for each. Return the data strictly as a valid JSON array of objects with 'title' and 'description' keys. Do not use markdown wrappers.";

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
            console.error("API Error:", result.error);
            alert("AI Error: " + result.error.message);
            return [];
        }

        let rawText = result.candidates[0].content.parts[0].text.trim();
        if (rawText.startsWith("```json")) {
            rawText = rawText.replaceAll("```json", "").replaceAll("```", "").trim();
        }
        
        return JSON.parse(rawText); 
    } catch (error) {
        console.error("AI Scanning failed:", error);
        alert("Failed to parse AI response. See console for details.");
        return [];
    }
}

// ==========================================
// 3. MAIN APP INTERFACE LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // --- A. SETTINGS LOGIC ---
    const apiKeyInput = document.getElementById('api-key-input');
    const saveSettingsBtn = document.getElementById('btn-save-settings');
    
    if(apiKeyInput) apiKeyInput.value = GEMINI_API_KEY; // Pre-fill if exists
    
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const userGeminiKey = apiKeyInput.value.trim();
            localStorage.setItem('locate_gemini_key', userGeminiKey);
            GEMINI_API_KEY = userGeminiKey; // Update active variable
            alert("Configuration saved locally on this device!");
        });
    }

    // --- B. NAVIGATION LOGIC ---
    const navItems = document.querySelectorAll('.nav-item');
    const viewPanels = document.querySelectorAll('.view-panel');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const currentButton = e.currentTarget;
            const targetScreenId = currentButton.getAttribute('data-target');

            navItems.forEach(nav => nav.classList.remove('active'));
            currentButton.classList.add('active');

            viewPanels.forEach(panel => panel.classList.add('hidden'));
            document.getElementById(targetScreenId).classList.remove('hidden');
        });
    });

    // --- C. CAMERA & GRID LOGIC ---
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

            // UI Feedback
            loadingStatus.classList.remove('hidden');
            verificationArea.classList.add('hidden');
            verificationTableBody.innerHTML = "";

            // --- NEW COMPRESSION LOGIC ---
            const img = new Image();
            img.onload = async () => {
                // Create a temporary canvas to shrink the image
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800; // Resize to max 800px wide
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Convert shrunk image to base64 (70% quality jpeg)
                const base64Data = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]; 
                
                // Call AI
                const detectedItems = await scanContainerWithAI(base64Data);
                
                loadingStatus.classList.add('hidden'); // Hide loading text
                
                if (detectedItems && detectedItems.length > 0) {
                    detectedItems.forEach(item => {
                        addTableRow(item.title, item.description, true);
                    });
                    verificationArea.classList.remove('hidden'); // Show grid!
                }
            };
            // Load the file into the image object
            img.src = URL.createObjectURL(file);
        });
    }

    // Helper to add rows to grid
    function addTableRow(title = "", description = "", checked = true) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="item-confirm" ${checked ? 'checked' : ''}></td>
            <td><input type="text" class="item-title" value="${title}" placeholder="Item name"></td>
            <td><input type="text" class="item-desc" value="${description}" placeholder="Brief description"></td>
        `;
        verificationTableBody.appendChild(row);
    }

    if (btnAddManual) {
        btnAddManual.addEventListener('click', () => addTableRow("", "", true));
    }

    if (btnSaveBulk) {
        btnSaveBulk.addEventListener('click', async () => {
            const targetLocation = document.getElementById('location-select').value;
            const rows = verificationTableBody.querySelectorAll('tr');
            let itemsToInsert = [];

            rows.forEach(row => {
                const keep = row.querySelector('.item-confirm').checked;
                const title = row.querySelector('.item-title').value.trim();
                const description = row.querySelector('.item-desc').value.trim();
                if (keep && title) itemsToInsert.push({ title, description });
            });

            if (itemsToInsert.length === 0) {
                alert("No confirmed items to save.");
                return;
            }
            alert(`Ready to save ${itemsToInsert.length} items to Supabase!`);
        });
    }
});