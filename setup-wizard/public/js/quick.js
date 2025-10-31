// Quick Setup page logic
console.log('📝 quick.js file loaded');

// Check if setupUtils is available
if (!window.setupUtils) {
    console.error('❌ setupUtils not found! setup.js may not have loaded.');
    alert('Error: Setup utilities not loaded. Please refresh the page.');
}

const { apiCall, showToast, updateProgress, showProgress, disableForm, isValidEmail } = window.setupUtils || {};

let generatedSecrets = null;
let dbPassword = null;

console.log('📝 quick.js initialized, waiting for DOMContentLoaded...');

// Generate secrets on page load
window.addEventListener('DOMContentLoaded', async () => {
    console.log('Quick setup page loaded');

    // IMPORTANT: Setup event listeners FIRST, before any async operations
    // This ensures form submission is always intercepted even if API calls fail
    const providerSelect = document.getElementById('aiProvider');
    const passwordInput = document.getElementById('adminPassword');
    const regenerateBtn = document.getElementById('regenerateBtn');
    const setupForm = document.getElementById('quickSetupForm');

    if (providerSelect) {
        providerSelect.addEventListener('change', handleProviderChange);
        console.log('AI provider change listener attached');
    } else {
        console.error('AI provider select element not found!');
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', checkPasswordStrength);
        console.log('Password strength listener attached');
    }

    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', generateSecrets);
        console.log('Regenerate button listener attached');
    }

    if (setupForm) {
        setupForm.addEventListener('submit', handleSubmit);
        console.log('✅ Form submit listener attached - form will not reload page');
    } else {
        console.error('❌ Setup form element not found! Form will reload page on submit!');
    }

    // Now generate secrets (this might fail, but form listener is already attached)
    try {
        await generateSecrets();
    } catch (error) {
        console.error('Error generating secrets:', error);
        showToast('Failed to generate secrets. You can still complete setup.', 'error');
    }
});

// Handle AI provider selection
function handleProviderChange(e) {
    console.log('Provider changed to:', e.target.value);
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const apiKeyInput = document.getElementById('apiKey');

    if (!apiKeyGroup || !apiKeyInput) {
        console.error('API key elements not found in DOM');
        return;
    }

    if (e.target.value) {
        console.log('Showing API key input for provider:', e.target.value);
        apiKeyGroup.style.display = 'block';
        apiKeyInput.required = false;
        apiKeyInput.placeholder = `Enter your ${e.target.value} API key`;
    } else {
        console.log('Hiding API key input');
        apiKeyGroup.style.display = 'none';
        apiKeyInput.required = false;
        apiKeyInput.value = '';
    }
}

// Check password strength
function checkPasswordStrength() {
    const password = document.getElementById('adminPassword').value;
    const strengthEl = document.getElementById('passwordStrength');

    if (!password) {
        strengthEl.className = 'password-strength';
        return;
    }

    let strength = 1;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    strength = Math.min(strength, 4);

    const classes = ['', 'weak', 'fair', 'good', 'strong'];
    strengthEl.className = `password-strength ${classes[strength]}`;
}

// Generate secrets
async function generateSecrets() {
    const secretsDisplay = document.getElementById('secretsDisplay');
    const regenerateBtn = document.getElementById('regenerateBtn');

    if (!secretsDisplay) {
        console.error('Secrets display element not found');
        return;
    }

    secretsDisplay.innerHTML = '<div class="loading">Generating secure keys...</div>';

    try {
        console.log('Generating secrets...');
        const result = await apiCall('/api/generate-secrets', 'POST');

        if (result.success) {
            console.log('Secrets generated successfully');
            generatedSecrets = result.secrets;
            dbPassword = result.dbPassword.value;

            secretsDisplay.innerHTML = '';

            for (const [key, data] of Object.entries(result.secrets)) {
                const item = document.createElement('div');
                item.className = 'secret-item';
                item.innerHTML = `
                    <div>
                        <strong>${key}</strong>
                        <code>${data.masked}</code>
                    </div>
                `;
                secretsDisplay.appendChild(item);
            }

            if (regenerateBtn) {
                regenerateBtn.style.display = 'block';
            }
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Failed to generate secrets:', error);
        secretsDisplay.innerHTML = `
            <div class="alert alert-error">
                Failed to generate secrets: ${error.message}
            </div>
        `;
        throw error; // Re-throw so parent can handle
    }
}

// Handle form submission
async function handleSubmit(e) {
    e.preventDefault();
    console.log('Form submitted, starting setup process...');

    const adminEmail = document.getElementById('adminEmail').value;
    const adminPassword = document.getElementById('adminPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const aiProvider = document.getElementById('aiProvider').value;
    const apiKey = document.getElementById('apiKey').value;

    // Validate
    if (!isValidEmail(adminEmail)) {
        console.log('Validation failed: Invalid email');
        showToast('Please enter a valid email address', 'error');
        return;
    }

    if (adminPassword !== confirmPassword) {
        console.log('Validation failed: Passwords do not match');
        showToast('Passwords do not match', 'error');
        return;
    }

    if (adminPassword.length < 8) {
        console.log('Validation failed: Password too short');
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    console.log('Validation passed, starting setup...');

    // Show loading overlay immediately
    const overlay = document.getElementById('loadingOverlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayText = document.getElementById('overlayText');
    const overlayProgress = document.getElementById('overlayProgress');

    if (overlay) {
        overlay.style.display = 'flex';
        overlayProgress.style.width = '0%';
    }

    // Helper function to update overlay
    function updateOverlay(percent, title, text) {
        console.log(`Progress: ${percent}% - ${title} - ${text}`);
        if (overlayTitle) overlayTitle.textContent = title;
        if (overlayText) overlayText.textContent = text;
        if (overlayProgress) overlayProgress.style.width = `${percent}%`;
    }

    // Start setup process
    disableForm('quickSetupForm', true);
    showProgress(true);

    try {
        // Step 1: Get defaults
        console.log('Step 1: Loading defaults...');
        updateOverlay(10, 'Loading Configuration', 'Loading environment defaults...');
        updateProgress(10, 'Loading environment defaults...');
        const defaultsResult = await apiCall('/api/defaults');

        if (!defaultsResult.success) {
            console.error('Failed to load defaults:', defaultsResult);
            throw new Error('Failed to load defaults');
        }
        console.log('Defaults loaded successfully');

        // Build configuration
        const config = {
            ...defaultsResult.defaults,
            ...generatedSecrets,
            adminEmail,
            adminPassword,
        };

        // Add AI provider if selected
        if (aiProvider && apiKey) {
            console.log('Adding AI provider:', aiProvider);
            const providerMap = {
                'anthropic': 'ANTHROPIC_API_KEY',
                'openai': 'OPENAI_API_KEY',
                'google': 'GOOGLE_API_KEY',
            };
            config[providerMap[aiProvider]] = apiKey;
        }

        // Step 2: Save .env file
        console.log('Step 2: Saving .env file...');
        updateOverlay(30, 'Saving Configuration', 'Creating .env file with your settings...');
        updateProgress(30, 'Saving configuration...');
        const saveResult = await apiCall('/api/save-env', 'POST', config);

        if (!saveResult.success) {
            console.error('Failed to save .env:', saveResult);
            throw new Error(saveResult.message);
        }
        console.log('.env file saved successfully');

        // Step 3: Complete setup (database + admin user)
        console.log('Step 3: Setting up database and creating admin user...');
        updateOverlay(50, 'Setting Up Database', 'Running migrations and creating admin account...');
        updateProgress(50, 'Setting up database and creating admin user...');
        const completeResult = await apiCall('/api/complete-setup', 'POST', {
            databaseUrl: config.DATABASE_URL,
            adminEmail,
            adminPassword,
        });

        if (!completeResult.success) {
            console.error('Failed to complete setup:', completeResult);
            throw new Error(completeResult.message);
        }
        console.log('Setup completed successfully!');

        // Success!
        updateOverlay(100, 'Setup Complete!', 'Your Plugged.in installation is ready!');
        updateProgress(100, 'Setup completed successfully!');

        // Show success message in overlay
        setTimeout(() => {
            updateOverlay(100, '✅ Setup Complete!', 'Application will restart automatically...');

            // Update overlay to show success
            if (overlayTitle) {
                overlayTitle.innerHTML = '✅ Setup Complete!';
                overlayTitle.style.color = '#10b981';
            }
            if (overlayText) {
                overlayText.innerHTML = `
                    <strong>Admin Account Created:</strong><br>
                    Email: ${adminEmail}<br><br>
                    The application will restart in a few seconds...<br>
                    You can then log in with your admin credentials at port 12005.
                `;
            }
        }, 500);

        // Keep overlay visible to show success
        // Container will restart automatically

    } catch (error) {
        console.error('Setup error:', error);

        // Hide overlay and show error
        if (overlay) {
            overlay.style.display = 'none';
        }

        updateProgress(0, '');
        showProgress(false);
        disableForm('quickSetupForm', false);

        // Show error prominently
        showToast(`Setup failed: ${error.message}`, 'error');

        // Also show error in the page
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-error';
        errorDiv.style.marginTop = '1rem';
        errorDiv.innerHTML = `
            <strong>Setup Failed:</strong><br>
            ${error.message}<br><br>
            Please check the console (F12) for more details and try again.
        `;
        document.querySelector('form').insertBefore(errorDiv, document.querySelector('form').firstChild);
    }
}
