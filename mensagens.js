(function () {
    'use strict';

    const api = window.MidoriApi;

    if (!api || !api.getToken()) {
        window.location.href = 'index.html';
        return;
    }

    const conversationList = document.getElementById('conversation-list');
    const requestList = document.getElementById('request-list');
    const searchInput = document.getElementById('conversation-search');
    const chatHeadName = document.getElementById('chat-name');
    const chatHeadStatus = document.getElementById('chat-status');
    const chatAvatar = document.getElementById('chat-avatar');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    const homeShortcut = document.getElementById('home-shortcut');

    const state = {
        query: '',
        threads: [],
        requests: [],
        activeThreadId: null,
        messagesByThread: {},
        me: null,
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

    function formatTime(ts) {
        const date = new Date(ts);
        return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function getActiveThread() {
        return state.threads.find((thread) => thread.id === state.activeThreadId) || null;
    }

    function renderRequests() {
        if (!requestList) return;

        if (!state.requests.length) {
            requestList.innerHTML = '<p class="chat-empty">Nenhuma solicitação pendente.</p>';
            return;
        }

        requestList.innerHTML = state.requests
            .map((request) => {
                const requesterName = request.requester?.displayName || request.requester?.username || 'Usuário';
                const postTitle = request.post?.title || 'postagem';
                return `
                    <article class="request-item" data-request-id="${request.id}">
                        <p><strong>${escapeHtml(requesterName)}</strong> está enviando uma solicitação de mensagem sobre <strong>${escapeHtml(postTitle)}</strong>.</p>
                        <div class="request-item__actions">
                            <button type="button" class="request-item__btn request-item__btn--accept" data-action="accept">Aceitar</button>
                            <button type="button" class="request-item__btn request-item__btn--decline" data-action="decline">Recusar</button>
                        </div>
                    </article>
                `;
            })
            .join('');

        requestList.querySelectorAll('.request-item__btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const action = button.dataset.action;
                const card = button.closest('.request-item');
                const requestId = card?.dataset.requestId;
                if (!requestId) return;

                try {
                    const response = await api.respondMessageRequest(requestId, action === 'accept');
                    state.requests = state.requests.filter((request) => request.id !== requestId);
                    renderRequests();

                    if (action === 'accept' && response.conversationId) {
                        await loadThreads();
                        state.activeThreadId = response.conversationId;
                        await loadThreadMessages(response.conversationId);
                        renderConversationList();
                        renderActiveChat();
                    }
                } catch (error) {
                    window.alert(error.message || 'Erro ao responder solicitação.');
                }
            });
        });
    }

    function renderConversationList() {
        const query = state.query.toLowerCase().trim();

        const filtered = state.threads.filter((thread) => {
            const person = thread.participants?.[0];
            const name = (person?.displayName || person?.username || 'Usuário').toLowerCase();
            return name.includes(query);
        });

        conversationList.innerHTML = '';

        filtered.forEach((thread) => {
            const person = thread.participants?.[0];
            const name = person?.displayName || person?.username || 'Usuário';
            const preview = thread.lastMessage?.content || 'Sem mensagens';

            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `conversation-item${thread.id === state.activeThreadId ? ' is-active' : ''}`;
            button.innerHTML = `
                <span class="conversation-item__name">${escapeHtml(name)}</span>
                <span class="conversation-item__preview">${escapeHtml(preview)}</span>
            `;

            button.addEventListener('click', async () => {
                state.activeThreadId = thread.id;
                renderConversationList();
                await loadThreadMessages(thread.id);
                renderActiveChat();
            });

            item.appendChild(button);
            conversationList.appendChild(item);
        });
    }

    function renderActiveChat() {
        const active = getActiveThread();

        if (!active) {
            chatHeadName.textContent = 'Selecione uma conversa';
            chatHeadStatus.textContent = 'Sem conversa ativa';
            chatAvatar.textContent = 'M';
            chatMessages.innerHTML = '<p class="chat-empty">Escolha uma conversa para começar a trocar mensagens.</p>';
            chatInput.disabled = true;
            chatSend.disabled = true;
            return;
        }

        const person = active.participants?.[0];
        const name = person?.displayName || person?.username || 'Usuário';

        chatHeadName.textContent = name;
        chatHeadStatus.textContent = active.lastMessage ? `Última mensagem ${formatTime(active.lastMessage.createdAt)}` : 'Conversa iniciada';
        chatAvatar.textContent = name.charAt(0).toUpperCase();
        chatInput.disabled = false;
        chatSend.disabled = false;

        const messages = state.messagesByThread[active.id] || [];
        chatMessages.innerHTML = messages
            .map((msg) => {
                const outgoing = msg.sender?.id === state.me?.id;
                return `
                    <article class="message message--${outgoing ? 'outgoing' : 'incoming'}">
                        <p>${escapeHtml(msg.content)}</p>
                        <div class="message__time">${formatTime(msg.createdAt)}</div>
                    </article>
                `;
            })
            .join('');

        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function loadThreadMessages(threadId) {
        const response = await api.getThreadMessages(threadId);
        state.messagesByThread[threadId] = Array.isArray(response.messages) ? response.messages : [];
    }

    async function loadThreads() {
        const threadsResponse = await api.listThreads();
        state.threads = Array.isArray(threadsResponse.threads) ? threadsResponse.threads : [];
        if (!state.activeThreadId) {
            state.activeThreadId = state.threads[0]?.id || null;
        }
    }

    async function loadRequests() {
        const response = await api.listIncomingRequests();
        state.requests = Array.isArray(response.requests) ? response.requests : [];
    }

    async function handleSendMessage(e) {
        e.preventDefault();

        const active = getActiveThread();
        if (!active) return;

        const content = chatInput.value.trim();
        if (!content) return;

        try {
            const response = await api.sendThreadMessage(active.id, content);
            const message = response.message;

            if (!state.messagesByThread[active.id]) {
                state.messagesByThread[active.id] = [];
            }

            state.messagesByThread[active.id].push(message);
            active.lastMessage = message;
            chatInput.value = '';

            renderConversationList();
            renderActiveChat();
        } catch (error) {
            window.alert(error.message || 'Erro ao enviar mensagem.');
        }
    }

    async function init() {
        try {
            const meResponse = await api.getMe();
            state.me = meResponse.user;

            await Promise.all([
                loadThreads(),
                loadRequests(),
            ]);

            if (state.activeThreadId) {
                await loadThreadMessages(state.activeThreadId);
            }

            renderRequests();
            renderConversationList();
            renderActiveChat();

            searchInput.addEventListener('input', (e) => {
                state.query = e.target.value || '';
                renderConversationList();
            });

            chatForm.addEventListener('submit', handleSendMessage);

            if (homeShortcut) {
                homeShortcut.addEventListener('click', (e) => {
                    const href = homeShortcut.getAttribute('href');
                    if (!href || href === '#') {
                        e.preventDefault();
                    }
                });
            }
        } catch (error) {
            if (error.status === 401) {
                api.clearSession();
                window.location.href = 'index.html';
                return;
            }
            window.alert(error.message || 'Erro ao carregar mensagens.');
        }
    }

    init();
})();
