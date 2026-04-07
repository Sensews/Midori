(function () {
    'use strict';

    const TOKEN_KEY = 'midori.auth.token';
    const USER_KEY = 'midori.auth.user';
    const API_BASE_KEY = 'midori.api.base';
    const SESSION_MARKER = 'cookie-session';

    function getDefaultBaseUrl() {
        if (window.location.protocol === 'file:') {
            return 'http://localhost:4000/api';
        }
        return `${window.location.protocol}//${window.location.hostname}:4000/api`;
    }

    function getApiBaseUrl() {
        const runtimeBase = typeof window.MIDORI_API_BASE === 'string' ? window.MIDORI_API_BASE.trim() : '';
        if (runtimeBase) return runtimeBase.replace(/\/$/, '');

        const storedBase = window.localStorage.getItem(API_BASE_KEY);
        if (storedBase) return storedBase.replace(/\/$/, '');

        return getDefaultBaseUrl();
    }

    function setApiBaseUrl(baseUrl) {
        const clean = String(baseUrl || '').trim().replace(/\/$/, '');
        if (!clean) return;
        window.localStorage.setItem(API_BASE_KEY, clean);
    }

    function buildApiUrl(path) {
        const base = getApiBaseUrl();
        return `${base}${path.startsWith('/') ? path : `/${path}`}`;
    }

    function getToken() {
        return window.localStorage.getItem(TOKEN_KEY) || '';
    }

    function getUser() {
        const raw = window.localStorage.getItem(USER_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function setSession(token, user) {
        window.localStorage.setItem(TOKEN_KEY, SESSION_MARKER);
        if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearSession() {
        try {
            fetch(buildApiUrl('/auth/logout'), {
                method: 'POST',
                credentials: 'include',
            });
        } catch {
        }
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
    }

    async function rawRequest(path, options = {}) {
        const url = buildApiUrl(path);
        const headers = new Headers(options.headers || {});

        if (!options.isFormData && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }

        const response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body,
            credentials: 'include',
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        return { response, payload };
    }

    async function refreshSession() {
        const { response } = await rawRequest('/auth/refresh', {
            method: 'POST',
            body: JSON.stringify({}),
            skipAuthRefresh: true,
        });

        return response.ok;
    }

    async function request(path, options = {}) {
        const { response, payload } = await rawRequest(path, options);

        const isAuthPath = path.startsWith('/auth/login')
            || path.startsWith('/auth/register')
            || path.startsWith('/auth/refresh')
            || path.startsWith('/auth/logout');

        if (response.status === 401 && !options.skipAuthRefresh && !isAuthPath) {
            const refreshed = await refreshSession();
            if (refreshed) {
                const retried = await rawRequest(path, { ...options, skipAuthRefresh: true });
                if (retried.response.ok) {
                    return retried.payload;
                }

                const retryErrorMessage = retried.payload?.error || `Erro ${retried.response.status}`;
                const retryError = new Error(retryErrorMessage);
                retryError.status = retried.response.status;
                throw retryError;
            }

            clearSession();
        }

        if (!response.ok) {
            const errorMessage = payload?.error || `Erro ${response.status}`;
            const error = new Error(errorMessage);
            error.status = response.status;
            throw error;
        }

        return payload;
    }

    async function login(loginValue, password) {
        const data = await request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ login: loginValue, password }),
        });
        setSession(null, data.user);
        return data;
    }

    async function register({ email, username, displayName, password, cpf, phone }) {
        const data = await request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, username, displayName, password, cpf, phone }),
        });
        setSession(null, data.user);
        return data;
    }

    async function getMe() {
        return request('/auth/me');
    }

    async function getMyProfile() {
        return request('/profile/me');
    }

    async function getPublicProfile(username) {
        return request(`/profile/${encodeURIComponent(String(username || '').toLowerCase())}`);
    }

    async function updateMyProfile({ displayName, bio, cpf, phone }) {
        return request('/profile/me', {
            method: 'PUT',
            body: JSON.stringify({ displayName, bio, cpf, phone }),
        });
    }

    async function uploadMyAvatar(file) {
        const formData = new FormData();
        formData.append('avatar', file);

        return request('/profile/me/avatar', {
            method: 'POST',
            body: formData,
            isFormData: true,
        });
    }

    async function listPosts(params = {}) {
        const search = new URLSearchParams();
        if (params.type) search.set('type', params.type);
        if (params.author) search.set('author', params.author);
        const suffix = search.toString() ? `?${search}` : '';
        return request(`/posts${suffix}`);
    }

    async function getPost(postId) {
        return request(`/posts/${encodeURIComponent(postId)}`);
    }

    async function createPost({ title, description, type, imageFile }) {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('type', type);
        if (imageFile) formData.append('image', imageFile);

        return request('/posts', {
            method: 'POST',
            body: formData,
            isFormData: true,
        });
    }

    async function updatePost(postId, { title, description, isDonationCompleted, imageFile }) {
        const formData = new FormData();
        if (typeof title === 'string') formData.append('title', title);
        if (typeof description === 'string') formData.append('description', description);
        if (typeof isDonationCompleted !== 'undefined') {
            formData.append('isDonationCompleted', String(Boolean(isDonationCompleted)));
        }
        if (imageFile) formData.append('image', imageFile);

        return request(`/posts/${encodeURIComponent(postId)}`, {
            method: 'PUT',
            body: formData,
            isFormData: true,
        });
    }

    async function deletePost(postId, reason) {
        return request(`/posts/${encodeURIComponent(postId)}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason: reason || '' }),
        });
    }

    async function toggleLike(postId) {
        return request(`/posts/${encodeURIComponent(postId)}/likes`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    }

    async function addComment(postId, content) {
        return request(`/posts/${encodeURIComponent(postId)}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        });
    }

    async function getMyPostInteractions() {
        return request('/posts/interactions/me');
    }

    async function listThreads() {
        return request('/messages/threads');
    }

    async function getThreadMessages(threadId) {
        return request(`/messages/threads/${encodeURIComponent(threadId)}/messages`);
    }

    async function sendThreadMessage(threadId, content) {
        return request(`/messages/threads/${encodeURIComponent(threadId)}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        });
    }

    async function createMessageRequest(postId, introMessage) {
        return request('/messages/requests', {
            method: 'POST',
            body: JSON.stringify({ postId, introMessage }),
        });
    }

    async function listIncomingRequests() {
        return request('/messages/requests/incoming');
    }

    async function respondMessageRequest(requestId, accept) {
        return request(`/messages/requests/${encodeURIComponent(requestId)}/respond`, {
            method: 'POST',
            body: JSON.stringify({ accept: Boolean(accept) }),
        });
    }

    async function createReport({ targetUserId, postId, reason, details }) {
        return request('/reports', {
            method: 'POST',
            body: JSON.stringify({ targetUserId, postId, reason, details }),
        });
    }

    async function adminListReports(status) {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        const query = params.toString() ? `?${params}` : '';
        return request(`/admin/reports${query}`);
    }

    async function adminListReportsWithFilters({ status, username } = {}) {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (username) params.set('username', String(username).trim().toLowerCase());
        const query = params.toString() ? `?${params}` : '';
        return request(`/admin/reports${query}`);
    }

    async function adminUpdateReport(reportId, { status, adminNote }) {
        return request(`/admin/reports/${encodeURIComponent(reportId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status, adminNote }),
        });
    }

    async function adminBanUser(userId, reason) {
        return request(`/admin/users/${encodeURIComponent(userId)}/ban`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason || '' }),
        });
    }

    async function adminUnbanUser(userId) {
        return request(`/admin/users/${encodeURIComponent(userId)}/unban`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
    }

    async function adminListUsers(query) {
        const suffix = query ? `?query=${encodeURIComponent(String(query).trim().toLowerCase())}` : '';
        return request(`/admin/users${suffix}`);
    }

    async function adminDeletePost(postId, reason) {
        return request(`/admin/posts/${encodeURIComponent(postId)}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason: reason || '' }),
        });
    }

    window.MidoriApi = {
        TOKEN_KEY,
        USER_KEY,
        getApiBaseUrl,
        setApiBaseUrl,
        getToken,
        getUser,
        setSession,
        clearSession,
        login,
        register,
        getMe,
        getMyProfile,
        getPublicProfile,
        updateMyProfile,
        uploadMyAvatar,
        listPosts,
        getPost,
        createPost,
        updatePost,
        deletePost,
        toggleLike,
        addComment,
        getMyPostInteractions,
        listThreads,
        getThreadMessages,
        sendThreadMessage,
        createMessageRequest,
        listIncomingRequests,
        respondMessageRequest,
        createReport,
        adminListReports,
        adminListReportsWithFilters,
        adminUpdateReport,
        adminBanUser,
        adminUnbanUser,
        adminListUsers,
        adminDeletePost,
    };
})();
