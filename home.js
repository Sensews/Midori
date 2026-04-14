(function () {
    'use strict';

    const api = window.MidoriApi;

    if (!api || !api.getToken()) {
        window.location.href = 'index.html';
        return;
    }

    const card = document.getElementById('swipe-card');
    const emptyState = document.getElementById('home-empty');
    const cardImage = document.getElementById('card-image');
    const cardType = document.getElementById('card-type');
    const cardAuthor = document.getElementById('card-author');
    const cardTitle = document.getElementById('card-title');
    const cardDescription = document.getElementById('card-description');
    const cardLikes = document.getElementById('card-likes');
    const cardComments = document.getElementById('card-comments');
    const swipeFeedback = document.getElementById('swipe-feedback');
    const swipeHud = document.getElementById('swipe-hud');
    const swipeTip = document.getElementById('swipe-tip');
    const swipeActionSkip = document.getElementById('swipe-action-skip');
    const swipeActionLike = document.getElementById('swipe-action-like');
    const swipeChipSkip = document.getElementById('swipe-chip-skip');
    const swipeChipLike = document.getElementById('swipe-chip-like');
    const swipeHudMascot = document.getElementById('swipe-hud-mascot');
    const reloadPostsBtn = document.getElementById('home-reload-posts');

    const modal = document.getElementById('post-modal-overlay');
    const modalClose = document.getElementById('home-post-close');
    const modalImage = document.getElementById('home-post-image');
    const modalAuthor = document.getElementById('home-post-author');
    const modalDescription = document.getElementById('home-post-description');
    const modalLikeBtn = document.getElementById('home-like-btn');
    const modalReportBtn = document.getElementById('home-report-btn');
    const modalComments = document.getElementById('home-comments-list');
    const modalCommentForm = document.getElementById('home-comment-form');
    const modalCommentInput = document.getElementById('home-comment-input');
    const modalRequestForm = document.getElementById('home-request-form');
    const modalRequestInput = document.getElementById('home-request-input');

    const requiredElements = [
        card,
        emptyState,
        cardImage,
        cardType,
        cardAuthor,
        cardTitle,
        cardDescription,
        cardLikes,
        cardComments,
        swipeFeedback,
        swipeHud,
        swipeTip,
        swipeActionSkip,
        swipeActionLike,
        swipeChipSkip,
        swipeChipLike,
        swipeHudMascot,
        reloadPostsBtn,
        modal,
        modalClose,
        modalImage,
        modalAuthor,
        modalDescription,
        modalLikeBtn,
        modalReportBtn,
        modalComments,
        modalCommentForm,
        modalCommentInput,
        modalRequestForm,
        modalRequestInput,
    ];

    if (requiredElements.some((element) => !element)) {
        window.__midoriForceCloseModal && window.__midoriForceCloseModal();
        return;
    }

    const state = {
        me: null,
        posts: [],
        index: 0,
        activePostId: null,
        seenPostIds: new Set(),
    };

    let drag = {
        startX: 0,
        currentX: 0,
        active: false,
        moved: false,
        pointerId: null,
    };

    const SWIPE_THRESHOLD = 140;
    const FLY_OUT_X = 760;
    let isAnimatingChoice = false;

    function mapPost(post) {
        return {
            id: post.id,
            type: post.type,
            title: post.title,
            description: post.description,
            imageUrl: post.imageUrl || '',
            likes: post._count?.likes || 0,
            commentsCount: post._count?.comments || 0,
            likedByMe: Boolean(post.likedByMe),
            author: post.author,
        };
    }

    function openAuthorProfile(username) {
        const clean = String(username || '').trim();
        if (!clean) return;
        window.location.href = `perfil-usuario.html?u=${encodeURIComponent(clean.toLowerCase())}`;
    }

    function getSeenStorageKey() {
        return `midori.home.seenPosts.v1.${state.me?.id || 'anonymous'}`;
    }

    function getQueueStorageKey() {
        return `midori.home.queue.v1.${state.me?.id || 'anonymous'}`;
    }

    function loadSeenPostIds() {
        try {
            const raw = window.localStorage.getItem(getSeenStorageKey());
            if (!raw) return new Set();
            const list = JSON.parse(raw);
            if (!Array.isArray(list)) return new Set();
            return new Set(list.filter((id) => typeof id === 'string'));
        } catch {
            return new Set();
        }
    }

    function saveSeenPostIds() {
        try {
            window.localStorage.setItem(getSeenStorageKey(), JSON.stringify([...state.seenPostIds]));
        } catch {
        }
    }

    function loadQueuePostIds() {
        try {
            const raw = window.localStorage.getItem(getQueueStorageKey());
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed?.postIds) ? parsed.postIds : [];
            return list.filter((id) => typeof id === 'string');
        } catch {
            return [];
        }
    }

    function saveQueuePostIds() {
        try {
            const postIds = state.posts.map((post) => post.id).filter((id) => typeof id === 'string');
            window.localStorage.setItem(getQueueStorageKey(), JSON.stringify({ postIds }));
        } catch {
        }
    }

    function currentPost() {
        return state.posts[state.index] || null;
    }

    function keepCurrentPostById(postId) {
        if (!postId) return;
        const nextIndex = state.posts.findIndex((post) => post.id === postId);
        if (nextIndex >= 0) {
            state.index = nextIndex;
        }
    }

    function shuffle(array) {
        const copy = [...array];
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function updateCard() {
        const post = currentPost();

        if (!post) {
            card.hidden = true;
            emptyState.hidden = false;
            swipeHud.hidden = true;
            swipeTip.hidden = true;
            return;
        }

        card.hidden = false;
        emptyState.hidden = true;
        swipeHud.hidden = false;
        swipeTip.hidden = false;

        cardImage.src = post.imageUrl || 'Assets/Mido.svg';
        cardType.textContent = post.type === 'EXHIBITION' ? 'Exposição' : 'Doação';
        cardAuthor.textContent = `@${post.author?.username || 'usuario'}`;
        cardAuthor.dataset.username = post.author?.username || '';
        cardTitle.textContent = post.title || 'Sem título';
        cardDescription.textContent = post.description || '';
        cardLikes.textContent = `${post.likes} curtidas`;
        cardComments.textContent = `${post.commentsCount} comentários`;

        card.style.transform = 'translateX(0px) rotate(0deg)';
        card.style.opacity = '1';
        swipeFeedback.style.opacity = '0';
        swipeFeedback.classList.remove('swipe-card__feedback--skip', 'swipe-card__feedback--like');
        swipeActionSkip.style.opacity = '0';
        swipeActionSkip.style.transform = 'scale(0.92)';
        swipeActionLike.style.opacity = '0';
        swipeActionLike.style.transform = 'scale(0.92)';
        swipeChipSkip.classList.remove('is-active');
        swipeChipLike.classList.remove('is-active');
        swipeHudMascot.style.transform = '';
    }

    function refreshCurrentCardMeta() {
        const post = currentPost();
        if (!post) return;

        cardLikes.textContent = `${post.likes} curtidas`;
        cardComments.textContent = `${post.commentsCount} comentários`;
    }

    function nextPost() {
        if (!state.posts.length) {
            updateCard();
            return;
        }

        const current = currentPost();
        if (current?.id) {
            state.seenPostIds.add(current.id);
            saveSeenPostIds();
        }

        state.posts.splice(state.index, 1);
        if (state.index >= state.posts.length) state.index = 0;
        saveQueuePostIds();
        updateCard();
    }

    async function likeCurrentPost() {
        const post = currentPost();
        if (!post) return;

        if (!post.likedByMe) {
            const response = await api.toggleLike(post.id);
            post.likedByMe = Boolean(response.liked);
            post.likes = response.totalLikes || post.likes;
        }
    }

    async function swipeRight() {
        try {
            await likeCurrentPost();
        } catch (error) {
            window.alert(error.message || 'Erro ao curtir postagem.');
        }
        nextPost();
    }

    function swipeLeft() {
        nextPost();
    }

    function applyDragVisual(deltaX) {
        const rotate = deltaX / 24;
        const opacity = Math.max(0.35, 1 - Math.abs(deltaX) / 360);

        card.style.transform = `translateX(${deltaX}px) rotate(${rotate}deg)`;
        card.style.opacity = String(opacity);

        const intensity = Math.min(1, Math.abs(deltaX) / 220);
        const thresholdReady = Math.abs(deltaX) >= SWIPE_THRESHOLD;
        swipeFeedback.style.opacity = String(intensity);
        swipeHudMascot.style.transform = `translateX(${deltaX * 0.03}px) rotate(${deltaX * 0.035}deg)`;

        if (deltaX < 0) {
            swipeFeedback.classList.add('swipe-card__feedback--skip');
            swipeFeedback.classList.remove('swipe-card__feedback--like');
            swipeActionSkip.style.opacity = String(0.2 + intensity * 0.8);
            swipeActionSkip.style.transform = `scale(${0.92 + intensity * 0.08})`;
            swipeActionLike.style.opacity = '0';
            swipeActionLike.style.transform = 'scale(0.92)';
            swipeChipSkip.classList.toggle('is-active', thresholdReady);
            swipeChipLike.classList.remove('is-active');
        } else {
            swipeFeedback.classList.add('swipe-card__feedback--like');
            swipeFeedback.classList.remove('swipe-card__feedback--skip');
            swipeActionLike.style.opacity = String(0.2 + intensity * 0.8);
            swipeActionLike.style.transform = `scale(${0.92 + intensity * 0.08})`;
            swipeActionSkip.style.opacity = '0';
            swipeActionSkip.style.transform = 'scale(0.92)';
            swipeChipLike.classList.toggle('is-active', thresholdReady);
            swipeChipSkip.classList.remove('is-active');
        }
    }

    function resetCardVisual() {
        card.style.transition = 'transform 0.32s ease, opacity 0.32s ease';
        card.style.transform = 'translateX(0px) rotate(0deg)';
        card.style.opacity = '1';
        swipeFeedback.style.opacity = '0';
        swipeFeedback.classList.remove('swipe-card__feedback--skip', 'swipe-card__feedback--like');
        swipeActionSkip.style.opacity = '0';
        swipeActionSkip.style.transform = 'scale(0.92)';
        swipeActionLike.style.opacity = '0';
        swipeActionLike.style.transform = 'scale(0.92)';
        swipeChipSkip.classList.remove('is-active');
        swipeChipLike.classList.remove('is-active');
        swipeHudMascot.style.transform = '';
        window.setTimeout(() => {
            card.style.transition = '';
        }, 340);
    }

    async function completeSwipe(direction) {
        if (isAnimatingChoice) return;
        isAnimatingChoice = true;

        const toRight = direction === 'right';
        const targetX = toRight ? FLY_OUT_X : -FLY_OUT_X;
        const targetRotate = toRight ? 22 : -22;

        swipeFeedback.classList.toggle('swipe-card__feedback--like', toRight);
        swipeFeedback.classList.toggle('swipe-card__feedback--skip', !toRight);
        swipeFeedback.style.opacity = '0.9';
        swipeActionSkip.style.opacity = toRight ? '0' : '1';
        swipeActionSkip.style.transform = toRight ? 'scale(0.92)' : 'scale(1)';
        swipeActionLike.style.opacity = toRight ? '1' : '0';
        swipeActionLike.style.transform = toRight ? 'scale(1)' : 'scale(0.92)';
        swipeChipLike.classList.toggle('is-active', toRight);
        swipeChipSkip.classList.toggle('is-active', !toRight);
        swipeHudMascot.style.transform = toRight ? 'translateX(6px) rotate(8deg)' : 'translateX(-6px) rotate(-8deg)';

        card.style.transition = 'transform 0.42s ease, opacity 0.42s ease';
        card.style.transform = `translateX(${targetX}px) rotate(${targetRotate}deg)`;
        card.style.opacity = '0';

        await new Promise((resolve) => window.setTimeout(resolve, 420));

        card.style.transition = 'none';
        card.style.transform = 'translateX(0px) rotate(0deg)';
        card.style.opacity = '0';
        swipeFeedback.style.opacity = '0';
        swipeFeedback.classList.remove('swipe-card__feedback--skip', 'swipe-card__feedback--like');
        swipeActionSkip.style.opacity = '0';
        swipeActionSkip.style.transform = 'scale(0.92)';
        swipeActionLike.style.opacity = '0';
        swipeActionLike.style.transform = 'scale(0.92)';
        swipeChipSkip.classList.remove('is-active');
        swipeChipLike.classList.remove('is-active');
        swipeHudMascot.style.transform = '';

        if (toRight) {
            await swipeRight();
        } else {
            swipeLeft();
        }

        card.style.transition = '';
        isAnimatingChoice = false;
    }

    function renderModalComments(comments) {
        if (!comments?.length) {
            modalComments.innerHTML = '<p>Nenhum comentário ainda.</p>';
            return;
        }

        modalComments.innerHTML = comments
            .map((comment) => `<p><strong>${sanitize(comment.user?.displayName || comment.user?.username || 'Usuário')}:</strong> ${sanitize(comment.content || '')}</p>`)
            .join('');
    }

    async function openModal() {
        const post = currentPost();
        if (!post) return;

        try {
            const data = await api.getPost(post.id);
            const full = data.post;
            state.activePostId = full.id;

            modalImage.src = full.imageUrl || 'Assets/Mido.svg';
            modalAuthor.textContent = `Postado por @${full.author?.username || 'usuario'}`;
            modalAuthor.dataset.username = full.author?.username || '';
            modalDescription.textContent = full.description || '';
            modalLikeBtn.textContent = full.likedByMe ? 'Descurtir' : 'Curtir';
            modalLikeBtn.disabled = false;
            renderModalComments(full.comments || []);

            modal.hidden = false;
            modal.classList.add('is-open');
            document.body.classList.add('modal-open');
        } catch (error) {
            window.alert(error.message || 'Erro ao abrir detalhes da postagem.');
        }
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('is-open');
        modal.classList.remove('is-closing');
        modal.hidden = true;
        document.body.classList.remove('modal-open');
        state.activePostId = null;
    }

    function ensureModalClosedOnLoad() {
        if (!modal) return;
        modal.hidden = true;
        modal.classList.remove('is-open');
        modal.classList.remove('is-closing');
        document.body.classList.remove('modal-open');
        state.activePostId = null;
    }

    async function initData() {
        const me = await api.getMe();
        state.me = me.user;
        if (modalReportBtn) {
            modalReportBtn.hidden = state.me.role === 'SUPERADMIN';
        }

        const response = await api.listPosts();
        const mappedPosts = (response.posts || []).map(mapPost);
        const postsById = new Map(mappedPosts.map((post) => [post.id, post]));

        state.seenPostIds = loadSeenPostIds();
        const storedQueueIds = loadQueuePostIds();
        const restoredQueue = storedQueueIds
            .map((id) => postsById.get(id))
            .filter(Boolean);

        if (restoredQueue.length > 0) {
            state.posts = restoredQueue;
        } else {
            state.posts = mappedPosts.filter((post) => !state.seenPostIds.has(post.id));
            saveQueuePostIds();
        }

        state.index = 0;
        updateCard();
    }

    async function reloadRandomPosts() {
        if (!reloadPostsBtn) return;

        reloadPostsBtn.disabled = true;
        reloadPostsBtn.textContent = 'Carregando...';

        try {
            state.seenPostIds = new Set();
            saveSeenPostIds();

            const response = await api.listPosts();
            const mapped = (response.posts || []).map(mapPost);
            const randomTen = shuffle(mapped).slice(0, 10);

            state.posts = randomTen;
            state.index = 0;
            saveQueuePostIds();
            updateCard();
        } catch (error) {
            window.alert(error.message || 'Erro ao recarregar posts.');
        } finally {
            reloadPostsBtn.disabled = false;
            reloadPostsBtn.textContent = 'Ver posts novamente';
        }
    }

    card?.addEventListener('click', function () {
        if (drag.moved) return;
        openModal();
    });

    cardAuthor?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAuthorProfile(cardAuthor.dataset.username);
    });

    modalAuthor?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAuthorProfile(modalAuthor.dataset.username);
    });

    reloadPostsBtn?.addEventListener('click', reloadRandomPosts);

    document.addEventListener('keydown', (e) => {
        if (modal && !modal.hidden) return;
        if (isAnimatingChoice) return;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            completeSwipe('left');
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            completeSwipe('right');
        }
    });

    card?.addEventListener('pointerdown', (e) => {
        drag.startX = e.clientX;
        drag.currentX = e.clientX;
        drag.active = true;
        drag.moved = false;
        drag.pointerId = e.pointerId;
        card.setPointerCapture(e.pointerId);
        card.style.transition = 'none';
    });

    card?.addEventListener('pointermove', (e) => {
        if (!drag.active) return;
        drag.currentX = e.clientX;
        const deltaX = drag.currentX - drag.startX;
        if (Math.abs(deltaX) > 8) drag.moved = true;
        applyDragVisual(deltaX);
    });

    card?.addEventListener('pointerup', async (e) => {
        if (!drag.active) return;
        const deltaX = drag.currentX - drag.startX;
        drag.active = false;
        if (drag.pointerId !== null) {
            card.releasePointerCapture(drag.pointerId);
            drag.pointerId = null;
        }

        if (deltaX <= -SWIPE_THRESHOLD) {
            await completeSwipe('left');
            return;
        }

        if (deltaX >= SWIPE_THRESHOLD) {
            await completeSwipe('right');
            return;
        }

        resetCardVisual();
    });

    card?.addEventListener('pointercancel', () => {
        drag.active = false;
        drag.pointerId = null;
        resetCardVisual();
    });

    modalClose?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.hidden) {
            closeModal();
        }
    });

    modalLikeBtn?.addEventListener('click', async () => {
        if (!state.activePostId) return;
        const currentIdBefore = currentPost()?.id;

        try {
            const result = await api.toggleLike(state.activePostId);
            modalLikeBtn.textContent = result.liked ? 'Descurtir' : 'Curtir';
            modalLikeBtn.disabled = false;

            const live = state.posts.find((item) => item.id === state.activePostId);
            if (live) {
                live.likedByMe = Boolean(result.liked);
                live.likes = result.totalLikes ?? live.likes;
                if (currentPost()?.id === live.id) {
                    refreshCurrentCardMeta();
                }
            }

            keepCurrentPostById(currentIdBefore);
        } catch (error) {
            window.alert(error.message || 'Erro ao curtir.');
        }
    });

    modalCommentForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.activePostId) return;
        const currentIdBefore = currentPost()?.id;

        const text = modalCommentInput.value.trim();
        if (!text) return;

        try {
            await api.addComment(state.activePostId, text);
            modalCommentInput.value = '';

            const details = await api.getPost(state.activePostId);
            renderModalComments(details.post.comments || []);

            const live = state.posts.find((item) => item.id === state.activePostId);
            if (live) {
                live.commentsCount += 1;
                if (currentPost()?.id === live.id) {
                    refreshCurrentCardMeta();
                }
            }

            keepCurrentPostById(currentIdBefore);
        } catch (error) {
            window.alert(error.message || 'Erro ao comentar.');
        }
    });

    modalRequestForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.activePostId) return;

        const post = state.posts.find((item) => item.id === state.activePostId);
        if (!post) return;

        if (post.author?.id === state.me?.id) {
            window.alert('Você não pode solicitar conversa no seu próprio post.');
            return;
        }

        try {
            await api.createMessageRequest(state.activePostId, modalRequestInput.value.trim());
            modalRequestInput.value = '';
            window.alert('Solicitação enviada! O dono do post poderá aceitar no chat.');
        } catch (error) {
            window.alert(error.message || 'Erro ao enviar solicitação.');
        }
    });

    modalReportBtn?.addEventListener('click', async () => {
        if (state.me?.role === 'SUPERADMIN') {
            window.alert('Superadmin não pode criar denúncias.');
            return;
        }
        if (!state.activePostId) return;
        const post = state.posts.find((item) => item.id === state.activePostId);
        if (!post) return;

        const reason = window.prompt('Motivo da denúncia (mínimo 4 caracteres):');
        if (!reason) return;

        const details = window.prompt('Detalhes (opcional):') || '';

        try {
            await api.createReport({
                targetUserId: post.author?.id,
                postId: post.id,
                reason: reason.trim(),
                details: details.trim(),
            });
            window.alert('Denúncia enviada para análise da moderação.');
        } catch (error) {
            window.alert(error.message || 'Erro ao enviar denúncia.');
        }
    });

    initData().catch((error) => {
        if (error.status === 401) {
            api.clearSession();
            window.location.href = 'index.html';
            return;
        }
        window.alert(error.message || 'Erro ao carregar feed.');
    });

    ensureModalClosedOnLoad();
})();
