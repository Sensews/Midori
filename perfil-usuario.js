(function () {
    'use strict';

    const api = window.MidoriApi;
    if (!api || !api.getToken()) {
        window.location.href = 'index.html';
        return;
    }

    const avatarEl = document.getElementById('public-avatar');
    const nameEl = document.getElementById('public-name');
    const usernameEl = document.getElementById('public-username');
    const bioEl = document.getElementById('public-bio');
    const statsEl = document.getElementById('public-stats');
    const postsEl = document.getElementById('public-posts');
    const reportUserBtn = document.getElementById('public-report-user');
    const adminActionsWrap = document.getElementById('public-admin-actions');
    const adminBanBtn = document.getElementById('public-admin-ban');
    const adminOpenBtn = document.getElementById('public-admin-open');

    const state = {
        me: null,
        username: '',
        profile: null,
    };

    function escapeHtml(value) {
        return String(value || '').replace(/[<>&"']/g, (char) => ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#39;',
        }[char]));
    }

    function parseUsername() {
        const params = new URLSearchParams(window.location.search);
        const user = String(params.get('u') || '').trim().toLowerCase();
        return user;
    }

    async function handleRequestMessage(postId) {
        if (!postId) return;
        const intro = window.prompt('Mensagem inicial (opcional):') || '';
        try {
            await api.createMessageRequest(postId, intro.trim());
            window.alert('Solicitação enviada com sucesso!');
        } catch (error) {
            window.alert(error.message || 'Erro ao enviar solicitação.');
        }
    }

    async function sendReport({ targetUserId, postId }) {
        if (state.me?.role === 'SUPERADMIN') {
            window.alert('Superadmin não pode criar denúncias.');
            return;
        }

        const reason = window.prompt('Motivo da denúncia (mínimo 4 caracteres):');
        if (!reason) return;

        const details = window.prompt('Detalhes (opcional):') || '';

        try {
            await api.createReport({
                targetUserId,
                postId,
                reason: reason.trim(),
                details: details.trim(),
            });
            window.alert('Denúncia enviada para análise da moderação.');
        } catch (error) {
            window.alert(error.message || 'Erro ao enviar denúncia.');
        }
    }

    function renderPosts(posts) {
        if (!postsEl) return;

        if (!posts.length) {
            postsEl.innerHTML = '<p class="public-empty">Esse usuário ainda não publicou posts.</p>';
            return;
        }

        const isOwnProfile = state.me?.username?.toLowerCase() === state.username;
        const isSuperAdmin = state.me?.role === 'SUPERADMIN';

        postsEl.innerHTML = posts
            .map((post) => {
                const typeLabel = post.type === 'EXHIBITION' ? 'Exposição' : 'Doação';
                return `
                    <article class="public-post-card" role="listitem">
                        <img class="public-post-image" src="${escapeHtml(post.imageUrl || 'Assets/Mido.svg')}" alt="Imagem da postagem">
                        <div class="public-post-body">
                            <span class="public-post-type">${typeLabel}</span>
                            <h3 class="public-post-title">${escapeHtml(post.title || 'Sem título')}</h3>
                            <p class="public-post-description">${escapeHtml(post.description || '')}</p>
                            <p class="public-post-stats">${post._count?.likes || 0} curtidas • ${post._count?.comments || 0} comentários</p>
                            ${isOwnProfile || isSuperAdmin ? '' : `<button type="button" class="public-post-action" data-post-id="${post.id}">Enviar solicitação de mensagem</button>`}
                            ${isOwnProfile || isSuperAdmin ? '' : `<button type="button" class="public-post-action public-post-action--report" data-report-post-id="${post.id}">Denunciar postagem</button>`}
                            ${isSuperAdmin && !isOwnProfile ? `<button type="button" class="public-post-action public-post-action--admin" data-admin-delete-post-id="${post.id}">Apagar post (admin)</button>` : ''}
                        </div>
                    </article>
                `;
            })
            .join('');

        postsEl.querySelectorAll('[data-post-id]').forEach((button) => {
            button.addEventListener('click', () => handleRequestMessage(button.dataset.postId));
        });

        postsEl.querySelectorAll('[data-report-post-id]').forEach((button) => {
            button.addEventListener('click', () => sendReport({
                targetUserId: state.profile?.id,
                postId: button.dataset.reportPostId,
            }));
        });

        postsEl.querySelectorAll('[data-admin-delete-post-id]').forEach((button) => {
            button.addEventListener('click', async () => {
                const postId = button.dataset.adminDeletePostId;
                if (!postId) return;
                const ok = window.confirm('Remover esta postagem como administrador?');
                if (!ok) return;
                try {
                    const reason = window.prompt('Motivo da remoção (opcional):') || '';
                    await api.adminDeletePost(postId, reason.trim());
                    const postsResponse = await api.listPosts({ author: state.username });
                    const refreshedPosts = Array.isArray(postsResponse.posts) ? postsResponse.posts : [];
                    renderPosts(refreshedPosts);
                } catch (error) {
                    window.alert(error.message || 'Erro ao apagar postagem.');
                }
            });
        });
    }

    async function init() {
        const username = parseUsername();
        if (!username) {
            window.location.href = 'home.html';
            return;
        }

        state.username = username;

        try {
            const [meResponse, profileResponse, postsResponse] = await Promise.all([
                api.getMe(),
                api.getPublicProfile(username),
                api.listPosts({ author: username }),
            ]);

            state.me = meResponse.user;

            const profile = profileResponse.profile;
            state.profile = profile;
            if (avatarEl) avatarEl.src = profile.avatarUrl || 'Assets/Mido.svg';
            if (nameEl) nameEl.textContent = profile.displayName || profile.username || 'Usuário';
            if (usernameEl) usernameEl.textContent = `@${profile.username}`;
            if (bioEl) bioEl.textContent = profile.bio || '';
            if (statsEl) {
                const postsCount = profile._count?.posts || 0;
                const commentsCount = profile._count?.comments || 0;
                statsEl.textContent = `${postsCount} posts • ${commentsCount} comentários`;
            }

            const posts = Array.isArray(postsResponse.posts) ? postsResponse.posts : [];
            renderPosts(posts);

            if (reportUserBtn) {
                const isOwnProfile = state.me?.username?.toLowerCase() === state.username;
                const isSuperAdmin = state.me?.role === 'SUPERADMIN';
                reportUserBtn.hidden = isOwnProfile || isSuperAdmin;
                reportUserBtn.onclick = () => sendReport({ targetUserId: profile.id, postId: null });
            }

            if (adminActionsWrap) {
                const isOwnProfile = state.me?.username?.toLowerCase() === state.username;
                const isSuperAdmin = state.me?.role === 'SUPERADMIN';
                adminActionsWrap.hidden = !isSuperAdmin || isOwnProfile;
            }

            adminOpenBtn?.addEventListener('click', () => {
                window.location.href = `admin-denuncias.html?u=${encodeURIComponent(state.username)}`;
            });

            adminBanBtn?.addEventListener('click', async () => {
                const userId = state.profile?.id;
                if (!userId) return;
                const ok = window.confirm('Banir este usuário?');
                if (!ok) return;
                try {
                    const reason = window.prompt('Motivo do banimento (opcional):') || '';
                    await api.adminBanUser(userId, reason.trim());
                    window.alert('Usuário banido com sucesso.');
                } catch (error) {
                    window.alert(error.message || 'Erro ao banir usuário.');
                }
            });
        } catch (error) {
            if (error.status === 401) {
                api.clearSession();
                window.location.href = 'index.html';
                return;
            }
            window.alert(error.message || 'Erro ao carregar perfil público.');
            window.location.href = 'home.html';
        }
    }

    init();
})();
