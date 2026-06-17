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