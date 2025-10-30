// Common utility functions for setup wizard

// API helper
async function apiCall(endpoint, method = 'GET', data = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(endpoint, options);
    return response.json();
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Update progress bar
function updateProgress(percent, text) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }

    if (progressText && text) {
        progressText.textContent = text;
    }
}

// Show/hide progress section
function showProgress(show = true) {
    const progressSection = document.getElementById('progress');
    if (progressSection) {
        progressSection.style.display = show ? 'block' : 'none';
    }
}

// Disable form
function disableForm(formId, disabled = true) {
    const form = document.getElementById(formId);
    if (form) {
        const inputs = form.querySelectorAll('input, select, textarea, button');
        inputs.forEach(input => {
            input.disabled = disabled;
        });
    }
}

// Validate email
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Export for use in other scripts
window.setupUtils = {
    apiCall,
    showToast,
    updateProgress,
    showProgress,
    disableForm,
    isValidEmail,
};
