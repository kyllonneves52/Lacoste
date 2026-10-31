const { iniciar } = require('./connect');

// O bot deve registrar erros fatais para sabermos a causa em vez de
// simplesmente desaparecer do servidor.
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION — BOT NÃO SERÁ ENCERRADO');
  console.error(err?.stack || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('🔥 UNHANDLED REJECTION — BOT NÃO SERÁ ENCERRADO');
  console.error(reason?.stack || reason);
});

process.on('warning', (warning) => {
  console.warn('⚠️ NODE WARNING:', warning?.stack || warning);
});

console.log("Iniciando Lacoste Bot V7...");

iniciar().then(() => {
  // App pode pedir código de pareamento; o bot gera e publica na API.
  const sistemaVendas = require('./sistemaVendas');
  const tick = () => {
    if (sistemaVendas.processarPareamentosPendentes) {
      sistemaVendas.processarPareamentosPendentes().catch(() => {});
    }
  };
  setTimeout(tick, 8000);
  setInterval(tick, 20000);
  console.log('📲 Listener de códigos pedidos pelo APP activo (20s).');
}).catch((err) => {
  console.error('❌ Falha ao iniciar o bot:', err?.stack || err);
});
