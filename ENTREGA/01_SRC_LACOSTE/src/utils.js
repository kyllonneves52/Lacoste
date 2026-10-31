const fs = require('fs');

const pathAlarmes = './data/alarmes.json';

// ====== CARREGAR ALARMES ======
function carregarAlarmes() {
  if (!fs.existsSync(pathAlarmes)) {
    fs.writeFileSync(pathAlarmes, JSON.stringify({}, null, 2));
  }

  return JSON.parse(fs.readFileSync(pathAlarmes, 'utf-8') || '{}');
}

// ====== SALVAR ALARMES ======
function salvarAlarmes(alarmes) {
  fs.writeFileSync(pathAlarmes, JSON.stringify(alarmes, null, 2));
}

module.exports = {
  carregarAlarmes,
  salvarAlarmes
};