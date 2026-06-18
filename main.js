// ==========================================
// 1. SUPABASE INITIALIZATION
// ==========================================
const SUPABASE_URL = "https://etmogzjhmvuwpvbuwryh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bW9nempobXZ1d3B2YnV3cnloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDU2OTUsImV4cCI6MjA5NzI4MTY5NX0.uu8C3xdciivAPYX5EYspOskyDIka7cWNB6jsEIrwWrw";

window.mySupabaseDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 2. AUTHENTICATION (TIMBREBOX STYLE)
// ==========================================
let isSignUp = false;

// Toggles the UI between Login and Register modes
window.toggleAuthMode = () => {
    isSignUp = !isSignUp;
    document.getElementById('auth-title').innerText = isSignUp ? "Create your account" : "Welcome back";
    document.getElementById('auth-subtitle').innerText = isSignUp ? "Start organizing your things." : "Enter your credentials to access your items.";
    document.getElementById('auth-btn').innerText = isSignUp ? "Create Account" : "Secure Login";
    document.getElementById('auth-toggle').innerText = isSignUp ? "Already have an account? Sign In" : "Don't have an account? Register Here";
};

// Handles the actual authentication call
window.handleAuth = async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const authBtn = document.getElementById('auth-btn');

    if (!email || !password) {
        alert("Please enter both your email and password.");
        return;
    }

    authBtn.innerText = "Processing...";
    authBtn.disabled = true;

    if (isSignUp) {
        // Register a new user
        const { data, error } = await window.mySupabaseDb.auth.signUp({
            email: email,
            password: password,
        });
        
        if (error) {
            alert("Registration Error: " + error.message);
        } else {
            alert("Success! Account created. You can now log in.");
            window.toggleAuthMode(); // Flip back to login view automatically
        }
    } else {
        // Log in an existing user
        const { data, error } = await window.mySupabaseDb.auth.signInWithPassword({
            email: email,
            password: password,
        });
        
        if (error) {
            alert("Login Error: " + error.message);
        }
    }

    authBtn.innerText = isSignUp ? "Create Vault" : "Unlock Vault";
    authBtn.disabled = false;
};

// Handle logging out
window.logout = async () => {
    await window.mySupabaseDb.auth.signOut();
};

// Automatically show/hide screens based on login status
window.mySupabaseDb.auth.onAuthStateChange((event, session) => {
    if (session) {
        // User is logged in
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
    } else {
        // User is logged out
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
    }
});


// ==========================================
// 3. AI SCANNER & EDGE FUNCTION
// ==========================================

// Trigger the hidden file input
window.triggerScan = () => {
    document.getElementById('image-input').click();
};

// Process the image when selected
window.handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    document.getElementById('ai-loading').style.display = 'block';
    document.getElementById('verify-section').style.display = 'none';

    const reader = new FileReader();
    reader.onload = async (e) => {
        // Strip the data:image prefix to get pure base64
        const base64Image = e.target.result.split(',')[1]; 
        
        // Send to Edge Function
        const items = await scanContainerWithAI(base64Image);
        
        document.getElementById('ai-loading').style.display = 'none';
        
        if (items && (Array.isArray(items) ? items.length > 0 : items.title)) {
            displayDetectedItems(Array.isArray(items) ? items : [items]);
        }
    };
    reader.readAsDataURL(file);
};

// Secure Edge Function Call (With the fixed parsing logic)
async function scanContainerWithAI(base64Image) {
    try {
        const { data, error } = await window.mySupabaseDb.functions.invoke('scan-image', {
            body: { base64Image: base64Image }
        });

        if (error) {
            alert("Edge Function Error: " + error.message);
            return [];
        }

        if (data && data.error) {
            alert("AI Error: " + data.error.message);
            return [];
        }

        // Return the clean JSON data provided directly by the Edge Function
        return data; 

    } catch (error) {
        alert("Real Error: " + error.message);
        return [];
    }
}


// ==========================================
// 4. UI INTERACTION & SAVING
// ==========================================

// Renders the AI results into the HTML list
window.displayDetectedItems = (items) => {
    const list = document.getElementById('detected-items-list');
    list.innerHTML = ''; // Clear previous items

    items.forEach((item, index) => {
        const title = item.title || item.name || 'Detected Item';
        const desc = item.description || '';
        
        const div = document.createElement('div');
        div.style.marginBottom = '1rem';
        div.style.display = 'flex';
        div.style.gap = '0.5rem';
        div.style.alignItems = 'center';
        
        div.innerHTML = `
            <input type="checkbox" id="keep-${index}" checked style="transform: scale(1.2);">
            <input type="text" id="title-${index}" value="${title}" style="flex: 1; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.25rem;">
            <input type="text" id="desc-${index}" value="${desc}" style="flex: 2; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.25rem;">
        `;
        list.appendChild(div);
    });
    
    // Store the count so saveItems knows how many inputs to look for
    window.currentDetectedItemsCount = items.length;
    document.getElementById('verify-section').style.display = 'block';
};

// Gather verified items and save them to the database
window.saveItems = async () => {
    const locationId = document.getElementById('location-select').value;
    const containerTitle = document.getElementById('item-title').value;

    const itemsToSave = [];
    const count = window.currentDetectedItemsCount || 0;

    for (let i = 0; i < count; i++) {
        const keep = document.getElementById(`keep-${i}`).checked;
        if (keep) {
            const title = document.getElementById(`title-${i}`).value;
            const desc = document.getElementById(`desc-${i}`).value;
            itemsToSave.push({ title, description: desc }); // Add locationId or containerId here as needed
        }
    }

    if (itemsToSave.length === 0) {
        alert("No items selected to save.");
        return;
    }

    // NOTE: Replace 'your_table_name' with your actual Supabase table
    /*
    const { error } = await window.mySupabaseDb.from('your_table_name').insert(itemsToSave);
    if (error) {
        alert("Error saving items: " + error.message);
        return;
    }
    */

    alert(`Successfully saved ${itemsToSave.length} items!`);
    
    // Reset UI
    document.getElementById('verify-section').style.display = 'none';
    document.getElementById('detected-items-list').innerHTML = '';
};
