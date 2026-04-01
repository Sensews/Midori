(function () {
    'use strict';

    const api = window.MidoriApi;

    const CONFIG = {
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION_MS: 30000,
        MIN_PASSWORD_LENGTH: 8,
        EMAIL_REGEX: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        CPF_REGEX: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
    };

    let loginAttempts = 0;
    let lockoutUntil = 0;

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

    async function handleSubmit(e) {
        e.preventDefault();

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

        setLoading(true);

        try {
            await api.login(loginValue, password);
            window.location.href = 'home.html';
        } catch (error) {
            recordFailedAttempt();
            showError(emailInput, emailError, error.message || 'Email ou senha incorretos.');
        } finally {
            setLoading(false);
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

    form.addEventListener('submit', handleSubmit);

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

    forgotForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        const errorSpan = document.getElementById('forgot-email-error');
        const email = sanitize(forgotEmailInput.value);
        const emailErr = validateEmail(email);

        if (emailErr) {
            showError(forgotEmailInput, errorSpan, emailErr);
            return;
        }

        clearError(forgotEmailInput, errorSpan);

        const btnForgot = document.getElementById('btn-forgot');
        btnForgot.disabled = true;
        btnForgot.textContent = 'Enviando...';

        setTimeout(() => {
            btnForgot.textContent = 'Link Enviado!';
            btnForgot.style.backgroundColor = 'var(--green-light)';
            btnForgot.style.color = 'var(--green-dark)';
            setTimeout(() => {
                btnForgot.disabled = false;
                btnForgot.textContent = 'Enviar Link';
                btnForgot.style.backgroundColor = '';
                btnForgot.style.color = '';
            }, 2800);
        }, 900);
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
