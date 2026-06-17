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