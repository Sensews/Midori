(function () {
    'use strict';

    // Midori E2EE v1
    // - User key: RSA-OAEP 2048 (encrypt/decrypt)
    // - Conversation key: AES-GCM 256
    // - Hybrid: wraps AES raw key with recipient RSA public key

    const E2EE = {};

    const LS_PRIVATE_ENVELOPE = 'midori.e2ee.private.envelope.v1';
    const LS_PRIVATE_SALT = 'midori.e2ee.private.salt.v1';
    const LS_PUBLIC_JWK = 'midori.e2ee.public.jwk.v1';

    const DB_NAME = 'midori-e2ee';
    const DB_VERSION = 1;

    const STORE_KEYS = 'keys';
    const STORE_CONVERSATIONS = 'conversationKeys';

    function stableStringify(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }

    async function sha256Base64(bytes) {
        const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes));
        return bytesToBase64(digest);
    }

    async function jwkFingerprint(jwk) {
        const canonical = stableStringify(jwk);
        return sha256Base64(textToBytes(canonical));
    }

    function contactKeyStorageKey(myUserId, contactUserId) {
        return `midori.e2ee.contactkey.v1.${String(myUserId || 'unknown')}.${String(contactUserId || 'unknown')}`;
    }

    async function ensureTrustedContactKey({ myUserId, contactUserId, contactPublicJwk }) {
        if (!myUserId || !contactUserId || !contactPublicJwk) return;

        const fp = await jwkFingerprint(contactPublicJwk);
        const key = contactKeyStorageKey(myUserId, contactUserId);

        let saved = null;
        try {
            saved = window.localStorage.getItem(key);
        } catch {
            saved = null;
        }

        if (!saved) {
            try {
                window.localStorage.setItem(key, fp);
            } catch {
            }
            return;
        }

        if (saved !== fp) {
            const ok = window.confirm(
                'Aviso de segurança: a chave de criptografia do contato mudou.\n\n'
                + 'Isso pode indicar troca de dispositivo, redefinição de conta ou ataque.\n\n'
                + 'Deseja confiar na nova chave e continuar?'
            );

            if (!ok) {
                throw new Error('Chave do contato mudou. Envio/decifra bloqueados por segurança.');
            }

            try {
                window.localStorage.setItem(key, fp);
            } catch {
            }
        }
    }

    function hasWebCrypto() {
        return Boolean(window.crypto && window.crypto.subtle);
    }

    function textToBytes(text) {
        return new TextEncoder().encode(String(text));
    }

    function bytesToText(bytes) {
        return new TextDecoder().decode(bytes);
    }

    function bytesToBase64(bytes) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    function base64ToBytes(base64) {
        const clean = String(base64 || '').trim();
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function randomBytes(length) {
        const buf = new Uint8Array(length);
        window.crypto.getRandomValues(buf);
        return buf;
    }

    function openDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE_KEYS)) {
                    db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
                    db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'conversationId' });
                }
            };
            req.onsuccess = () => resolve(req.result);
        });
    }

    async function dbGet(storeName, key) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(key);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result || null);
        });
    }

    async function dbPut(storeName, value) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(value);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
        });
    }

    async function getDevicePrivateKey() {
        const row = await dbGet(STORE_KEYS, 'rsa-private');
        return row?.key || null;
    }

    async function getDevicePublicKey() {
        const row = await dbGet(STORE_KEYS, 'rsa-public');
        return row?.key || null;
    }

    async function setDeviceKeypair(publicKey, privateKey) {
        await dbPut(STORE_KEYS, { id: 'rsa-public', key: publicKey });
        await dbPut(STORE_KEYS, { id: 'rsa-private', key: privateKey });
    }

    async function getConversationAesKey(conversationId) {
        const row = await dbGet(STORE_CONVERSATIONS, String(conversationId));
        return row?.key || null;
    }

    async function setConversationAesKey(conversationId, aesKey) {
        await dbPut(STORE_CONVERSATIONS, { conversationId: String(conversationId), key: aesKey });
    }

    async function deriveWrappingKeyFromPassword(password, saltBytes) {
        const baseKey = await window.crypto.subtle.importKey(
            'raw',
            textToBytes(password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
        );

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: 250000,
                hash: 'SHA-256',
            },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptPrivateJwkWithPassword(privateJwk, password) {
        const salt = randomBytes(16);
        const iv = randomBytes(12);
        const wrappingKey = await deriveWrappingKeyFromPassword(password, salt);

        const plaintext = textToBytes(JSON.stringify(privateJwk));
        const ciphertext = new Uint8Array(await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            wrappingKey,
            plaintext
        ));

        return {
            salt: bytesToBase64(salt),
            envelope: JSON.stringify({
                v: 1,
                t: 'midori.e2ee.private',
                alg: 'AES-GCM',
                iv: bytesToBase64(iv),
                ct: bytesToBase64(ciphertext),
            }),
        };
    }

    async function decryptPrivateJwkWithPassword(envelopeJson, saltBase64, password) {
        const salt = base64ToBytes(saltBase64);
        const wrappingKey = await deriveWrappingKeyFromPassword(password, salt);

        const envelope = JSON.parse(String(envelopeJson || ''));
        if (!envelope || envelope.v !== 1 || envelope.t !== 'midori.e2ee.private') {
            throw new Error('Envelope de chave privada inválido.');
        }

        const iv = base64ToBytes(envelope.iv);
        const ct = base64ToBytes(envelope.ct);

        const plaintext = new Uint8Array(await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            wrappingKey,
            ct
        ));

        return JSON.parse(bytesToText(plaintext));
    }

    async function generateUserKeypair() {
        return window.crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256',
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    async function exportPublicJwk(publicKey) {
        return window.crypto.subtle.exportKey('jwk', publicKey);
    }

    async function exportPrivateJwk(privateKey) {
        return window.crypto.subtle.exportKey('jwk', privateKey);
    }

    async function importPublicJwk(jwk) {
        return window.crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true,
            ['encrypt']
        );
    }

    async function importPrivateJwk(jwk) {
        return window.crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['decrypt']
        );
    }

    async function ensureUserKeys({ api, password }) {
        if (!hasWebCrypto()) {
            throw new Error('WebCrypto indisponível neste navegador.');
        }
        if (!api) {
            throw new Error('API client não encontrado para E2EE.');
        }

        // If device has private key already, just ensure public key is registered.
        const existingPrivate = await getDevicePrivateKey();
        const existingPublic = await getDevicePublicKey();

        if (existingPrivate && existingPublic) {
            try {
                const publicJwk = await exportPublicJwk(existingPublic);
                window.localStorage.setItem(LS_PUBLIC_JWK, JSON.stringify(publicJwk));
                // Best-effort registration (idempotent)
                const envelope = window.localStorage.getItem(LS_PRIVATE_ENVELOPE);
                const salt = window.localStorage.getItem(LS_PRIVATE_SALT);
                const payload = { publicKeyJwk: publicJwk };
                if (envelope && salt) {
                    payload.encryptedPrivateKey = envelope;
                    payload.privateKeySalt = salt;
                }
                await api.putMyE2eeKeys(payload);
            } catch {
                // ignore
            }
            return { publicKey: existingPublic, privateKey: existingPrivate };
        }

        // Try to restore from local encrypted backup
        const localEnvelope = window.localStorage.getItem(LS_PRIVATE_ENVELOPE);
        const localSalt = window.localStorage.getItem(LS_PRIVATE_SALT);
        if (localEnvelope && localSalt && password) {
            const privateJwk = await decryptPrivateJwkWithPassword(localEnvelope, localSalt, password);
            const privateKey = await importPrivateJwk(privateJwk);

            let publicJwk = null;
            try {
                const localPublicRaw = window.localStorage.getItem(LS_PUBLIC_JWK);
                if (localPublicRaw) publicJwk = JSON.parse(localPublicRaw);
            } catch {
                publicJwk = null;
            }

            let publicKey = null;
            if (publicJwk) {
                publicKey = await importPublicJwk(publicJwk);
            } else {
                // If we can't restore public key, regenerate from server or new keypair.
                publicKey = null;
            }

            if (!publicKey) {
                const serverKeys = await api.getMyE2eeKeys().catch(() => null);
                const serverPublicJwk = serverKeys?.keys?.publicKeyJwk || null;
                if (serverPublicJwk) {
                    publicKey = await importPublicJwk(serverPublicJwk);
                    publicJwk = serverPublicJwk;
                }
            }

            if (!publicKey) {
                // As a fallback, create a new keypair.
                const pair = await generateUserKeypair();
                publicKey = pair.publicKey;
                const exportedPublic = await exportPublicJwk(publicKey);
                window.localStorage.setItem(LS_PUBLIC_JWK, JSON.stringify(exportedPublic));
            }

            await setDeviceKeypair(publicKey, privateKey);

            // Re-register public key to backend if needed
            if (publicJwk) {
                await api.putMyE2eeKeys({
                    publicKeyJwk: publicJwk,
                    encryptedPrivateKey: localEnvelope,
                    privateKeySalt: localSalt,
                }).catch(() => null);
            }

            return { publicKey, privateKey };
        }

        // Try to restore from server backup
        if (password) {
            const serverKeys = await api.getMyE2eeKeys().catch(() => null);
            const serverPublicJwk = serverKeys?.keys?.publicKeyJwk || null;
            const serverEnvelope = serverKeys?.keys?.encryptedPrivateKey || null;
            const serverSalt = serverKeys?.keys?.privateKeySalt || null;

            if (serverEnvelope && serverSalt) {
                const privateJwk = await decryptPrivateJwkWithPassword(serverEnvelope, serverSalt, password);
                const privateKey = await importPrivateJwk(privateJwk);

                let publicKey = null;
                if (serverPublicJwk) {
                    publicKey = await importPublicJwk(serverPublicJwk);
                } else {
                    // If server has no public key, generate a new pair.
                    const pair = await generateUserKeypair();
                    publicKey = pair.publicKey;
                }

                // Persist locally too.
                window.localStorage.setItem(LS_PRIVATE_ENVELOPE, serverEnvelope);
                window.localStorage.setItem(LS_PRIVATE_SALT, serverSalt);
                if (serverPublicJwk) window.localStorage.setItem(LS_PUBLIC_JWK, JSON.stringify(serverPublicJwk));

                await setDeviceKeypair(publicKey, privateKey);
                return { publicKey, privateKey };
            }
        }

        if (!password) {
            throw new Error('Chaves E2EE não disponíveis neste dispositivo. Faça login novamente para restaurar.');
        }

        // New user / first device: generate and upload
        const pair = await generateUserKeypair();
        await setDeviceKeypair(pair.publicKey, pair.privateKey);

        const publicJwk = await exportPublicJwk(pair.publicKey);
        window.localStorage.setItem(LS_PUBLIC_JWK, JSON.stringify(publicJwk));

        const privateJwk = await exportPrivateJwk(pair.privateKey);
        const encrypted = await encryptPrivateJwkWithPassword(privateJwk, password);
        window.localStorage.setItem(LS_PRIVATE_ENVELOPE, encrypted.envelope);
        window.localStorage.setItem(LS_PRIVATE_SALT, encrypted.salt);

        await api.putMyE2eeKeys({
            publicKeyJwk: publicJwk,
            encryptedPrivateKey: encrypted.envelope,
            privateKeySalt: encrypted.salt,
        }).catch(() => null);

        return { publicKey: pair.publicKey, privateKey: pair.privateKey };
    }

    async function ensureConversationKey({ api, thread, myUserId }) {
        if (!api) throw new Error('API client não encontrado.');
        if (!thread || !thread.id) throw new Error('Thread inválida.');

        const existing = await getConversationAesKey(thread.id);
        if (existing) return existing;

        const serverKeyResp = await api.getThreadKey(thread.id);
        const serverKey = serverKeyResp?.key || null;
        const myPrivate = await getDevicePrivateKey();
        if (!myPrivate) throw new Error('Chave privada E2EE não encontrada neste dispositivo.');

        if (serverKey && serverKey.wrappedKey) {
            const wrappedBytes = base64ToBytes(serverKey.wrappedKey);
            const raw = new Uint8Array(await window.crypto.subtle.decrypt(
                { name: 'RSA-OAEP' },
                myPrivate,
                wrappedBytes
            ));
            const aesKey = await window.crypto.subtle.importKey(
                'raw',
                raw,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            await setConversationAesKey(thread.id, aesKey);
            return aesKey;
        }

        // No key on server yet: initialize.
        const participants = Array.isArray(thread.participants) ? thread.participants : [];
        const other = participants.find((p) => p && p.id && p.id !== myUserId) || participants[0] || null;
        if (!other?.id) {
            throw new Error('Não foi possível identificar o participante da conversa.');
        }

        const otherPublicJwk = other.publicKeyJwk || null;
        if (!otherPublicJwk) {
            throw new Error('O outro usuário ainda não possui chave pública E2EE.');
        }

        await ensureTrustedContactKey({
            myUserId,
            contactUserId: other.id,
            contactPublicJwk: otherPublicJwk,
        });

        const myPublic = await getDevicePublicKey();
        if (!myPublic) throw new Error('Chave pública E2EE não encontrada neste dispositivo.');

        const myPublicJwkRaw = window.localStorage.getItem(LS_PUBLIC_JWK);
        const myPublicJwk = myPublicJwkRaw ? JSON.parse(myPublicJwkRaw) : await exportPublicJwk(myPublic);

        const otherPublic = await importPublicJwk(otherPublicJwk);

        const aesKey = await window.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );

        const rawAes = new Uint8Array(await window.crypto.subtle.exportKey('raw', aesKey));

        const wrapFor = async (publicKey) => {
            const wrapped = new Uint8Array(await window.crypto.subtle.encrypt(
                { name: 'RSA-OAEP' },
                publicKey,
                rawAes
            ));
            return bytesToBase64(wrapped);
        };

        const wrappedForMe = await wrapFor(await importPublicJwk(myPublicJwk));
        const wrappedForOther = await wrapFor(otherPublic);

        await api.putThreadKey(thread.id, {
            keys: [
                { userId: myUserId, wrappedKey: wrappedForMe, algorithm: 'RSA-OAEP' },
                { userId: other.id, wrappedKey: wrappedForOther, algorithm: 'RSA-OAEP' },
            ],
        });

        await setConversationAesKey(thread.id, aesKey);
        return aesKey;
    }

    function parseEncryptedMessageEnvelope(content) {
        if (!content || typeof content !== 'string') return null;
        const trimmed = content.trim();
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && parsed.v === 1 && parsed.t === 'midori.e2ee.message' && parsed.iv && parsed.ct) {
                return parsed;
            }
            return null;
        } catch {
            return null;
        }
    }

    async function encryptMessage(aesKey, plaintext) {
        const iv = randomBytes(12);
        const ct = new Uint8Array(await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            textToBytes(plaintext)
        ));
        return JSON.stringify({
            v: 1,
            t: 'midori.e2ee.message',
            alg: 'AES-GCM',
            iv: bytesToBase64(iv),
            ct: bytesToBase64(ct),
        });
    }

    async function decryptMessage(aesKey, encryptedContent) {
        const env = parseEncryptedMessageEnvelope(encryptedContent);
        if (!env) return String(encryptedContent || '');

        const iv = base64ToBytes(env.iv);
        const ct = base64ToBytes(env.ct);
        const pt = new Uint8Array(await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            aesKey,
            ct
        ));
        return bytesToText(pt);
    }

    E2EE.ensureUserKeys = ensureUserKeys;
    E2EE.ensureConversationKey = ensureConversationKey;
    E2EE.encryptMessage = encryptMessage;
    E2EE.decryptMessage = decryptMessage;
    E2EE.parseEncryptedMessageEnvelope = parseEncryptedMessageEnvelope;

    window.MidoriE2EE = E2EE;
})();
