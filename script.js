(function () {
    'use strict';

    const api = window.MidoriApi;

    const CONFIG = {
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION_MS: 30000,
        MIN_PASSWORD_LENGTH: 8,
        EMAIL_REGEX: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        CPF_REGEX: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
        MFA_RESTORE_TTL_MS: 10 * 60 * 1000,
    };

    let loginAttempts = 0;
    let lockoutUntil = 0;
    let isLoginSubmitting = false;

    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('email-error');
    const passwordError = document.getElementById('password-error');
    const btnLogin = document.getElementById('btn-login');

    const loginCard = document.getElementById('login-card');
    const registerCard = document.getElementById('register-card');
    const signupLink = document.getElementById('signup-link');
    const loginLink = document.getElementById('login-link');
    const mascotLogin = document.getElementById('mascot-login');
    const mascotRegister = document.getElementById('mascot-register');
    const forgotCard = document.getElementById('forgot-card');
    const forgotLink = document.getElementById('forgot-link');
    const backLoginLink = document.getElementById('back-login-link');
    const forgotForm = document.getElementById('forgot-form');
    const forgotEmailInput = document.getElementById('forgot-email');
    const btnForgot = document.getElementById('btn-forgot');
    const mascotForgot = document.getElementById('mascot-forgot');

    const registerForm = document.getElementById('register-form');
    const regEmailInput = document.getElementById('reg-email');
    const regUsernameInput = document.getElementById('reg-username');
    const regPhoneInput = document.getElementById('reg-phone');
    const regCpfInput = document.getElementById('reg-cpf');
    const regPasswordInput = document.getElementById('reg-password');
    const passwordStrength = document.getElementById('password-strength');
    const passwordStrengthFill = document.getElementById('password-strength-fill');
    const passwordStrengthText = document.getElementById('password-strength-text');

    const mfaModal = document.getElementById('mfa-modal');
    const mfaForm = document.getElementById('mfa-form');
    const mfaCodeInput = document.getElementById('mfa-code');
    const mfaCodeError = document.getElementById('mfa-code-error');
    const mfaCancelBtn = document.getElementById('mfa-cancel');
    const mfaSubmitBtn = document.getElementById('mfa-submit');

    const resetModal = document.getElementById('reset-modal');
    const resetForm = document.getElementById('reset-form');
    const resetEmailInput = document.getElementById('reset-email');
    const resetCodeInput = document.getElementById('reset-code');
    const resetPasswordInput = document.getElementById('reset-password');
    const resetPasswordConfirmInput = document.getElementById('reset-password-confirm');
    const resetCodeError = document.getElementById('reset-code-error');
    const resetPasswordError = document.getElementById('reset-password-error');
    const resetPasswordConfirmError = document.getElementById('reset-password-confirm-error');
    const resetCancelBtn = document.getElementById('reset-cancel');
    const resetSubmitBtn = document.getElementById('reset-submit');

    const state = {
        loginChallengeToken: '',
        resetEmail: '',
    };

    const MFA_SESSION_KEY = 'midori.auth.mfa.challenge';
    const MFA_CLOSE_ANIM_MS = 420;
    let mfaCloseAnimTimer = 0;

    function saveMfaChallenge(challengeToken) {
        try {
            window.sessionStorage.setItem(MFA_SESSION_KEY, JSON.stringify({
                challengeToken,
                createdAt: Date.now(),
            }));
        } catch {
        }
    }

    function clearMfaChallenge() {
        try {
            window.sessionStorage.removeItem(MFA_SESSION_KEY);
        } catch {
        }
    }

    function restoreMfaChallengeIfAny() {
        try {
            const raw = window.sessionStorage.getItem(MFA_SESSION_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const challengeToken = String(parsed?.challengeToken || '');
            const createdAt = Number(parsed?.createdAt || 0);
            if (!challengeToken || !createdAt) {
                clearMfaChallenge();
                return;
            }
            if (Date.now() - createdAt > CONFIG.MFA_RESTORE_TTL_MS) {
                clearMfaChallenge();
                return;
            }
            openMfaModal(challengeToken);
        } catch {
            clearMfaChallenge();
        }
    }

    function sanitize(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    function validateEmail(email) {
        const trimmed = email.trim();
        if (!trimmed) return 'Por favor, insira seu email.';
        if (!CONFIG.EMAIL_REGEX.test(trimmed)) return 'Por favor, insira um email válido.';
        return '';
    }

    function validatePassword(password) {
        if (!password) return 'Por favor, insira sua senha.';
        if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
            return `A senha deve ter pelo menos ${CONFIG.MIN_PASSWORD_LENGTH} caracteres.`;
        }
        return '';
    }

    function validateUsername(username) {
        const trimmed = username.trim();
        if (!trimmed) return 'Por favor, insira seu nome de usuário.';
        if (trimmed.length < 3) return 'Nome de usuário deve ter pelo menos 3 caracteres.';
        return '';
    }

    function validatePhone(phone) {
        const trimmed = phone.trim();
        if (!trimmed) return 'Por favor, insira seu número.';
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length < 10 || digits.length > 11) return 'Número inválido.';
        return '';
    }

    function validateCpf(cpf) {
        const trimmed = cpf.trim();
        if (!trimmed) return 'Por favor, insira seu CPF.';

        if (!CONFIG.CPF_REGEX.test(trimmed)) {
            return 'Formato inválido. Use 000.000.000-00.';
        }

        const digits = trimmed.replace(/\D/g, '');
        if (digits.length !== 11) return 'CPF deve ter 11 dígitos.';

        if (!isValidCpfDigits(digits)) {
            return 'CPF inválido.';
        }

        return '';
    }

    function isValidCpfDigits(cpfDigits) {
        if (!cpfDigits || cpfDigits.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(cpfDigits)) return false;

        function calcVerifier(base, factorStart) {
            let total = 0;
            for (let index = 0; index < base.length; index += 1) {
                total += Number(base[index]) * (factorStart - index);
            }
            const mod = total % 11;
            return mod < 2 ? 0 : 11 - mod;
        }

        const baseNine = cpfDigits.slice(0, 9);
        const dig10 = calcVerifier(baseNine, 10);
        const dig11 = calcVerifier(`${baseNine}${dig10}`, 11);

        return cpfDigits.endsWith(`${dig10}${dig11}`);
    }

    function evaluatePasswordStrength(password) {
        if (!password) {
            return { score: 0, label: 'fraca', color: '#9E9E9E', width: '0%' };
        }

        let score = 0;
        if (password.length >= 8) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[a-z]/.test(password)) score += 1;
        if (/\d/.test(password)) score += 1;
        if (/[^A-Za-z0-9]/.test(password)) score += 1;

        if (score <= 2) {
            return { score, label: 'fraca', color: '#D32F2F', width: '33%' };
        }
        if (score <= 4) {
            return { score, label: 'média', color: '#F9A825', width: '66%' };
        }
        return { score, label: 'forte', color: '#2E7D32', width: '100%' };
    }

    function updatePasswordStrengthUI(password) {
        if (!passwordStrength || !passwordStrengthFill || !passwordStrengthText) return;

        if (!password) {
            passwordStrength.hidden = true;
            passwordStrengthFill.style.width = '0%';
            return;
        }

        const result = evaluatePasswordStrength(password);
        passwordStrength.hidden = false;
        passwordStrengthFill.style.width = result.width;
        passwordStrengthFill.style.backgroundColor = result.color;
        passwordStrengthText.textContent = `Força da senha: ${result.label}`;
    }

    function showError(input, errorSpan, message) {
        input.classList.add('input-error');
        errorSpan.textContent = message;
    }

    function clearError(input, errorSpan) {
        input.classList.remove('input-error');
        errorSpan.textContent = '';
    }

    function setLoading(isLoading) {
        btnLogin.disabled = isLoading;
        btnLogin.textContent = isLoading ? 'Entrando...' : 'Entrar';
    }

    function isLockedOut() {
        if (Date.now() < lockoutUntil) {
            const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
            return `Muitas tentativas. Tente novamente em ${remaining}s.`;
        }
        return '';
    }

    function recordFailedAttempt() {
        loginAttempts += 1;
        if (loginAttempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
            lockoutUntil = Date.now() + CONFIG.LOCKOUT_DURATION_MS;
            loginAttempts = 0;
        }
    }

    function hideAllMascots() {
        mascotLogin.classList.add('mascot-hidden');
        mascotRegister.classList.add('mascot-hidden');
        mascotForgot.classList.add('mascot-hidden');
    }

    function showMascot(el) {
        hideAllMascots();
        el.classList.remove('mascot-hidden');
    }

    function switchCard(fromCard, toCard) {
        fromCard.classList.add('fade-out');
        setTimeout(() => {
            fromCard.classList.add('hidden');
            fromCard.classList.remove('fade-out');
            toCard.classList.remove('hidden');
            toCard.classList.add('fade-in');
            toCard.offsetHeight;
            toCard.classList.remove('fade-in');
        }, 150);
    }

    function openMfaModal(challengeToken) {
        if (mfaCloseAnimTimer) {
            window.clearTimeout(mfaCloseAnimTimer);
            mfaCloseAnimTimer = 0;
        }

        state.loginChallengeToken = challengeToken;
        saveMfaChallenge(challengeToken);
        mfaCodeInput.value = '';
        mfaCodeError.textContent = '';
        mfaModal.classList.remove('hidden', 'is-closing');
        mfaModal.classList.add('is-open');
        document.body.classList.add('auth-modal-open', 'auth-modal-scene');
        mfaModal.setAttribute('aria-hidden', 'false');
        mfaCodeInput.focus();
    }

    function closeMfaModal() {
        if (mfaModal.classList.contains('hidden')) return;

        state.loginChallengeToken = '';
        clearMfaChallenge();
        mfaModal.classList.remove('is-open');
        mfaModal.classList.add('is-closing');
        mfaModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('auth-modal-open', 'auth-modal-scene');

        if (mfaCloseAnimTimer) window.clearTimeout(mfaCloseAnimTimer);
        mfaCloseAnimTimer = window.setTimeout(() => {
            mfaModal.classList.add('hidden');
            mfaModal.classList.remove('is-closing');
            mfaCloseAnimTimer = 0;
        }, MFA_CLOSE_ANIM_MS);
    }

    function openResetModal(email) {
        state.resetEmail = email;
        resetEmailInput.value = email;
        resetCodeInput.value = '';
        resetPasswordInput.value = '';
        resetPasswordConfirmInput.value = '';
        resetCodeError.textContent = '';
        resetPasswordError.textContent = '';
        resetPasswordConfirmError.textContent = '';
        resetModal.classList.remove('hidden');
        resetModal.style.display = 'flex';
        resetModal.setAttribute('aria-hidden', 'false');
        resetCodeInput.focus();
    }

    function closeResetModal() {
        resetModal.classList.add('hidden');
        resetModal.style.display = 'none';
        resetModal.setAttribute('aria-hidden', 'true');
    }

    function ensureForgotCardVisible() {
        loginCard.classList.add('hidden');
        registerCard.classList.add('hidden');
        forgotCard.classList.remove('hidden');
        forgotCard.classList.remove('fade-out');
        showMascot(mascotForgot);
    }

    async function handleLoginSubmit() {
        if (isLoginSubmitting) return;

        const lockoutMsg = isLockedOut();
        if (lockoutMsg) {
            showError(emailInput, emailError, lockoutMsg);
            return;
        }

        clearError(emailInput, emailError);
        clearError(passwordInput, passwordError);

        const loginValue = sanitize(emailInput.value).trim();
        const password = passwordInput.value;

        const emailErr = validateEmail(loginValue);
        const passwordErr = validatePassword(password);

        let hasError = false;
        if (emailErr) {
            showError(emailInput, emailError, emailErr);
            hasError = true;
        }
        if (passwordErr) {
            showError(passwordInput, passwordError, passwordErr);
            hasError = true;
        }
        if (hasError) return;

        isLoginSubmitting = true;
        setLoading(true);

        try {
            const response = await api.startLogin(loginValue, password);
            if (response?.requiresMfa === false && response?.user) {
                api.setSession(null, response.user);
                window.location.href = 'home.html';
                return;
            }

            if (!response?.requiresMfa || !response.challengeToken) {
                throw new Error('Falha ao iniciar verificação de segurança.');
            }
            openMfaModal(response.challengeToken);
        } catch (error) {
            recordFailedAttempt();
            showError(emailInput, emailError, error.message || 'Email ou senha incorretos.');
        } finally {
            setLoading(false);
            isLoginSubmitting = false;
        }
    }

    emailInput.addEventListener('blur', function () {
        const err = validateEmail(this.value);
        if (err) showError(this, emailError, err);
        else clearError(this, emailError);
    });

    emailInput.addEventListener('input', function () {
        if (!this.classList.contains('input-error')) return;
        const err = validateEmail(this.value);
        if (!err) clearError(this, emailError);
    });

    passwordInput.addEventListener('blur', function () {
        const err = validatePassword(this.value);
        if (err) showError(this, passwordError, err);
        else clearError(this, passwordError);
    });

    passwordInput.addEventListener('input', function () {
        if (!this.classList.contains('input-error')) return;
        const err = validatePassword(this.value);
        if (!err) clearError(this, passwordError);
    });

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        handleLoginSubmit();
    });

    btnLogin.addEventListener('click', function () {
        handleLoginSubmit();
    });

    restoreMfaChallengeIfAny();

    emailInput.addEventListener('paste', function () {
        setTimeout(() => {
            this.value = sanitize(this.value);
        }, 0);
    });

    signupLink.addEventListener('click', function (e) {
        e.preventDefault();
        switchCard(loginCard, registerCard);
        showMascot(mascotRegister);
    });

    loginLink.addEventListener('click', function (e) {
        e.preventDefault();
        switchCard(registerCard, loginCard);
        showMascot(mascotLogin);
    });

    forgotLink.addEventListener('click', function (e) {
        e.preventDefault();
        switchCard(loginCard, forgotCard);
        showMascot(mascotForgot);
    });

    backLoginLink.addEventListener('click', function (e) {
        e.preventDefault();
        switchCard(forgotCard, loginCard);
        showMascot(mascotLogin);
    });

    async function handleForgotPasswordRequest() {
        const errorSpan = document.getElementById('forgot-email-error');
        const email = sanitize(forgotEmailInput.value);
        const emailErr = validateEmail(email);

        if (emailErr) {
            showError(forgotEmailInput, errorSpan, emailErr);
            return;
        }

        clearError(forgotEmailInput, errorSpan);
        btnForgot.disabled = true;
        btnForgot.textContent = 'Enviando...';

        try {
            await api.requestPasswordReset(email.trim().toLowerCase());
            ensureForgotCardVisible();
            clearError(forgotEmailInput, errorSpan);
            errorSpan.textContent = 'Se o email existir, enviamos um link de recuperação.';
            btnForgot.textContent = 'Link enviado';
        } catch (error) {
            showError(forgotEmailInput, errorSpan, error.message || 'Erro ao enviar link.');
            btnForgot.textContent = 'Enviar Link';
        } finally {
            btnForgot.disabled = false;
        }
    }

    forgotForm.addEventListener('submit', function (e) {
        e.preventDefault();
        handleForgotPasswordRequest();
    });

    btnForgot.addEventListener('click', function () {
        handleForgotPasswordRequest();
    });

    forgotEmailInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            handleForgotPasswordRequest();
        }
    });

    mfaCancelBtn.addEventListener('click', closeMfaModal);

    mfaForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const cleanCode = String(mfaCodeInput.value || '').trim();
        if (!/^\d{6}$/.test(cleanCode)) {
            mfaCodeError.textContent = 'Informe um código válido de 6 dígitos.';
            return;
        }

        mfaCodeError.textContent = '';
        mfaSubmitBtn.disabled = true;
        mfaSubmitBtn.textContent = 'Validando...';

        try {
            await api.verifyLoginCode(state.loginChallengeToken, cleanCode);
            clearMfaChallenge();
            window.location.href = 'home.html';
        } catch (error) {
            mfaCodeError.textContent = error.message || 'Código inválido ou expirado.';
        } finally {
            mfaSubmitBtn.disabled = false;
            mfaSubmitBtn.textContent = 'Confirmar';
        }
    });

    resetCancelBtn.addEventListener('click', closeResetModal);

    resetForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const code = String(resetCodeInput.value || '').trim();
        const newPassword = resetPasswordInput.value || '';
        const confirmPassword = resetPasswordConfirmInput.value || '';

        resetCodeError.textContent = '';
        resetPasswordError.textContent = '';
        resetPasswordConfirmError.textContent = '';

        let hasError = false;

        if (!/^\d{6}$/.test(code)) {
            resetCodeError.textContent = 'Código inválido.';
            hasError = true;
        }

        const passwordMsg = validatePassword(newPassword);
        if (passwordMsg) {
            resetPasswordError.textContent = passwordMsg;
            hasError = true;
        }

        if (newPassword !== confirmPassword) {
            resetPasswordConfirmError.textContent = 'As senhas não conferem.';
            hasError = true;
        }

        if (hasError) return;

        resetSubmitBtn.disabled = true;
        resetSubmitBtn.textContent = 'Redefinindo...';

        try {
            await api.resetPassword({
                email: state.resetEmail,
                code,
                newPassword,
            });

            closeResetModal();
            switchCard(forgotCard, loginCard);
            showMascot(mascotLogin);
        } catch (error) {
            resetCodeError.textContent = error.message || 'Erro ao redefinir senha.';
        } finally {
            resetSubmitBtn.disabled = false;
            resetSubmitBtn.textContent = 'Redefinir senha';
        }
    });

    regCpfInput.addEventListener('input', function () {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 11) value = value.slice(0, 11);
        if (value.length > 9) value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (value.length > 6) value = value.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (value.length > 3) value = value.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        this.value = value;
    });

    regPhoneInput.addEventListener('input', function () {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 13) value = value.slice(0, 13);
        if (value.length > 11) value = value.replace(/(\d{2})(\d{2})(\d{5})(\d{0,4})/, '+$1 ($2) $3-$4');
        else if (value.length > 6) value = value.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
        else if (value.length > 2) value = value.replace(/(\d{2})(\d{0,5})/, '($1) $2');
        this.value = value;
    });

    regPasswordInput.addEventListener('input', function () {
        updatePasswordStrengthUI(this.value || '');
    });

    registerForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const fields = [
            { input: regEmailInput, errorId: 'reg-email-error', validate: validateEmail },
            { input: regUsernameInput, errorId: 'reg-username-error', validate: validateUsername },
            { input: regPhoneInput, errorId: 'reg-phone-error', validate: validatePhone },
            { input: regCpfInput, errorId: 'reg-cpf-error', validate: validateCpf },
            { input: regPasswordInput, errorId: 'reg-password-error', validate: validatePassword },
        ];

        let hasError = false;
        fields.forEach(({ input, errorId, validate }) => {
            const errorSpan = document.getElementById(errorId);
            const msg = validate(sanitize(input.value));
            if (msg) {
                showError(input, errorSpan, msg);
                hasError = true;
            } else {
                clearError(input, errorSpan);
            }
        });

        if (hasError) return;

        const btnRegister = document.getElementById('btn-register');
        btnRegister.disabled = true;
        btnRegister.textContent = 'Cadastrando...';

        try {
            await api.register({
                email: regEmailInput.value.trim(),
                username: regUsernameInput.value.trim().toLowerCase(),
                displayName: regUsernameInput.value.trim(),
                phone: regPhoneInput.value.trim(),
                cpf: regCpfInput.value.trim(),
                password: regPasswordInput.value,
            });

            window.location.href = 'home.html';
        } catch (error) {
            const errorSpan = document.getElementById('reg-email-error');
            showError(regEmailInput, errorSpan, error.message || 'Erro de conexão. Tente novamente.');
        } finally {
            btnRegister.disabled = false;
            btnRegister.textContent = 'Cadastrar';
        }
    });
})();
