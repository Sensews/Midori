(function () {
    'use strict';

    const api = window.MidoriApi;

    const CONTACT_MODAL_ID = 'contact-modal';
    const CONTACT_OPEN_ID = 'contact-open';
    const CONTACT_CLOSE_ID = 'contact-close';
    const CONTACT_FORM_ID = 'contact-form';
    const CONTACT_CLOSE_ANIM_MS = 420;

    let closeAnimTimer = 0;

    function createEl(tag, attrs, html) {
        const el = document.createElement(tag);
        if (attrs) {
            Object.entries(attrs).forEach(([k, v]) => {
                if (k === 'className') el.className = v;
                else if (k === 'textContent') el.textContent = v;
                else el.setAttribute(k, v);
            });
        }
        if (typeof html === 'string') el.innerHTML = html;
        return el;
    }

    function ensureUi() {
        if (document.getElementById(CONTACT_MODAL_ID)) return;

        // Button (fixed, non-invasive)
        const btn = createEl('button', {
            id: CONTACT_OPEN_ID,
            type: 'button',
            className: 'contact-fab',
            'aria-haspopup': 'dialog',
            'aria-controls': CONTACT_MODAL_ID,
        });
        btn.textContent = 'Fale conosco';

        // Modal
        const modal = createEl('div', {
            id: CONTACT_MODAL_ID,
            className: 'auth-modal hidden',
            'aria-hidden': 'true',
        }, `
            <div class="auth-modal__motion">
                <div class="auth-modal__card contact-modal__card" role="dialog" aria-modal="true" aria-labelledby="contact-title">
                    <h2 id="contact-title">Fale conosco</h2>
                    <p>Quer saber sobre matrículas, Unidades Educacionais e outros assuntos? Entre em contato através do formulário abaixo.</p>

                    <form id="${CONTACT_FORM_ID}" novalidate>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="contact-fullname">Nome completo*</label>
                                <input id="contact-fullname" name="fullName" type="text" placeholder="Seu nome" required maxlength="120">
                                <span class="error-message" data-error-for="fullName"></span>
                            </div>
                            <div class="form-group">
                                <label for="contact-subject">Assunto*</label>
                                <input id="contact-subject" name="subject" type="text" placeholder="Assunto" required maxlength="140">
                                <span class="error-message" data-error-for="subject"></span>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="contact-email">E-mail*</label>
                            <input id="contact-email" name="email" type="email" placeholder="seuemail@exemplo.com" required maxlength="200">
                            <span class="error-message" data-error-for="email"></span>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="contact-phone">Telefone para contato</label>
                                <input id="contact-phone" name="phone" type="tel" placeholder="(00) 00000-0000" maxlength="40">
                                <span class="error-message" data-error-for="phone"></span>
                            </div>
                            <div class="form-group">
                                <label for="contact-destination">Contato de destino</label>
                                <select id="contact-destination" name="destination">
                                    <option value="">Selecione o contato</option>
                                    <option value="Suporte">Suporte</option>
                                    <option value="Financeiro">Financeiro</option>
                                    <option value="Ouvidoria">Ouvidoria</option>
                                </select>
                                <span class="error-message" data-error-for="destination"></span>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group">
                                <label for="contact-uf">UF</label>
                                <select id="contact-uf" name="uf">
                                    <option value="">Selecionar</option>
                                    <option value="AC">AC</option><option value="AL">AL</option><option value="AP">AP</option><option value="AM">AM</option><option value="BA">BA</option><option value="CE">CE</option><option value="DF">DF</option><option value="ES">ES</option><option value="GO">GO</option><option value="MA">MA</option><option value="MT">MT</option><option value="MS">MS</option><option value="MG">MG</option><option value="PA">PA</option><option value="PB">PB</option><option value="PR">PR</option><option value="PE">PE</option><option value="PI">PI</option><option value="RJ">RJ</option><option value="RN">RN</option><option value="RS">RS</option><option value="RO">RO</option><option value="RR">RR</option><option value="SC">SC</option><option value="SP">SP</option><option value="SE">SE</option><option value="TO">TO</option>
                                </select>
                                <span class="error-message" data-error-for="uf"></span>
                            </div>
                            <div class="form-group">
                                <label for="contact-city">Cidade</label>
                                <input id="contact-city" name="city" type="text" placeholder="Cidade" maxlength="80">
                                <span class="error-message" data-error-for="city"></span>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="contact-message">Mensagem*</label>
                            <textarea id="contact-message" name="message" rows="5" placeholder="Digite sua mensagem..." required maxlength="4000"></textarea>
                            <span class="error-message" data-error-for="message"></span>
                        </div>

                        <label class="contact-privacy">
                            <input id="contact-privacy" name="acceptPrivacy" type="checkbox" required>
                            <span>Ao informar meus dados, declaro ter lido a <a href="#" class="form-link">Política de Privacidade</a>.</span>
                        </label>
                        <span class="error-message" data-error-for="acceptPrivacy"></span>

                        <div class="auth-modal__actions">
                            <button type="button" class="btn-ghost" id="${CONTACT_CLOSE_ID}">Fechar</button>
                            <button type="submit" class="btn-login" id="contact-submit">Enviar</button>
                        </div>

                        <p class="contact-status" id="contact-status" aria-live="polite"></p>
                    </form>
                </div>
            </div>
        `);

        document.body.appendChild(btn);
        document.body.appendChild(modal);
    }

    function getModal() {
        return document.getElementById(CONTACT_MODAL_ID);
    }

    function setBodyModalState(isOpen) {
        if (isOpen) {
            document.body.classList.add('auth-modal-open', 'auth-modal-scene');
        } else {
            document.body.classList.remove('auth-modal-open', 'auth-modal-scene');
        }
    }

    function openModal() {
        const modal = getModal();
        if (!modal) return;

        if (closeAnimTimer) {
            window.clearTimeout(closeAnimTimer);
            closeAnimTimer = 0;
        }

        modal.classList.remove('hidden', 'is-closing');
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        setBodyModalState(true);

        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) firstInput.focus();
    }

    function closeModal() {
        const modal = getModal();
        if (!modal || modal.classList.contains('hidden')) return;

        modal.classList.remove('is-open');
        modal.classList.add('is-closing');
        modal.setAttribute('aria-hidden', 'true');
        setBodyModalState(false);

        if (closeAnimTimer) window.clearTimeout(closeAnimTimer);
        closeAnimTimer = window.setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('is-closing');
            closeAnimTimer = 0;
        }, CONTACT_CLOSE_ANIM_MS);
    }

    function setFieldError(modal, field, message) {
        const el = modal.querySelector(`[data-error-for="${field}"]`);
        if (el) el.textContent = message || '';
    }

    function clearErrors(modal) {
        modal.querySelectorAll('.error-message').forEach((el) => {
            el.textContent = '';
        });
    }

    function validateEmail(value) {
        const v = String(value || '').trim();
        if (!v) return false;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    function setSubmitting(modal, isSubmitting) {
        const submit = modal.querySelector('#contact-submit');
        const status = modal.querySelector('#contact-status');
        if (submit) submit.disabled = isSubmitting;
        if (status && isSubmitting) status.textContent = 'Enviando...';
    }

    async function handleSubmit(event) {
        event.preventDefault();

        const modal = getModal();
        if (!modal) return;
        clearErrors(modal);

        if (!api || typeof api.sendContactMessage !== 'function') {
            setFieldError(modal, 'message', 'API indisponível para envio.');
            return;
        }

        const form = modal.querySelector(`#${CONTACT_FORM_ID}`);
        const status = modal.querySelector('#contact-status');

        const data = Object.fromEntries(new FormData(form).entries());
        const payload = {
            fullName: String(data.fullName || '').trim(),
            subject: String(data.subject || '').trim(),
            email: String(data.email || '').trim(),
            phone: String(data.phone || '').trim(),
            destination: String(data.destination || '').trim(),
            uf: String(data.uf || '').trim(),
            city: String(data.city || '').trim(),
            message: String(data.message || '').trim(),
            acceptPrivacy: Boolean(modal.querySelector('#contact-privacy')?.checked),
        };

        let hasError = false;
        if (!payload.fullName) {
            setFieldError(modal, 'fullName', 'Informe seu nome.');
            hasError = true;
        }
        if (!payload.subject) {
            setFieldError(modal, 'subject', 'Informe o assunto.');
            hasError = true;
        }
        if (!validateEmail(payload.email)) {
            setFieldError(modal, 'email', 'Informe um e-mail válido.');
            hasError = true;
        }
        if (!payload.message) {
            setFieldError(modal, 'message', 'Digite sua mensagem.');
            hasError = true;
        }
        if (!payload.acceptPrivacy) {
            setFieldError(modal, 'acceptPrivacy', 'Aceite a Política de Privacidade.');
            hasError = true;
        }

        if (hasError) {
            if (status) status.textContent = '';
            return;
        }

        try {
            setSubmitting(modal, true);
            await api.sendContactMessage(payload);
            if (status) status.textContent = 'Mensagem enviada com sucesso.';
            form.reset();
        } catch (err) {
            if (status) status.textContent = (err && err.message) ? err.message : 'Não foi possível enviar agora.';
        } finally {
            setSubmitting(modal, false);
        }
    }

    function wireEvents() {
        const openBtn = document.getElementById(CONTACT_OPEN_ID);
        const modal = getModal();
        if (!openBtn || !modal) return;

        openBtn.addEventListener('click', openModal);

        modal.addEventListener('click', (event) => {
            const closeBtn = event.target.closest(`#${CONTACT_CLOSE_ID}`);
            if (closeBtn) {
                closeModal();
                return;
            }
            if (event.target === modal) {
                closeModal();
            }
        }, true);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeModal();
        }, true);

        const form = modal.querySelector(`#${CONTACT_FORM_ID}`);
        if (form) form.addEventListener('submit', handleSubmit);
    }

    function init() {
        ensureUi();
        wireEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
