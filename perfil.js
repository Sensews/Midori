(function () {
    'use strict';

    const api = window.MidoriApi;
    const DEFAULT_AVATAR_SRC = 'Assets/Mido.svg';
    const MAX_POST_IMAGES = 10;
    const LIMITS = { name: 30, bio: 140, favorite: 20 };
    const MODAL_ANIM_MS = 480;

    if (!api || !api.getToken()) {
        window.location.href = 'index.html';
        return;
    }

    let me = null;
    let profile = null;
    let cachedPosts = [];
    let likedPostsCache = [];
    let commentedPostsCache = [];
    let editingPostId = null;
    let activeViewPostId = null;
    let activeViewImageIndex = 0;
    let uploadedPhotos = [];
    let closeAnimTimer = 0;
    let draftAvatarFile = null;
    let draftAvatarSrc = DEFAULT_AVATAR_SRC;

    const btnSettings = document.getElementById('btn-settings');
    const btnLogout = document.getElementById('btn-logout');
    const btnInteractions = document.getElementById('btn-interactions');
    const adminShortcut = document.getElementById('admin-shortcut');
    const overlay = document.getElementById('settings-overlay');
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
    const btnLogoutAll = document.getElementById('settings-logout-all');

    const donationGrid = document.querySelector('.donation-grid');
    const expoGrid = document.querySelector('.expo-grid');
    const likedPostsGrid = document.getElementById('liked-posts-grid');
    const commentedPostsGrid = document.getElementById('commented-posts-grid');
    const interactionsOverlay = document.getElementById('interactions-overlay');
    const interactionsClose = document.getElementById('interactions-close');
    const interactionsTabLiked = document.getElementById('interactions-tab-liked');
    const interactionsTabCommented = document.getElementById('interactions-tab-commented');
    const interactionsLikedPanel = document.getElementById('interactions-liked-panel');
    const interactionsCommentedPanel = document.getElementById('interactions-commented-panel');

    const postOverlay = document.getElementById('post-overlay');
    const postForm = document.getElementById('post-form');
    const postClose = document.getElementById('post-close');
    const postTypeRadios = document.querySelectorAll('input[name="post-type"]');
    const postPhotos = document.getElementById('post-photos');
    const postPhotoGrid = document.getElementById('post-photo-grid');
    const postTitleInput = document.getElementById('post-title-input');
    const postDescriptionInput = document.getElementById('post-description');
    const postSubmitBtn = document.getElementById('post-submit-btn');
    const postTitleCount = document.getElementById('post-title-count');
    const postDescriptionCount = document.getElementById('post-description-count');

    const viewPostOverlay = document.getElementById('view-post-overlay');
    const viewPostClose = document.getElementById('view-post-close');
    const viewPostType = document.getElementById('view-post-type');
    const viewPostTypeComments = document.getElementById('view-post-type-comments');
    const viewPostTitleText = document.getElementById('view-post-title-text');
    const viewPostEdited = document.getElementById('view-post-edited');
    const viewPostDescription = document.getElementById('view-post-description');
    const viewPostMainImage = document.getElementById('view-post-main-image');
    const viewPostOpenZoom = document.getElementById('view-post-open-zoom');
    const viewPostThumbs = document.getElementById('view-post-thumbs');
    const viewPostLikeBtn = document.getElementById('view-post-like-btn');
    const viewPostCompleteBtn = document.getElementById('view-post-complete-btn');
    const viewPostEditBtn = document.getElementById('view-post-edit-btn');
    const viewPostDeleteBtn = document.getElementById('view-post-delete-btn');
    const viewPostLikeCount = document.getElementById('view-post-like-count');
    const viewPostTabPost = document.getElementById('view-post-tab-post');
    const viewPostTabComments = document.getElementById('view-post-tab-comments');
    const viewPostPanelPost = document.getElementById('view-post-panel-post');
    const viewPostPanelComments = document.getElementById('view-post-panel-comments');
    const viewPostCommentsList = document.getElementById('view-post-comments-list');
    const viewPostCommentForm = document.getElementById('view-post-comment-form');
    const viewPostCommentInput = document.getElementById('view-post-comment-input');
    const viewPostZoomOverlay = document.getElementById('view-post-zoom-overlay');
    const viewPostZoomClose = document.getElementById('view-post-zoom-close');
    const viewPostZoomImage = document.getElementById('view-post-zoom-image');

    const postFormData = { type: 'donation' };

    function safeTrim(value) {
        return (value || '').toString().trim();
    }

    function getProfileExtrasStorageKey() {
        return `midori.profile.extras.v1.${me?.id || 'anonymous'}`;
    }

    function loadProfileExtras() {
        try {
            const raw = window.localStorage.getItem(getProfileExtrasStorageKey());
            if (!raw) return { location: '', favorite: '' };
            const parsed = JSON.parse(raw);
            return {
                location: clampLen(parsed?.location || '', 60),
                favorite: clampLen(parsed?.favorite || '', LIMITS.favorite),
            };
        } catch {
            return { location: '', favorite: '' };
        }
    }

    function saveProfileExtras(extras) {
        try {
            window.localStorage.setItem(getProfileExtrasStorageKey(), JSON.stringify({
                location: clampLen(extras?.location || '', 60),
                favorite: clampLen(extras?.favorite || '', LIMITS.favorite),
            }));
        } catch {
        }
    }

    function clampLen(value, max) {
        const text = safeTrim(value);
        return text.length > max ? text.slice(0, max) : text;
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[<>&"']/g, (char) => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;',
        }[char]));
    }

    function toUiType(apiType) {
        return apiType === 'EXHIBITION' ? 'expo' : 'donation';
    }

    function toApiType(uiType) {
        return uiType === 'expo' ? 'EXHIBITION' : 'DONATION';
    }

    function mapPost(apiPost) {
        const likesList = Array.isArray(apiPost.likes) ? apiPost.likes : [];
        const commentsList = Array.isArray(apiPost.comments) ? apiPost.comments : [];

        return {
            id: apiPost.id,
            authorId: apiPost.authorId || apiPost.author?.id || null,
            type: toUiType(apiPost.type),
            title: apiPost.title,
            description: apiPost.description,
            photos: apiPost.imageUrl ? [apiPost.imageUrl] : [],
            likes: apiPost._count?.likes ?? likesList.length ?? 0,
            likedByMe: likesList.some((item) => item.userId === me?.id),
            donationCompleted: Boolean(apiPost.isDonationCompleted),
            comments: commentsList.map((comment) => ({
                id: comment.id,
                authorName: comment.user?.displayName || comment.user?.username || 'Usuário',
                text: comment.content,
                createdAt: new Date(comment.createdAt).getTime(),
            })),
            createdAt: new Date(apiPost.createdAt).getTime(),
            editedAt: apiPost.updatedAt !== apiPost.createdAt ? new Date(apiPost.updatedAt).getTime() : null,
        };
    }

    function findPostById(postId) {
        const localPost = cachedPosts.find((post) => post.id === postId);
        if (localPost) return localPost;

        const likedPost = likedPostsCache.find((post) => post.id === postId);
        if (likedPost) return likedPost;

        return commentedPostsCache.find((post) => post.id === postId) || null;
    }

    function setCounter(el, value, max) {
        if (!el) return;
        el.textContent = `${(value || '').length}/${max}`;
    }

    function updatePostCounter(el, input, max) {
        if (!el || !input) return;
        el.textContent = `${input.value.length}/${max}`;
    }

    function applyProfileToUI() {
        if (!profile) return;

        const nameEl = document.getElementById('profile-name');
        const bioEl = document.getElementById('profile-bio');
        const favoriteEl = document.getElementById('profile-favorite');
        const locationEl = document.getElementById('profile-location');
        const avatarEl = document.getElementById('profile-avatar-img');
        const avatarWrap = document.getElementById('profile-avatar');

        if (nameEl) nameEl.textContent = profile.displayName || profile.username || 'Usuário';
        if (bioEl) bioEl.textContent = profile.bio || '';
        if (favoriteEl) favoriteEl.textContent = profile.favorite || '';
        if (locationEl) locationEl.textContent = profile.location || '';

        const nextAvatar = profile.avatarUrl || DEFAULT_AVATAR_SRC;
        if (avatarEl) avatarEl.src = nextAvatar;
        if (avatarWrap) avatarWrap.classList.toggle('avatar--default', nextAvatar === DEFAULT_AVATAR_SRC);
    }

    function applyPostImage(el, imageSrc) {
        if (!el || !imageSrc) return;
        el.style.backgroundImage = `url("${imageSrc}")`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';
    }

    function buildCard(post, index) {
        const isDonation = post.type === 'donation';
        const article = document.createElement('article');
        article.className = `plant-card ${isDonation ? 'plant-card--donation' : 'plant-card--expo'}`;
        article.setAttribute('role', 'listitem');
        article.setAttribute('aria-label', `${isDonation ? 'Postagem para doação' : 'Postagem em exposição'} ${index + 1}`);
        article.dataset.postId = post.id;

        const image = document.createElement('div');
        image.className = 'plant-card__img';
        image.setAttribute('aria-hidden', 'true');
        applyPostImage(image, post.photos?.[0]);

        if (isDonation && post.donationCompleted) {
            const statusBadge = document.createElement('div');
            statusBadge.className = 'plant-card__statusBadge';
            statusBadge.textContent = '✓ Concluída';
            image.appendChild(statusBadge);
        }

        const bottom = document.createElement('div');
        bottom.className = 'plant-card__bottom';
        bottom.setAttribute('aria-hidden', 'true');

        const title = document.createElement('div');
        title.className = 'plant-card__field plant-card__field--filled';
        title.textContent = `${post.title || 'Sem título'}${post.editedAt ? ' • editado' : ''}`;

        const meta = document.createElement('div');
        meta.className = 'plant-card__meta';
        meta.innerHTML = `<span class="plant-card__likesInline"><img src="Assets/like.svg" alt="" aria-hidden="true"> ${post.likes || 0}</span>`;

        bottom.appendChild(title);
        bottom.appendChild(meta);
        article.appendChild(image);
        article.appendChild(bottom);
        return article;
    }

    function renderCachedPosts() {
        const donationPosts = cachedPosts.filter((post) => post.type === 'donation');
        const expoPosts = cachedPosts.filter((post) => post.type === 'expo');

        if (donationGrid) {
            donationGrid.innerHTML = '';
            donationPosts.forEach((post, index) => donationGrid.appendChild(buildCard(post, index)));
        }

        if (expoGrid) {
            expoGrid.innerHTML = '';
            expoPosts.forEach((post, index) => expoGrid.appendChild(buildCard(post, index)));
        }
    }

    function buildActivityItem(post) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'activity-item';
        button.dataset.postId = post.id;
        button.innerHTML = `
            <div class="activity-item__title">${escapeHtml(post.title || 'Sem título')}</div>
            <div class="activity-item__meta">@${escapeHtml(post.authorName || 'usuario')} • ${post.likes || 0} curtidas • ${post.comments?.length || 0} comentários</div>
        `;
        return button;
    }

    function renderActivityGrid(container, posts, emptyMessage) {
        if (!container) return;
        container.innerHTML = '';

        if (!posts.length) {
            container.innerHTML = `<p class="activity-empty">${escapeHtml(emptyMessage)}</p>`;
            return;
        }

        posts.forEach((post) => {
            container.appendChild(buildActivityItem(post));
        });
    }

    function renderInteractions() {
        renderActivityGrid(likedPostsGrid, likedPostsCache, 'Você ainda não curtiu nenhum post.');
        renderActivityGrid(commentedPostsGrid, commentedPostsCache, 'Você ainda não comentou em posts.');
    }

    function hasOpenOverlay() {
        return Boolean(
            (overlay && !overlay.hidden)
            || (postOverlay && !postOverlay.hidden)
            || (viewPostOverlay && !viewPostOverlay.hidden)
            || (viewPostZoomOverlay && !viewPostZoomOverlay.hidden)
            || (interactionsOverlay && !interactionsOverlay.hidden)
        );
    }

    function setInteractionsTab(tab) {
        const isCommented = tab === 'commented';
        interactionsTabLiked?.classList.toggle('is-active', !isCommented);
        interactionsTabLiked?.setAttribute('aria-selected', String(!isCommented));
        interactionsTabCommented?.classList.toggle('is-active', isCommented);
        interactionsTabCommented?.setAttribute('aria-selected', String(isCommented));

        if (interactionsLikedPanel) interactionsLikedPanel.hidden = isCommented;
        if (interactionsCommentedPanel) interactionsCommentedPanel.hidden = !isCommented;
    }

    function openInteractionsModal() {
        if (!interactionsOverlay) return;
        renderInteractions();
        setInteractionsTab('liked');
        interactionsOverlay.hidden = false;
        interactionsOverlay.classList.add('is-open');
        document.body.classList.add('modal-open');
        document.body.classList.add('modal-scene');
    }

    function closeInteractionsModal() {
        if (!interactionsOverlay) return;
        interactionsOverlay.classList.remove('is-open');
        interactionsOverlay.classList.add('is-closing');

        setTimeout(() => {
            interactionsOverlay.hidden = true;
            interactionsOverlay.classList.remove('is-closing');
            if (!hasOpenOverlay()) {
                document.body.classList.remove('modal-open');
                document.body.classList.remove('modal-scene');
            }
        }, MODAL_ANIM_MS);
    }

    function setViewPostTab(tab) {
        const isComments = tab === 'comments';

        if (viewPostTabPost) {
            viewPostTabPost.classList.toggle('is-active', !isComments);
            viewPostTabPost.setAttribute('aria-selected', String(!isComments));
        }
        if (viewPostTabComments) {
            viewPostTabComments.classList.toggle('is-active', isComments);
            viewPostTabComments.setAttribute('aria-selected', String(isComments));
        }
        if (viewPostPanelPost) {
            viewPostPanelPost.classList.toggle('is-active', !isComments);
            viewPostPanelPost.hidden = isComments;
        }
        if (viewPostPanelComments) {
            viewPostPanelComments.classList.toggle('is-active', isComments);
            viewPostPanelComments.hidden = !isComments;
        }
    }

    function renderViewPostComments(comments) {
        if (!viewPostCommentsList) return;
        if (!comments.length) {
            viewPostCommentsList.innerHTML = '<p class="view-post__empty">Nenhum comentário ainda.</p>';
            return;
        }

        viewPostCommentsList.innerHTML = comments
            .map((comment) => {
                const text = escapeHtml(comment.text || '');
                const author = escapeHtml(comment.authorName || 'Usuário');
                return `<p class="view-post__commentItem"><span class="view-post__commentAuthor">${author}</span>${text}</p>`;
            })
            .join('');
    }

    function renderViewPostImages(post) {
        const photos = Array.isArray(post.photos) ? post.photos : [];
        if (!photos.length) {
            viewPostMainImage.src = '';
            viewPostThumbs.innerHTML = '';
            return;
        }

        if (activeViewImageIndex >= photos.length) activeViewImageIndex = 0;
        viewPostMainImage.src = photos[activeViewImageIndex];

        viewPostThumbs.innerHTML = photos
            .map((src, index) => `
                <button type="button" class="view-post__thumb ${index === activeViewImageIndex ? 'is-active' : ''}" data-index="${index}" aria-label="Ver imagem ${index + 1}">
                    <img src="${escapeHtml(src)}" alt="Miniatura ${index + 1}">
                </button>
            `)
            .join('');

        viewPostThumbs.querySelectorAll('.view-post__thumb').forEach((button) => {
            button.addEventListener('click', () => {
                activeViewImageIndex = Number(button.dataset.index) || 0;
                renderViewPostImages(post);
            });
        });
    }

    function renderViewPost(post) {
        const typeLabel = post.type === 'expo' ? 'Exposição' : 'Doação';
        const isOwner = Boolean(me?.id && post.authorId && post.authorId === me.id);
        if (viewPostType) viewPostType.textContent = typeLabel;
        if (viewPostTypeComments) viewPostTypeComments.textContent = typeLabel;
        if (viewPostTitleText) viewPostTitleText.textContent = post.title || 'Sem título';
        if (viewPostEdited) viewPostEdited.hidden = !post.editedAt;
        if (viewPostDescription) viewPostDescription.textContent = post.description || '';
        if (viewPostLikeCount) viewPostLikeCount.textContent = String(post.likes || 0);
        if (viewPostLikeBtn) viewPostLikeBtn.classList.toggle('is-active', Boolean(post.likedByMe));
        if (viewPostEditBtn) viewPostEditBtn.hidden = !isOwner;
        if (viewPostDeleteBtn) viewPostDeleteBtn.hidden = !isOwner;

        if (viewPostCompleteBtn) {
            const isDonation = post.type === 'donation';
            viewPostCompleteBtn.hidden = !isDonation || !isOwner;
            viewPostCompleteBtn.classList.toggle('is-active', Boolean(post.donationCompleted));
            viewPostCompleteBtn.textContent = post.donationCompleted ? 'Doação concluída ✓' : 'Marcar como concluída';
        }

        renderViewPostImages(post);
        renderViewPostComments(post.comments || []);
    }

    function openZoomModal(imageSrc) {
        if (!imageSrc) return;
        viewPostZoomImage.src = imageSrc;
        viewPostZoomOverlay.hidden = false;
        viewPostZoomOverlay.classList.add('is-open');
    }

    function closeZoomModal() {
        viewPostZoomOverlay.classList.remove('is-open');
        viewPostZoomOverlay.classList.add('is-closing');
        setTimeout(() => {
            viewPostZoomOverlay.hidden = true;
            viewPostZoomOverlay.classList.remove('is-closing');
        }, MODAL_ANIM_MS);
    }

    async function openViewPostModal(postId) {
        const localPost = findPostById(postId);
        if (!localPost) return;

        activeViewPostId = postId;
        activeViewImageIndex = 0;
        setViewPostTab('post');
        renderViewPost(localPost);

        viewPostOverlay.hidden = false;
        viewPostOverlay.classList.add('is-open');
        document.body.classList.add('modal-scene');

        try {
            const data = await api.getPost(postId);
            const fullPost = mapPost(data.post);
            cachedPosts = cachedPosts.map((item) => (item.id === fullPost.id ? fullPost : item));
            renderCachedPosts();
            if (activeViewPostId === fullPost.id) renderViewPost(fullPost);
        } catch {
        }
    }

    function closeViewPostModal() {
        viewPostOverlay.classList.remove('is-open');
        viewPostOverlay.classList.add('is-closing');
        document.body.classList.remove('modal-scene');
        setTimeout(() => {
            viewPostOverlay.hidden = true;
            viewPostOverlay.classList.remove('is-closing');
            activeViewPostId = null;
        }, MODAL_ANIM_MS);
    }

    function openModal() {
        if (closeAnimTimer) {
            window.clearTimeout(closeAnimTimer);
            closeAnimTimer = 0;
        }

        overlay.classList.remove('is-closing');
        draftAvatarFile = null;
        draftAvatarSrc = profile?.avatarUrl || DEFAULT_AVATAR_SRC;

        if (photoPreview) photoPreview.src = draftAvatarSrc;
        if (inputName) inputName.value = clampLen(profile?.displayName || '', LIMITS.name);
        if (inputBio) inputBio.value = clampLen(profile?.bio || '', LIMITS.bio);
        if (inputFavorite) inputFavorite.value = clampLen(profile?.favorite || '', LIMITS.favorite);
        if (inputLocation) inputLocation.value = clampLen(profile?.location || '', 60);

        setCounter(countName, inputName?.value || '', LIMITS.name);
        setCounter(countBio, inputBio?.value || '', LIMITS.bio);
        setCounter(countFavorite, inputFavorite?.value || '', LIMITS.favorite);

        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        document.body.classList.add('modal-open');
        document.body.classList.add('modal-scene');
        overlay.classList.remove('is-open');

        requestAnimationFrame(() => overlay.classList.add('is-open'));
        setTimeout(() => inputName?.focus(), 0);
    }

    function closeModal() {
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

    function openPostModal(postToEdit = null) {
        editingPostId = postToEdit?.id || null;

        if (postToEdit) {
            postFormData.type = postToEdit.type || 'donation';
            uploadedPhotos = (postToEdit.photos || []).map((src) => ({ preview: src, file: null }));
            postForm.reset();
            postTitleInput.value = postToEdit.title || '';
            postDescriptionInput.value = postToEdit.description || '';
            const selectedType = document.querySelector(`input[name="post-type"][value="${postFormData.type}"]`);
            if (selectedType) selectedType.checked = true;
            if (postSubmitBtn) postSubmitBtn.textContent = 'Salvar edição';
        } else {
            uploadedPhotos = [];
            postPhotoGrid.innerHTML = '';
            postForm.reset();
            postFormData.type = 'donation';
            const defaultType = document.querySelector('input[name="post-type"][value="donation"]');
            if (defaultType) defaultType.checked = true;
            if (postSubmitBtn) postSubmitBtn.textContent = 'Publicar';
        }

        renderPhotoGrid();
        updatePostCounter(postTitleCount, postTitleInput, 80);
        updatePostCounter(postDescriptionCount, postDescriptionInput, 500);

        postOverlay.hidden = false;
        postOverlay.classList.add('is-open');
        document.body.classList.add('modal-open');
        document.body.classList.add('modal-scene');
    }

    function closePostModal() {
        postOverlay.classList.remove('is-open');
        postOverlay.classList.add('is-closing');
        document.body.classList.remove('modal-scene');

        setTimeout(() => {
            postOverlay.hidden = true;
            postOverlay.classList.remove('is-closing');

            if ((overlay && !overlay.hidden) || (viewPostOverlay && !viewPostOverlay.hidden) || (viewPostZoomOverlay && !viewPostZoomOverlay.hidden)) {
                document.body.classList.add('modal-open');
            } else {
                document.body.classList.remove('modal-open');
            }

            editingPostId = null;
            if (postSubmitBtn) postSubmitBtn.textContent = 'Publicar';
        }, MODAL_ANIM_MS);
    }

    function renderPhotoGrid() {
        postPhotoGrid.innerHTML = uploadedPhotos
            .map((photo, index) => `
                <div class="post__photoItem">
                    <img src="${photo.preview}" alt="Foto ${index + 1}">
                    <button type="button" class="post__photoRemove" aria-label="Remover foto" data-index="${index}">×</button>
                </div>
            `)
            .join('');

        postPhotoGrid.querySelectorAll('.post__photoRemove').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const idx = Number(btn.dataset.index);
                if (Number.isNaN(idx)) return;
                uploadedPhotos.splice(idx, 1);
                renderPhotoGrid();
            });
        });
    }

    async function refreshPosts() {
        const response = await api.listPosts({ author: me.username });
        const posts = Array.isArray(response.posts) ? response.posts : [];
        cachedPosts = posts.map(mapPost);
        renderCachedPosts();
    }

    async function refreshInteractions() {
        const response = await api.getMyPostInteractions();
        const liked = Array.isArray(response.likedPosts) ? response.likedPosts : [];
        const commented = Array.isArray(response.commentedPosts) ? response.commentedPosts : [];

        likedPostsCache = liked.map((post) => {
            const mapped = mapPost(post);
            return {
                ...mapped,
                authorName: post.author?.username || post.author?.displayName || 'usuario',
            };
        });

        commentedPostsCache = commented.map((post) => {
            const mapped = mapPost(post);
            return {
                ...mapped,
                authorName: post.author?.username || post.author?.displayName || 'usuario',
            };
        });

        renderInteractions();
    }

    async function initData() {
        const meResponse = await api.getMe();
        me = meResponse.user;
        if (adminShortcut) {
            adminShortcut.hidden = true;
        }
        if (adminShortcut) {
            adminShortcut.hidden = true;
            if (String(me?.role || '').toUpperCase() === 'SUPERADMIN') {
                adminShortcut.hidden = false;
            }
        }

        const profileResponse = await api.getMyProfile();
        const extras = loadProfileExtras();
        profile = {
            ...profileResponse.profile,
            favorite: extras.favorite || '',
            location: extras.location || '',
        };

        applyProfileToUI();
        await refreshPosts();
        await refreshInteractions();
    }

    btnSettings?.addEventListener('click', openModal);
    btnLogout?.addEventListener('click', () => {
        const ok = window.confirm('Deseja sair da sua conta?');
        if (!ok) return;
        api.clearSession();
        window.location.href = 'index.html';
    });
    btnInteractions?.addEventListener('click', openInteractionsModal);
    interactionsClose?.addEventListener('click', closeInteractionsModal);
    interactionsOverlay?.addEventListener('click', (e) => {
        if (e.target === interactionsOverlay) closeInteractionsModal();
    });
    interactionsTabLiked?.addEventListener('click', () => setInteractionsTab('liked'));
    interactionsTabCommented?.addEventListener('click', () => setInteractionsTab('commented'));
    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);

    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (overlay && !overlay.hidden) closeModal();
        if (interactionsOverlay && !interactionsOverlay.hidden) closeInteractionsModal();
        if (viewPostOverlay && !viewPostOverlay.hidden) closeViewPostModal();
        if (viewPostZoomOverlay && !viewPostZoomOverlay.hidden) closeZoomModal();
    });

    inputName?.addEventListener('input', function () {
        if (this.value.length > LIMITS.name) this.value = this.value.slice(0, LIMITS.name);
        setCounter(countName, this.value, LIMITS.name);
    });

    inputFavorite?.addEventListener('input', function () {
        if (this.value.length > LIMITS.favorite) this.value = this.value.slice(0, LIMITS.favorite);
        setCounter(countFavorite, this.value, LIMITS.favorite);
    });

    inputBio?.addEventListener('input', function () {
        if (this.value.length > LIMITS.bio) this.value = this.value.slice(0, LIMITS.bio);
        setCounter(countBio, this.value, LIMITS.bio);
    });

    inputPhoto?.addEventListener('change', function () {
        const file = this.files && this.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            window.alert('Selecione uma imagem válida.');
            this.value = '';
            return;
        }

        draftAvatarFile = file;

        const reader = new FileReader();
        reader.onload = function () {
            draftAvatarSrc = typeof reader.result === 'string' ? reader.result : DEFAULT_AVATAR_SRC;
            if (photoPreview) photoPreview.src = draftAvatarSrc;
        };
        reader.readAsDataURL(file);
    });

    btnRemovePhoto?.addEventListener('click', function () {
        draftAvatarFile = null;
        draftAvatarSrc = DEFAULT_AVATAR_SRC;
        if (photoPreview) photoPreview.src = draftAvatarSrc;
        if (inputPhoto) inputPhoto.value = '';
    });

    btnDelete?.addEventListener('click', function () {
        const ok = window.confirm('Deseja sair da sua conta agora?');
        if (!ok) return;
        api.clearSession();
        window.location.href = 'index.html';
    });

    btnLogoutAll?.addEventListener('click', async function () {
        const ok = window.confirm('Deseja encerrar todas as sessões da conta?');
        if (!ok) return;

        try {
            await api.revokeAllAuthSessions({ keepCurrent: false });
            api.clearSession();
            window.alert('Todas as sessões foram encerradas. Faça login novamente.');
            window.location.href = 'index.html';
        } catch (error) {
            window.alert(error.message || 'Erro ao encerrar sessões.');
        }
    });

    form?.addEventListener('submit', async function (e) {
        e.preventDefault();

        const name = clampLen(inputName?.value || '', LIMITS.name);
        const bio = clampLen(inputBio?.value || '', LIMITS.bio);
        const location = clampLen(inputLocation?.value || '', 60);
        const favorite = clampLen(inputFavorite?.value || '', LIMITS.favorite);

        if (!name) {
            window.alert('O nome de usuário é obrigatório.');
            inputName?.focus();
            return;
        }

        try {
            const updateResponse = await api.updateMyProfile({ displayName: name, bio });
            profile = {
                ...profile,
                ...updateResponse.user,
                location,
                favorite,
            };
            saveProfileExtras({ location, favorite });

            if (draftAvatarFile) {
                const avatarResponse = await api.uploadMyAvatar(draftAvatarFile);
                profile.avatarUrl = avatarResponse.user.avatarUrl;
            } else if (draftAvatarSrc === DEFAULT_AVATAR_SRC) {
                profile.avatarUrl = DEFAULT_AVATAR_SRC;
            }

            applyProfileToUI();
            closeModal();
        } catch (error) {
            window.alert(error.message || 'Erro ao salvar perfil.');
        }
    });

    postTypeRadios.forEach((radio) => {
        radio.addEventListener('change', (e) => {
            postFormData.type = e.target.value;
        });
    });

    postPhotos?.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        files.forEach((file) => {
            if (uploadedPhotos.length >= MAX_POST_IMAGES) return;
            if (!file.type.startsWith('image/')) return;
            uploadedPhotos.push({ preview: URL.createObjectURL(file), file });
        });

        renderPhotoGrid();
        postPhotos.value = '';
    });

    postTitleInput?.addEventListener('input', () => updatePostCounter(postTitleCount, postTitleInput, 80));
    postDescriptionInput?.addEventListener('input', () => updatePostCounter(postDescriptionCount, postDescriptionInput, 500));

    postForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = safeTrim(postTitleInput.value);
        const description = safeTrim(postDescriptionInput.value);

        if (!title) {
            window.alert('Por favor, adicione um título para a postagem.');
            return;
        }

        if (!description) {
            window.alert('Por favor, adicione uma descrição.');
            return;
        }

        try {
            if (editingPostId) {
                const current = findPostById(editingPostId);
                const file = uploadedPhotos.find((item) => item.file)?.file;

                await api.updatePost(editingPostId, {
                    title,
                    description,
                    isDonationCompleted: current?.donationCompleted,
                    imageFile: file,
                });
            } else {
                const firstImageFile = uploadedPhotos.find((item) => item.file)?.file;
                if (!firstImageFile) {
                    window.alert('Adicione pelo menos uma foto nova para publicar.');
                    return;
                }

                await api.createPost({
                    title,
                    description,
                    type: toApiType(postFormData.type),
                    imageFile: firstImageFile,
                });
            }

            await refreshPosts();
            closePostModal();
        } catch (error) {
            window.alert(error.message || 'Erro ao salvar postagem.');
        }
    });

    postClose?.addEventListener('click', closePostModal);

    viewPostClose?.addEventListener('click', closeViewPostModal);
    viewPostOverlay?.addEventListener('click', (e) => {
        if (e.target === viewPostOverlay) closeViewPostModal();
    });

    viewPostLikeBtn?.addEventListener('click', async () => {
        if (!activeViewPostId) return;
        try {
            const result = await api.toggleLike(activeViewPostId);
            cachedPosts = cachedPosts.map((post) => {
                if (post.id !== activeViewPostId) return post;
                return { ...post, likedByMe: Boolean(result.liked), likes: result.totalLikes || 0 };
            });

            renderCachedPosts();
            const updated = findPostById(activeViewPostId);
            if (updated) renderViewPost(updated);
        } catch (error) {
            window.alert(error.message || 'Erro ao curtir postagem.');
        }
    });

    viewPostCompleteBtn?.addEventListener('click', async () => {
        if (!activeViewPostId) return;

        const current = findPostById(activeViewPostId);
        if (!current || current.type !== 'donation') return;
        if (!me?.id || current.authorId !== me.id) {
            window.alert('Você só pode encerrar doações das suas próprias postagens.');
            return;
        }

        try {
            await api.updatePost(activeViewPostId, {
                isDonationCompleted: !current.donationCompleted,
            });
            await refreshPosts();
            const updated = findPostById(activeViewPostId);
            if (updated) renderViewPost(updated);
        } catch (error) {
            window.alert(error.message || 'Erro ao atualizar status da doação.');
        }
    });

    viewPostEditBtn?.addEventListener('click', () => {
        if (!activeViewPostId) return;
        const post = findPostById(activeViewPostId);
        if (!post) return;
        if (!me?.id || post.authorId !== me.id) {
            window.alert('Você só pode editar suas próprias postagens.');
            return;
        }
        closeViewPostModal();
        setTimeout(() => openPostModal(post), MODAL_ANIM_MS);
    });

    viewPostDeleteBtn?.addEventListener('click', async () => {
        if (!activeViewPostId) return;
        const post = findPostById(activeViewPostId);
        if (!post) return;
        if (!me?.id || post.authorId !== me.id) {
            window.alert('Você só pode deletar suas próprias postagens.');
            return;
        }
        const ok = window.confirm('Deseja realmente deletar esta postagem?');
        if (!ok) return;

        try {
            await api.deletePost(activeViewPostId);
            cachedPosts = cachedPosts.filter((post) => post.id !== activeViewPostId);
            renderCachedPosts();
            closeViewPostModal();
        } catch (error) {
            window.alert(error.message || 'Erro ao deletar postagem.');
        }
    });

    viewPostCommentForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeViewPostId) return;

        const text = safeTrim(viewPostCommentInput?.value || '');
        if (!text) return;

        try {
            const response = await api.addComment(activeViewPostId, text.slice(0, 160));
            const created = response.comment;

            cachedPosts = cachedPosts.map((post) => {
                if (post.id !== activeViewPostId) return post;
                return {
                    ...post,
                    comments: [
                        ...post.comments,
                        {
                            id: created.id,
                            authorName: created.user?.displayName || created.user?.username || 'Você',
                            text: created.content,
                            createdAt: new Date(created.createdAt).getTime(),
                        },
                    ],
                };
            });

            if (viewPostCommentInput) viewPostCommentInput.value = '';
            const updated = findPostById(activeViewPostId);
            if (updated) renderViewPost(updated);
        } catch (error) {
            window.alert(error.message || 'Erro ao comentar.');
        }
    });

    viewPostTabPost?.addEventListener('click', () => setViewPostTab('post'));
    viewPostTabComments?.addEventListener('click', () => setViewPostTab('comments'));

    viewPostOpenZoom?.addEventListener('click', () => {
        if (!activeViewPostId) return;
        const post = findPostById(activeViewPostId);
        const src = post?.photos?.[activeViewImageIndex];
        if (src) openZoomModal(src);
    });

    viewPostZoomClose?.addEventListener('click', closeZoomModal);
    viewPostZoomOverlay?.addEventListener('click', (e) => {
        if (e.target === viewPostZoomOverlay) closeZoomModal();
    });

    donationGrid?.addEventListener('click', (e) => {
        const card = e.target.closest('[data-post-id]');
        if (!card) return;
        openViewPostModal(card.dataset.postId);
    });

    expoGrid?.addEventListener('click', (e) => {
        const card = e.target.closest('[data-post-id]');
        if (!card) return;
        openViewPostModal(card.dataset.postId);
    });

    likedPostsGrid?.addEventListener('click', (e) => {
        const card = e.target.closest('[data-post-id]');
        if (!card) return;
        closeInteractionsModal();
        setTimeout(() => openViewPostModal(card.dataset.postId), MODAL_ANIM_MS);
    });

    commentedPostsGrid?.addEventListener('click', (e) => {
        const card = e.target.closest('[data-post-id]');
        if (!card) return;
        closeInteractionsModal();
        setTimeout(() => openViewPostModal(card.dataset.postId), MODAL_ANIM_MS);
    });

    document.querySelectorAll('[data-action="add-donation"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            postFormData.type = 'donation';
            const radio = document.querySelector('input[name="post-type"][value="donation"]');
            if (radio) radio.checked = true;
            openPostModal();
        });
    });

    document.querySelectorAll('[data-action="add-expo"]').forEach((btn) => {
        btn.addEventListener('click', () => {
            postFormData.type = 'expo';
            const radio = document.querySelector('input[name="post-type"][value="expo"]');
            if (radio) radio.checked = true;
            openPostModal();
        });
    });

    document.querySelectorAll('.top-nav__btn').forEach((btn) => {
        btn.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') e.preventDefault();
        });
    });

    initData().catch((error) => {
        if (error.status === 401) {
            api.clearSession();
            window.location.href = 'index.html';
            return;
        }
        window.alert(error.message || 'Erro ao carregar perfil.');
    });
})();
