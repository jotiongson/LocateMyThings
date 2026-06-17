// Wait for the HTML document to fully load
document.addEventListener('DOMContentLoaded', () => {
    const navItems = document.querySelectorAll('.nav-item');
    const viewPanels = document.querySelectorAll('.view-panel');

    // Handle Bottom Navigation Clicks
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Get the target screen ID from the button's data-target attribute
            const currentButton = e.currentTarget;
            const targetScreenId = currentButton.getAttribute('data-target');

            // 1. Remove 'active' class from all nav buttons
            navItems.forEach(nav => nav.classList.remove('active'));
            // 2. Add 'active' class to the clicked button
            currentButton.classList.add('active');

            // 3. Hide all screen panels
            viewPanels.forEach(panel => panel.classList.add('hidden'));
            // 4. Show the target screen panel
            document.getElementById(targetScreenId).classList.remove('hidden');
        });
    });
});

// Global variables to hold your configurations (Fill these out in your Settings tab later)
let SUPABASE_URL = "";
let SUPABASE_ANON_KEY = "";
let GEMINI_API_KEY = "";

// Initialize Supabase placeholder variable
let supabase = null;

function initSupabase() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
}

/**
 * Sends a base64 encoded image to the Gemini 1.5 Flash API 
 * and requests a structured JSON list of detected items.
 */
async function scanContainerWithAI(base64Image) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const prompt = "Analyze this storage location image. Identify all distinct, separate items visible. Provide a concise Title (2-4 words) and a brief Description for each. Return the data strictly as a valid JSON array of objects with 'title' and 'description' keys. Do not use markdown wrappers.";

    const payload = {
        contents: [{
            parts: [
                { text: prompt },
                {
                    inlineData: {
                        mimeType: "image/png",
                        data: base64Image
                    }
                }
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
        // Clean up text response in case markdown blocks slipped through
        let rawText = result.candidates[0].content.parts[0].text.trim();
        if (rawText.startsWith("```json")) rawText = rawText.replaceAll("```json", "").replaceAll("```", "");
        
        return JSON.parse(rawText); // Returns the clean array of items
    } catch (error) {
        console.error("AI Scanning failed:", error);
        alert("Failed to parse AI response. Make sure your API key is correct.");
        return [];
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const loadingStatus = document.getElementById('loading-status');
    const verificationArea = document.getElementById('verification-area');
    const verificationTableBody = document.getElementById('verification-table-body');
    const btnAddManual = document.getElementById('btn-add-manual');
    const btnSaveBulk = document.getElementById('btn-save-bulk');

    let currentSharedImageBase64 = "";

    // 1. Listen for image capture/upload
    if (imageInput) {
        imageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Show loading text, hide old grid data
            loadingStatus.classList.remove('hidden');
            verificationArea.classList.add('hidden');
            verificationTableBody.innerHTML = "";

            // Convert image to base64
            const reader = new FileReader();
            reader.onloadend = async () => {
                currentSharedImageBase64 = reader.result.split(',')[1]; // Strip header data
                
                // Call our Gemini API wrapper function
                const detectedItems = await scanContainerWithAI(currentSharedImageBase64);
                
                loadingStatus.classList.add('hidden');
                
                if (detectedItems && detectedItems.length > 0) {
                    // Populate table rows dynamically
                    detectedItems.forEach(item => {
                        addTableRow(item.title, item.description, true);
                    });
                    verificationArea.classList.remove('hidden');
                } else {
                    alert("AI couldn't find any items or key configuration is missing.");
                }
            };
            reader.readAsDataURL(file);
        });
    }

    // Helper function to inject rows into the verification grid
    function addTableRow(title = "", description = "", checked = true) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="checkbox" class="item-confirm" ${checked ? 'checked' : ''}></td>
            <td><input type="text" class="item-title" value="${title}" placeholder="Item name"></td>
            <td><input type="text" class="item-desc" value="${description}" placeholder="Brief description"></td>
        `;
        verificationTableBody.appendChild(row);
    }

    // 2. Allow user to add manual entry rows for items missed by AI
    if (btnAddManual) {
        btnAddManual.addEventListener('click', () => {
            addTableRow("", "", true); // Injects a fresh blank row
        });
    }

    // 3. Save Confirmed Batch to Supabase
    if (btnSaveBulk) {
        btnSaveBulk.addEventListener('click', async () => {
            const targetLocation = document.getElementById('location-select').value;
            const rows = verificationTableBody.querySelectorAll('tr');
            let itemsToInsert = [];

            rows.forEach(row => {
                const keep = row.querySelector('.item-confirm').checked;
                const title = row.querySelector('.item-title').value.trim();
                const description = row.querySelector('.item-desc').value.trim();

                if (keep && title) {
                    itemsToInsert.push({ title, description });
                }
            });

            if (itemsToInsert.length === 0) {
                alert("No confirmed items to save.");
                return;
            }

            console.log("Saving items to " + targetLocation, itemsToInsert);
            // Next step: Insert payload array into Supabase storage and table!
            alert(`Ready to batch save ${itemsToInsert.length} items to ${targetLocation}!`);
        });
    }
});