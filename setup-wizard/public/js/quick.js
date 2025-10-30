// Quick Setup page logic

const { apiCall, showToast, updateProgress, showProgress, disableForm, isValidEmail } = window.setupUtils;

let generatedSecrets = null;
let dbPassword = null;

// Generate secrets on page load
window.addEventListener('DOMContentLoaded', async () => {
    await generateSecrets();

    // Setup event listeners
    document.getElementById('aiProvider').addEventListener('change', handleProviderChange);
    document.getElementById('adminPassword').addEventListener('input', checkPasswordStrength);
    document.getElementById('regenerateBtn').addEventListener('click', generateSecrets);
    document.getElementById('quickSetupForm').addEventListener('submit', handleSubmit);
});

// Handle AI provider selection
function handleProviderChange(e) {
    const apiKeyGroup = document.getElementById('apiKeyGroup');
    const apiKeyInput = document.getElementById('apiKey');

    if (e.target.value) {
        apiKeyGroup.style.display = 'block';
        apiKeyInput.required = false;
    } else {
        apiKeyGroup.style.display = 'none';
        apiKeyInput.required = false;
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

    secretsDisplay.innerHTML = '<div class="loading">Generating secure keys...</div>';

    try {
        const result = await apiCall('/api/generate-secrets', 'POST');

        if (result.success) {
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

            regenerateBtn.style.display = 'block';
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        secretsDisplay.innerHTML = `
            <div class="alert alert-error">
                Failed to generate secrets: ${error.message}
            </div>
        `;
    }
}

// Handle form submission
async function handleSubmit(e) {
    e.preventDefault();

    const adminEmail = document.getElementById('adminEmail').value;
    const adminPassword = document.getElementById('adminPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const aiProvider = document.getElementById('aiProvider').value;
    const apiKey = document.getElementById('apiKey').value;

    // Validate
    if (!isValidEmail(adminEmail)) {
        showToast('Please enter a valid email address', 'error');
        return;
    }

    if (adminPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }

    if (adminPassword.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
    }

    // Start setup process
    disableForm('quickSetupForm', true);
    showProgress(true);

    try {
        // Step 1: Get defaults
        updateProgress(10, 'Loading environment defaults...');
        const defaultsResult = await apiCall('/api/defaults');

        if (!defaultsResult.success) {
            throw new Error('Failed to load defaults');
        }

        // Build configuration
        const config = {
            ...defaultsResult.defaults,
            ...generatedSecrets,
            adminEmail,
            adminPassword,
        };

        // Add AI provider if selected
        if (aiProvider && apiKey) {
            const providerMap = {
                'anthropic': 'ANTHROPIC_API_KEY',
                'openai': 'OPENAI_API_KEY',
                'google': 'GOOGLE_API_KEY',
            };
            config[providerMap[aiProvider]] = apiKey;
        }

        // Step 2: Save .env file
        updateProgress(30, 'Saving configuration...');
        const saveResult = await apiCall('/api/save-env', 'POST', config);

        if (!saveResult.success) {
            throw new Error(saveResult.message);
        }

        // Step 3: Complete setup (database + admin user)
        updateProgress(50, 'Setting up database and creating admin user...');
        const completeResult = await apiCall('/api/complete-setup', 'POST', {
            databaseUrl: config.DATABASE_URL,
            adminEmail,
            adminPassword,
        });

        if (!completeResult.success) {
            throw new Error(completeResult.message);
        }

        // Success!
        updateProgress(100, 'Setup completed successfully!');

        // Show success message
        document.querySelector('main').innerHTML = `
            <div class="section">
                <h2 style="color: var(--success);">✅ Setup Complete!</h2>
                <p style="margin: 1.5rem 0;">Your Plugged.in installation is now configured and ready to use.</p>

                <div class="alert alert-success">
                    <strong>Admin Account Created:</strong><br>
                    Email: ${adminEmail}
                </div>

                <p style="color: var(--text-muted); margin-top: 1.5rem;">
                    The application will restart automatically in a few seconds...<br>
                    You can then log in with your admin credentials.
                </p>
            </div>
        `;

    } catch (error) {
        updateProgress(0, '');
        showProgress(false);
        disableForm('quickSetupForm', false);
        showToast(`Setup failed: ${error.message}`, 'error');
        console.error('Setup error:', error);
    }
}
