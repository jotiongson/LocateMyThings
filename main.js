// --- 1. ERROR PROOF INITIALIZATION ---
let SUPABASE_URL = "";
let SUPABASE_ANON_KEY = "";
let GEMINI_API_KEY = "";

try {
    SUPABASE_URL = localStorage.getItem('locate_sb_url') || "";
    SUPABASE_ANON_KEY = localStorage.getItem('locate_sb_key') || "";
    GEMINI_API_KEY = localStorage.getItem('locate_gemini_key') || "";
} catch (error) {
    alert("Warning: Your browser is blocking local storage. Settings won't save!");
}

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
    
    // THE ULTIMATE VISUAL PROOF
    const mainTitle = document.querySelector('h2');
    if (mainTitle) {
        mainTitle.innerText = "System Online!";
        mainTitle.style.color = "#007bff"; // Turns the text BLUE
    }

    // A. SETTINGS LOGIC
    const apiKeyInput = document.getElementById('api-key-input');
    const saveSettingsBtn = document.getElementById('btn-save-settings');
    
    if(apiKeyInput) apiKeyInput.value = GEMINI_API_KEY;
    
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const userGeminiKey = apiKeyInput.value.trim();
            try {
                localStorage.setItem('locate_gemini_key', userGeminiKey);
                GEMINI_API_KEY = userGeminiKey;
                alert("Configuration saved locally on this device!");
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

            navItems.forEach(nav => nav.classList.remove('active'));
            currentButton.classList.add('active');

            viewPanels.forEach(panel => panel.classList.add('hidden'));
            document.getElementById(targetScreenId).classList.remove('hidden');
        });
    });

    // C. CAMERA & GRID LOGIC
    const imageInput = document.getElementById('image-input');
    const loadingStatus = document.getElementById('loading-status');
    const verificationArea = document.getElementById('verification-area');
    const verificationTableBody = document.getElementById('verification-table-body');
    const btnAddManual = document.getElementById('btn-add-manual');

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
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td><input type="checkbox" class="item-confirm" checked></td>
                            <td><input type="text" class="item-title" value="${item.title}"></td>
                            <td><input type="text" class="item-desc" value="${item.description}"></td>
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
                <td><input type="checkbox" class="item-confirm" checked></td>
                <td><input type="text" class="item-title" placeholder="Name"></td>
                <td><input type="text" class="item-desc" placeholder="Desc"></td>
            `;
            verificationTableBody.appendChild(row);
        });
    }
});