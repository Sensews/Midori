(function () {
    'use strict';

    const api = window.MidoriApi;
    if (!api || !api.getToken()) {
        window.location.href = 'index.html';
        return;
    }

    const reportsEl = document.getElementById('admin-reports');
    const usersEl = document.getElementById('admin-users-list');
    const filterButtons = Array.from(document.querySelectorAll('.admin-filter'));
    const reportUsernameSearch = document.getElementById('report-username-search');
    const reportSearchBtn = document.getElementById('report-search-btn');
    const reportClearBtn = document.getElementById('report-clear-btn');
    const userSearchInput = document.getElementById('admin-user-search');
    const userSearchBtn = document.getElementById('admin-user-search-btn');
    const userClearBtn = document.getElementById('admin-user-clear-btn');

    const state = {
        me: null,
        reportStatus: 'ALL',
        reportUsername: '',
        userQuery: '',
        reports: [],
        users: [],
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

    function normalizeVisibleText(value) {
        return String(value || '').replace(/�/g, '').trim();
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        return date.toLocaleString('pt-BR');
    }

    function getStatusBadgeClass(status) {
        if (status === 'RESOLVED') return 'admin-report__badge admin-report__badge--resolved';
        if (status === 'REJECTED') return 'admin-report__badge admin-report__badge--rejected';
        return 'admin-report__badge admin-report__badge--pending';
    }

    function statusLabel(status) {
        if (status === 'RESOLVED') return 'Resolvida';
        if (status === 'REJECTED') return 'Rejeitada';
        return 'Pendente';
    }

    async function loadReports() {
        const response = await api.adminListReportsWithFilters({
            status: state.reportStatus === 'ALL' ? '' : state.reportStatus,
            username: state.reportUsername,
        });
        state.reports = Array.isArray(response.reports) ? response.reports : [];
    }

    async function loadUsers() {
        const response = await api.adminListUsers(state.userQuery);
        state.users = Array.isArray(response.users) ? response.users : [];
    }

    async function markReport(reportId, status) {
        const adminNote = window.prompt('Nota do administrador (opcional):') || '';
        await api.adminUpdateReport(reportId, { status, adminNote: adminNote.trim() });
        await loadReports();
        renderReports();
    }

    async function banUser(userId) {
        const reason = window.prompt('Motivo do banimento (opcional):') || '';
        await api.adminBanUser(userId, reason.trim());
        await Promise.all([loadReports(), loadUsers()]);
        renderReports();
        renderUsers();
    }

    async function unbanUser(userId) {
        await api.adminUnbanUser(userId);
        await loadUsers();
        renderUsers();
    }

    async function deletePost(postId) {
        const reason = window.prompt('Motivo da remoção do post (opcional):') || '';
        await api.adminDeletePost(postId, reason.trim());
        await loadReports();
        renderReports();
    }

    function renderReports() {
        if (!reportsEl) return;

        if (!state.reports.length) {
            reportsEl.innerHTML = '<p class="admin-empty">Nenhuma denúncia encontrada nesse filtro.</p>';
            return;
        }

        reportsEl.innerHTML = state.reports
            .map((report) => {
                const targetName = normalizeVisibleText(report.targetUser?.displayName || report.targetUser?.username || 'Usuário');
                const reporterName = normalizeVisibleText(report.reporter?.displayName || report.reporter?.username || 'Usuário');
                const reportReason = normalizeVisibleText(report.reason || '-');
                const reportDetails = normalizeVisibleText(report.details || '');
                const hasPost = Boolean(report.post?.id);
                const reportPostTitle = normalizeVisibleText(report.post?.title || 'Sem título');
                const reportPostDescription = normalizeVisibleText(report.post?.description || '');
                const targetUsername = report.targetUser?.username || '';
                const reporterUsername = report.reporter?.username || '';

                return `
                    <article class="admin-report" data-report-id="${report.id}">
                        <div class="admin-report__top">
                            <div>
                                <h2 class="admin-report__title">Denúncia: ${escapeHtml(reportReason)}</h2>
                                <p class="admin-report__meta">Denunciante: @${escapeHtml(reporterUsername)} (${escapeHtml(reporterName)}) • Denunciado: @${escapeHtml(targetUsername)} (${escapeHtml(targetName)}) • ${formatDate(report.createdAt)}</p>
                                ${reportDetails ? `<p class="admin-report__text">Detalhes: ${escapeHtml(reportDetails)}</p>` : ''}
                                ${report.adminNote ? `<p class="admin-report__text">Nota admin: ${escapeHtml(normalizeVisibleText(report.adminNote))}</p>` : ''}
                            </div>
                            <span class="${getStatusBadgeClass(report.status)}">${statusLabel(report.status)}</span>
                        </div>

                        <div class="admin-report__content">
                            <img class="admin-report__img" src="${escapeHtml(report.post?.imageUrl || report.targetUser?.avatarUrl || 'Assets/Mido.svg')}" alt="Conteúdo relacionado">
                            <div>
                                <p class="admin-report__postTitle">Perfil alvo: ${escapeHtml(targetName)}</p>
                                ${hasPost ? `<p class="admin-report__postTitle">Post: ${escapeHtml(reportPostTitle)}</p>` : '<p class="admin-report__postTitle">Denúncia sem post específico.</p>'}
                                ${hasPost ? `<p class="admin-report__postDesc">${escapeHtml(reportPostDescription)}</p>` : ''}
                                <p class="admin-report__meta">Revisado por: ${report.reviewedBy ? `@${escapeHtml(report.reviewedBy.username || 'admin')}` : '—'}</p>
                            </div>
                        </div>

                        <div class="admin-report__actions">
                            <button type="button" class="admin-action admin-action--link" data-action="open-profile" data-username="${escapeHtml(targetUsername)}">Ver perfil denunciado</button>
                            ${hasPost ? `<button type="button" class="admin-action admin-action--warn" data-action="delete-post" data-post-id="${report.post.id}">Apagar post</button>` : ''}
                            ${report.targetUser?.id ? `<button type="button" class="admin-action admin-action--warn" data-action="ban-user" data-user-id="${report.targetUser.id}">Banir usuário</button>` : ''}
                            <button type="button" class="admin-action admin-action--ok" data-action="resolve">Marcar resolvida</button>
                            <button type="button" class="admin-action admin-action--link" data-action="reject">Rejeitar</button>
                            <button type="button" class="admin-action admin-action--link" data-action="pending">Voltar para pendente</button>
                        </div>
                    </article>
                `;
            })
            .join('');

        reportsEl.querySelectorAll('.admin-action').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.dataset.action;
                const card = button.closest('.admin-report');
                const reportId = card?.dataset.reportId;

                try {
                    if (action === 'open-profile') {
                        const username = button.dataset.username;
                        if (!username) return;
                        window.location.href = `perfil-usuario.html?u=${encodeURIComponent(username)}`;
                        return;
                    }

                    if (action === 'ban-user') {
                        const userId = button.dataset.userId;
                        if (!userId) return;
                        const ok = window.confirm('Confirmar banimento do usuário denunciado?');
                        if (!ok) return;
                        await banUser(userId);
                        return;
                    }

                    if (action === 'delete-post') {
                        const postId = button.dataset.postId;
                        if (!postId) return;
                        const ok = window.confirm('Confirmar remoção da postagem denunciada?');
                        if (!ok) return;
                        await deletePost(postId);
                        return;
                    }

                    if (!reportId) return;
                    if (action === 'resolve') await markReport(reportId, 'RESOLVED');
                    if (action === 'reject') await markReport(reportId, 'REJECTED');
                    if (action === 'pending') await markReport(reportId, 'PENDING');
                } catch (error) {
                    window.alert(error.message || 'Erro ao executar ação de moderação.');
                }
            });
        });
    }

    function renderUsers() {
        if (!usersEl) return;

        if (!state.users.length) {
            usersEl.innerHTML = '<p class="admin-empty">Nenhum usuário encontrado para essa busca.</p>';
            return;
        }

        usersEl.innerHTML = state.users
            .map((user) => {
                const isBanned = user.role === 'BANNED';
                return `
                    <article class="admin-user">
                        <div>
                            <h3 class="admin-user__name">${escapeHtml(user.displayName || user.username)} (@${escapeHtml(user.username)})</h3>
                            <p class="admin-user__meta">${escapeHtml(user.email)} • Role: ${escapeHtml(user.role)} • ${user._count?.posts || 0} posts • ${user._count?.comments || 0} comentários</p>
                        </div>
                        <div class="admin-user__actions">
                            <button type="button" class="admin-action admin-action--link" data-user-action="open-profile" data-username="${escapeHtml(user.username)}">Ver perfil</button>
                            ${user.role === 'SUPERADMIN' ? '' : `<button type="button" class="admin-action admin-action--warn" data-user-action="ban" data-user-id="${user.id}">Banir</button>`}
                            ${isBanned ? `<button type="button" class="admin-action admin-action--ok" data-user-action="unban" data-user-id="${user.id}">Desbanir</button>` : ''}
                        </div>
                    </article>
                `;
            })
            .join('');

        usersEl.querySelectorAll('[data-user-action]').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.dataset.userAction;
                const userId = button.dataset.userId;
                const username = button.dataset.username;

                try {
                    if (action === 'open-profile') {
                        if (!username) return;
                        window.location.href = `perfil-usuario.html?u=${encodeURIComponent(username)}`;
                        return;
                    }

                    if (action === 'ban') {
                        const ok = window.confirm('Confirmar banimento deste usuário?');
                        if (!ok || !userId) return;
                        await banUser(userId);
                        return;
                    }

                    if (action === 'unban') {
                        const ok = window.confirm('Confirmar desbanimento deste usuário?');
                        if (!ok || !userId) return;
                        await unbanUser(userId);
                    }
                } catch (error) {
                    window.alert(error.message || 'Erro ao executar ação sobre usuário.');
                }
            });
        });
    }

    async function refreshReports() {
        await loadReports();
        renderReports();
    }

    async function refreshUsers() {
        await loadUsers();
        renderUsers();
    }

    function bindEvents() {
        filterButtons.forEach((button) => {
            button.addEventListener('click', async () => {
                state.reportStatus = button.dataset.status || 'ALL';
                filterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
                await refreshReports();
            });
        });

        reportSearchBtn?.addEventListener('click', async () => {
            state.reportUsername = String(reportUsernameSearch?.value || '').trim().toLowerCase();
            await refreshReports();
        });

        reportClearBtn?.addEventListener('click', async () => {
            state.reportUsername = '';
            if (reportUsernameSearch) reportUsernameSearch.value = '';
            await refreshReports();
        });

        reportUsernameSearch?.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            state.reportUsername = String(reportUsernameSearch.value || '').trim().toLowerCase();
            await refreshReports();
        });

        userSearchBtn?.addEventListener('click', async () => {
            state.userQuery = String(userSearchInput?.value || '').trim().toLowerCase();
            await refreshUsers();
        });

        userClearBtn?.addEventListener('click', async () => {
            state.userQuery = '';
            if (userSearchInput) userSearchInput.value = '';
            await refreshUsers();
        });

        userSearchInput?.addEventListener('keydown', async (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            state.userQuery = String(userSearchInput.value || '').trim().toLowerCase();
            await refreshUsers();
        });
    }

    async function init() {
        try {
            const meResponse = await api.getMe();
            state.me = meResponse.user;

            if (state.me.role !== 'SUPERADMIN') {
                window.location.href = 'home.html';
                return;
            }

            const params = new URLSearchParams(window.location.search);
            const fromUsername = String(params.get('u') || '').trim().toLowerCase();
            if (fromUsername) {
                state.reportUsername = fromUsername;
                if (reportUsernameSearch) reportUsernameSearch.value = fromUsername;
            }

            bindEvents();
            await Promise.all([refreshReports(), refreshUsers()]);
            document.documentElement.style.visibility = 'visible';
        } catch (error) {
            if (error.status === 401 || error.status === 403) {
                window.location.href = 'home.html';
                return;
            }
            window.alert(error.message || 'Erro ao carregar painel de denúncias.');
            window.location.href = 'home.html';
        }
    }

    init();
})();
