(function () {
    'use strict';

    const TOKEN_KEY = 'midori.auth.token';
    const USER_KEY = 'midori.auth.user';
    const API_BASE_KEY = 'midori.api.base';

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
        if (token) window.localStorage.setItem(TOKEN_KEY, token);
        if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function clearSession() {
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(USER_KEY);
    }

    async function request(path, options = {}) {
        const base = getApiBaseUrl();
        const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
        const token = getToken();
        const headers = new Headers(options.headers || {});

        if (!options.isFormData) {
            headers.set('Content-Type', 'application/json');
        }

        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body,
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
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
        setSession(data.token, data.user);
        return data;
    }

    async function register({ email, username, displayName, password }) {
        const data = await request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, username, displayName, password }),
        });
        setSession(data.token, data.user);
        return data;
    }

    async function getMe() {
        return request('/auth/me');
    }

    async function getMyProfile() {
        return request('/profile/me');
    }

    async function updateMyProfile({ displayName, bio }) {
        return request('/profile/me', {
            method: 'PUT',
            body: JSON.stringify({ displayName, bio }),
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
        updateMyProfile,
        uploadMyAvatar,
        listPosts,
        getPost,
        createPost,
        updatePost,
        deletePost,
        toggleLike,
        addComment,
        listThreads,
        getThreadMessages,
        sendThreadMessage,
    };
})();
