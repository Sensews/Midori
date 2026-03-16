(function () {
    'use strict';

    const STORAGE_KEY = 'midori.profile.v1';
    const DEFAULT_AVATAR_SRC = 'Assets/Mido.svg';
    const LIMITS = {
        name: 30,
        bio: 140,
        favorite: 20,
    };

    function showSoon(featureName) {
        window.alert(`${featureName}: em breve.`);
    }

    function safeTrim(value) {
        return (value || '').toString().trim();
    }

    function clampLen(value, max) {
        const str = safeTrim(value);
        return str.length > max ? str.slice(0, max) : str;
    }

    function loadProfile() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function saveProfile(profile) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    }

    function applyProfileToUI(profile) {
        if (!profile) return;

        const nameEl = document.getElementById('profile-name');
        const bioEl = document.getElementById('profile-bio');
        const favoriteEl = document.getElementById('profile-favorite');
        const locationEl = document.getElementById('profile-location');
        const avatarEl = document.getElementById('profile-avatar-img');
        const avatarWrap = document.getElementById('profile-avatar');

        if (nameEl && profile.name) nameEl.textContent = profile.name;
        if (bioEl && profile.bio !== undefined) bioEl.textContent = profile.bio;
        if (favoriteEl && profile.favorite !== undefined) favoriteEl.textContent = profile.favorite;
        if (locationEl && profile.location !== undefined) locationEl.textContent = profile.location;
        const nextAvatarSrc = profile.avatarSrc || DEFAULT_AVATAR_SRC;
        if (avatarEl) avatarEl.src = nextAvatarSrc;

        if (avatarWrap) {
            const isDefault = nextAvatarSrc === DEFAULT_AVATAR_SRC;
            avatarWrap.classList.toggle('avatar--default', isDefault);
        }
    }

    // ========= Modal Configurações =========
    const btnSettings = document.getElementById('btn-settings');
    const overlay = document.getElementById('settings-overlay');
    const modalEl = overlay ? overlay.querySelector('.modal-motion') : null;
    const btnClose = document.getElementById('settings-close');
    const btnCancel = document.getElementById('settings-cancel');
    const form = document.getElementById('settings-form');
    const inputName = document.getElementById('settings-name');
    const inputLocation = document.getElementById('settings-location');
    const inputFavorite = document.getElementById('settings-favorite');
    const inputBio = document.getElementById('settings-bio');
    const countName = document.getElementById('settings-name-count');
    const countFavorite = document.getElementById('settings-favorite-count');
    const countBio = document.getElementById('settings-bio-count');
    const inputPhoto = document.getElementById('settings-photo');
    const btnRemovePhoto = document.getElementById('settings-remove-photo');
    const photoPreview = document.getElementById('settings-photo-preview');
    const btnDelete = document.getElementById('settings-delete');

    const MODAL_ANIM_MS = 480;
    let closeAnimTimer = 0;

    let draftAvatarSrc = DEFAULT_AVATAR_SRC;

    function setCounter(el, value, max) {
        if (!el) return;
        const len = (value || '').length;
        el.textContent = `${len}/${max}`;
    }

    function openModal() {
        if (!overlay) return;
        if (closeAnimTimer) {
            window.clearTimeout(closeAnimTimer);
            closeAnimTimer = 0;
        }
        overlay.classList.remove('is-closing');
        const current = loadProfile() || {
            name: document.getElementById('profile-name')?.textContent || '',
            bio: document.getElementById('profile-bio')?.textContent || '',
            favorite: document.getElementById('profile-favorite')?.textContent || '',
            avatarSrc: document.getElementById('profile-avatar-img')?.getAttribute('src') || DEFAULT_AVATAR_SRC,
        };

        draftAvatarSrc = current.avatarSrc || DEFAULT_AVATAR_SRC;
        if (photoPreview) photoPreview.src = draftAvatarSrc;

        if (inputName) inputName.value = clampLen(current.name, LIMITS.name);
        if (inputBio) inputBio.value = clampLen(current.bio, LIMITS.bio);
        if (inputFavorite) inputFavorite.value = clampLen(current.favorite, LIMITS.favorite);
        if (inputLocation) inputLocation.value = clampLen(current.location || '', 60);

        setCounter(countName, inputName?.value || '', LIMITS.name);
        setCounter(countBio, inputBio?.value || '', LIMITS.bio);
        setCounter(countFavorite, inputFavorite?.value || '', LIMITS.favorite);

        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        document.body.classList.add('modal-open');
        document.body.classList.add('modal-scene');
        overlay.classList.remove('is-open');

        requestAnimationFrame(() => overlay.classList.add('is-open'));

        // foco inicial
        setTimeout(() => inputName?.focus(), 0);
    }

    function closeModal() {
        if (!overlay) return;
        document.body.classList.remove('modal-scene');
        overlay.classList.add('is-closing');
        overlay.classList.remove('is-open');

        if (closeAnimTimer) window.clearTimeout(closeAnimTimer);
        closeAnimTimer = window.setTimeout(() => {
            overlay.hidden = true;
            document.body.style.overflow = '';
            document.body.classList.remove('modal-open');
            overlay.classList.remove('is-closing');
            closeAnimTimer = 0;
        }, MODAL_ANIM_MS);
        if (inputPhoto) inputPhoto.value = '';
    }

    if (btnSettings) {
        btnSettings.addEventListener('click', openModal);
    }
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    if (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal();
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay && !overlay.hidden) closeModal();
    });

    if (inputName) {
        inputName.addEventListener('input', function () {
            if (this.value.length > LIMITS.name) this.value = this.value.slice(0, LIMITS.name);
            setCounter(countName, this.value, LIMITS.name);
        });
    }

    if (inputFavorite) {
        inputFavorite.addEventListener('input', function () {
            if (this.value.length > LIMITS.favorite) this.value = this.value.slice(0, LIMITS.favorite);
            setCounter(countFavorite, this.value, LIMITS.favorite);
        });
    }

    // Localização agora é texto livre (sem API)

    if (inputBio) {
        inputBio.addEventListener('input', function () {
            if (this.value.length > LIMITS.bio) this.value = this.value.slice(0, LIMITS.bio);
            setCounter(countBio, this.value, LIMITS.bio);
        });
    }

    if (inputPhoto) {
        inputPhoto.addEventListener('change', function () {
            const file = this.files && this.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                window.alert('Selecione uma imagem válida.');
                this.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function () {
                draftAvatarSrc = typeof reader.result === 'string' ? reader.result : DEFAULT_AVATAR_SRC;
                if (photoPreview) photoPreview.src = draftAvatarSrc;
            };
            reader.readAsDataURL(file);
        });
    }

    if (btnRemovePhoto) {
        btnRemovePhoto.addEventListener('click', function () {
            draftAvatarSrc = DEFAULT_AVATAR_SRC;
            if (photoPreview) photoPreview.src = draftAvatarSrc;
            if (inputPhoto) inputPhoto.value = '';
        });
    }

    if (btnDelete) {
        btnDelete.addEventListener('click', function () {
            const ok = window.confirm('Tem certeza que deseja deletar sua conta?');
            if (!ok) return;

            window.localStorage.removeItem(STORAGE_KEY);
            window.alert('Conta deletada (simulação).');
            window.location.href = 'index.html';
        });
    }

    if (form) {
        form.addEventListener('submit', function (e) {
            e.preventDefault();

            const name = clampLen(inputName?.value || '', LIMITS.name);
            const favorite = clampLen(inputFavorite?.value || '', LIMITS.favorite);
            const bio = clampLen(inputBio?.value || '', LIMITS.bio);
            const location = clampLen(inputLocation?.value || '', 60);

            if (!name) {
                window.alert('O nome de usuário é obrigatório.');
                inputName?.focus();
                return;
            }

            const profile = {
                name,
                favorite,
                bio,
                location,
                avatarSrc: draftAvatarSrc || DEFAULT_AVATAR_SRC,
                updatedAt: Date.now(),
            };

            saveProfile(profile);
            applyProfileToUI(profile);
            closeModal();
        });
    }

    // Aplicar perfil salvo no carregamento
    applyProfileToUI(loadProfile());

    document.querySelectorAll('[data-action="add-donation"]').forEach((btn) => {
        btn.addEventListener('click', function () {
            showSoon('Adicionar doação');
        });
    });

    document.querySelectorAll('[data-action="add-expo"]').forEach((btn) => {
        btn.addEventListener('click', function () {
            showSoon('Adicionar exposição');
        });
    });

    document.querySelectorAll('.top-nav__btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            showSoon('Atalho');
        });
    });
})();
