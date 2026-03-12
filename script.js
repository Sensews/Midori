/**
 * Midori - Login Page Security & Validation
 * 
 * Segurança implementada:
 * - Sanitização de inputs (previne XSS)
 * - Rate limiting no lado do cliente
 * - Validação de email e senha
 * - CSRF token placeholder
 * - Proteção contra brute force (delays progressivos)
 */

(function () {
    'use strict';

    // ========== CONFIGURAÇÕES ==========
    const CONFIG = {
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION_MS: 30000,  // 30 segundos
        MIN_PASSWORD_LENGTH: 8,
        EMAIL_REGEX: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    };

    // ========== ESTADO ==========
    let loginAttempts = 0;
    let lockoutUntil = 0;

    // ========== ELEMENTOS DOM ==========
    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('email-error');
    const passwordError = document.getElementById('password-error');
    const btnLogin = document.getElementById('btn-login');

    // ========== SANITIZAÇÃO ==========
    function sanitize(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // ========== VALIDAÇÃO ==========
    function validateEmail(email) {
        const trimmed = email.trim();
        if (!trimmed) {
            return 'Por favor, insira seu email.';
        }
        if (!CONFIG.EMAIL_REGEX.test(trimmed)) {
            return 'Por favor, insira um email válido.';
        }
        return '';
    }

    function validatePassword(password) {
        if (!password) {
            return 'Por favor, insira sua senha.';
        }
        if (password.length < CONFIG.MIN_PASSWORD_LENGTH) {
            return `A senha deve ter pelo menos ${CONFIG.MIN_PASSWORD_LENGTH} caracteres.`;
        }
        return '';
    }

    // ========== UI HELPERS ==========
    function showError(input, errorSpan, message) {
        input.classList.add('input-error');
        errorSpan.textContent = message;
    }

    function clearError(input, errorSpan) {
        input.classList.remove('input-error');
        errorSpan.textContent = '';
    }

    function setLoading(isLoading) {
        if (isLoading) {
            btnLogin.disabled = true;
            btnLogin.textContent = 'Entrando...';
        } else {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Entrar';
        }
    }

    // ========== RATE LIMITING ==========
    function isLockedOut() {
        if (Date.now() < lockoutUntil) {
            const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
            return `Muitas tentativas. Tente novamente em ${remaining}s.`;
        }
        return '';
    }

    function recordFailedAttempt() {
        loginAttempts++;
        if (loginAttempts >= CONFIG.MAX_LOGIN_ATTEMPTS) {
            lockoutUntil = Date.now() + CONFIG.LOCKOUT_DURATION_MS;
            loginAttempts = 0;
        }
    }

    // ========== SUBMIT HANDLER ==========
    async function handleSubmit(e) {
        e.preventDefault();

        // Verificar lockout
        const lockoutMsg = isLockedOut();
        if (lockoutMsg) {
            showError(emailInput, emailError, lockoutMsg);
            return;
        }

        // Limpar erros
        clearError(emailInput, emailError);
        clearError(passwordInput, passwordError);

        // Validar campos
        const email = sanitize(emailInput.value);
        const password = passwordInput.value;

        const emailErr = validateEmail(email);
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

        // Enviar formulário
        setLoading(true);

        try {
            // Simular envio ao servidor (substituir pela API real)
            // Em produção, enviar via HTTPS com CSRF token
            const response = await simulateLogin(email, password);

            if (response.success) {
                // Redirecionar ao dashboard
                window.location.href = response.redirectUrl || '/dashboard';
            } else {
                recordFailedAttempt();
                showError(emailInput, emailError, response.message || 'Email ou senha incorretos.');
            }
        } catch (error) {
            showError(emailInput, emailError, 'Erro de conexão. Tente novamente.');
        } finally {
            setLoading(false);
        }
    }

    // ========== SIMULAÇÃO DE LOGIN ==========
    // Substituir por chamada real à API
    function simulateLogin(email, password) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Aqui você conecta com seu backend real
                // Exemplo: fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({email, password}), headers: {'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken()} })
                resolve({
                    success: false,
                    message: 'Email ou senha incorretos.'
                });
            }, 1200);
        });
    }

    // ========== CSRF TOKEN (placeholder) ==========
    function getCsrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    // ========== VALIDAÇÃO EM TEMPO REAL ==========
    emailInput.addEventListener('blur', function () {
        const err = validateEmail(this.value);
        if (err) {
            showError(this, emailError, err);
        } else {
            clearError(this, emailError);
        }
    });

    emailInput.addEventListener('input', function () {
        if (this.classList.contains('input-error')) {
            const err = validateEmail(this.value);
            if (!err) clearError(this, emailError);
        }
    });

    passwordInput.addEventListener('blur', function () {
        const err = validatePassword(this.value);
        if (err) {
            showError(this, passwordError, err);
        } else {
            clearError(this, passwordError);
        }
    });

    passwordInput.addEventListener('input', function () {
        if (this.classList.contains('input-error')) {
            const err = validatePassword(this.value);
            if (!err) clearError(this, passwordError);
        }
    });

    // ========== EVENT LISTENERS ==========
    form.addEventListener('submit', handleSubmit);

    // Prevenir paste de scripts maliciosos
    emailInput.addEventListener('paste', function (e) {
        setTimeout(() => {
            this.value = sanitize(this.value);
        }, 0);
    });

    // ========== CARD SWITCHING ==========
    const loginCard = document.getElementById('login-card');
    const registerCard = document.getElementById('register-card');
    const signupLink = document.getElementById('signup-link');
    const loginLink = document.getElementById('login-link');
    const mascotLogin = document.getElementById('mascot-login');
    const mascotRegister = document.getElementById('mascot-register');

    function switchMascot(showEl, hideEl) {
        hideEl.classList.add('mascot-hidden');
        showEl.classList.remove('mascot-hidden');
    }

    function switchCard(fromCard, toCard) {
        fromCard.classList.add('fade-out');
        setTimeout(() => {
            fromCard.classList.add('hidden');
            fromCard.classList.remove('fade-out');
            toCard.classList.remove('hidden');
            toCard.classList.add('fade-in');
            // Trigger reflow para a animação funcionar
            toCard.offsetHeight;
            toCard.classList.remove('fade-in');
        }, 150);
    }

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

    // ========== ESQUECI A SENHA ==========
    const forgotCard = document.getElementById('forgot-card');
    const forgotLink = document.getElementById('forgot-link');
    const backLoginLink = document.getElementById('back-login-link');
    const forgotForm = document.getElementById('forgot-form');
    const forgotEmailInput = document.getElementById('forgot-email');
    const mascotForgot = document.getElementById('mascot-forgot');

    function hideAllMascots() {
        mascotLogin.classList.add('mascot-hidden');
        mascotRegister.classList.add('mascot-hidden');
        mascotForgot.classList.add('mascot-hidden');
    }

    function showMascot(el) {
        hideAllMascots();
        el.classList.remove('mascot-hidden');
    }

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

        try {
            // Substituir pela chamada real à API
            await new Promise(resolve => setTimeout(resolve, 1200));
            btnForgot.textContent = 'Link Enviado!';
            btnForgot.style.backgroundColor = 'var(--green-light)';
            btnForgot.style.color = 'var(--green-dark)';
            setTimeout(() => {
                btnForgot.disabled = false;
                btnForgot.textContent = 'Enviar Link';
                btnForgot.style.backgroundColor = '';
                btnForgot.style.color = '';
            }, 3000);
        } catch (err) {
            showError(forgotEmailInput, errorSpan, 'Erro de conexão. Tente novamente.');
            btnForgot.disabled = false;
            btnForgot.textContent = 'Enviar Link';
        }
    });

    // ========== REGISTRO - VALIDAÇÃO & SUBMIT ==========
    const registerForm = document.getElementById('register-form');
    const regEmailInput = document.getElementById('reg-email');
    const regUsernameInput = document.getElementById('reg-username');
    const regPhoneInput = document.getElementById('reg-phone');
    const regCpfInput = document.getElementById('reg-cpf');
    const regPasswordInput = document.getElementById('reg-password');

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
        const digits = trimmed.replace(/\D/g, '');
        if (digits.length !== 11) return 'CPF deve ter 11 dígitos.';
        return '';
    }

    // Máscara de CPF
    regCpfInput.addEventListener('input', function () {
        let v = this.value.replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        this.value = v;
    });

    // Máscara de telefone
    regPhoneInput.addEventListener('input', function () {
        let v = this.value.replace(/\D/g, '');
        if (v.length > 11) v = v.slice(0, 11);
        if (v.length > 6) v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
        else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
        this.value = v;
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
            // Substituir pela chamada real à API de registro
            await new Promise(resolve => setTimeout(resolve, 1200));
            // Em produção: fetch('/api/auth/register', ...)
            alert('Cadastro simulado com sucesso! Conecte ao seu backend.');
        } catch (err) {
            const errorSpan = document.getElementById('reg-email-error');
            showError(regEmailInput, errorSpan, 'Erro de conexão. Tente novamente.');
        } finally {
            btnRegister.disabled = false;
            btnRegister.textContent = 'Cadastrar';
        }
    });

})();
