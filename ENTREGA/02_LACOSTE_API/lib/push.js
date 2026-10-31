'use strict';

// Mantém o fluxo FCM e os nomes dos eventos atuais.
// Acrescenta inicialização segura, retry de erros transitórios e diagnóstico.
const admin = require('firebase-admin');

function configured() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

function getApp() {
  if (!configured()) return null;
  const existing = admin.apps.find(a => a.name === '[DEFAULT]');
  if (existing) return existing;

  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n');
  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey
    })
  });
}

function errorCode(err) {
  return String(err?.code || err?.errorInfo?.code || 'unknown');
}

function retryable(err) {
  const code = errorCode(err);
  return /internal-error|server-unavailable|messaging\/server-unavailable|messaging\/internal-error|messaging\/unknown-error|ECONNRESET|ETIMEDOUT|EAI_AGAIN|429|503/i.test(code + ' ' + String(err?.message || ''));
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function notifyDevice(fcmToken, data = {}) {
  const token = String(fcmToken || '').trim();
  const a = getApp();
  if (!a) return { sent: false, reason: 'fcm_not_configured', retryable: false };
  if (!token) return { sent: false, reason: 'fcm_token_missing', retryable: false };

  const payload = {
    token,
    // Preserva os tipos e nomes de evento existentes; FCM data exige strings.
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v ?? '')])),
    android: { priority: 'high', ttl: 5 * 60 * 1000 }
  };

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const messageId = await admin.messaging(a).send(payload);
      return { sent: true, messageId, attempts: attempt };
    } catch (err) {
      lastError = err;
      const code = errorCode(err);
      console.error('FCM SEND ERROR', JSON.stringify({ code, attempt, message: String(err?.message || err) }));
      if (attempt >= 3 || !retryable(err)) {
        // Não apagamos nem substituímos automaticamente o token guardado.
        // O app pode voltar a registá-lo; assim evitamos quebrar instalações válidas.
        return {
          sent: false,
          reason: code,
          message: String(err?.message || 'Falha ao enviar notificação FCM'),
          retryable: retryable(err),
          invalidToken: /registration-token-not-registered|invalid-registration-token|messaging\/invalid-registration-token/i.test(code),
          attempts: attempt
        };
      }
      await sleep(250 * attempt);
    }
  }
  return { sent: false, reason: errorCode(lastError), retryable: true, attempts: 3 };
}

module.exports = { notifyDevice, configured };
