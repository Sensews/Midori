(function () {
  'use strict';

  const api = window.MidoriApi;
  const form = document.getElementById('reset-link-form');
  const submitBtn = document.getElementById('reset-submit');
  const messageEl = document.getElementById('reset-message');
  const newPasswordInput = document.getElementById('new-password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

  const token = new URLSearchParams(window.location.search).get('token') || '';

  function setMessage(message, isSuccess) {
    messageEl.textContent = message;
    messageEl.classList.toggle('ok', Boolean(isSuccess));
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const newPassword = String(newPasswordInput.value || '');
    const confirmPassword = String(confirmPasswordInput.value || '');

    setMessage('', false);

    if (!token) {
      setMessage('Link inválido. Solicite um novo email de recuperação.', false);
      return;
    }

    if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
      setMessage('Use no mínimo 8 caracteres com maiúscula, minúscula, número e símbolo.', false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('As senhas não conferem.', false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';

    try {
      await api.resetPasswordWithToken({ token, newPassword });
      setMessage('Senha redefinida com sucesso. Redirecionando para login...', true);
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1400);
    } catch (error) {
      setMessage(error.message || 'Não foi possível redefinir a senha.', false);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Salvar nova senha';
    }
  });
})();
