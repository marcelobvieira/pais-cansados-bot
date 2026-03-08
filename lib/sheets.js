import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// Instancia a autenticação uma única vez no cold start do Serverless
let serviceAccountAuth = null;
function getAuth() {
  if (serviceAccountAuth) return serviceAccountAuth;

  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';

  if (privateKey.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(privateKey);
      if (parsed.private_key) privateKey = parsed.private_key;
    } catch (e) { }
  }

  privateKey = privateKey.replace(/\\n/g, '\n');

  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.substring(1, privateKey.length - 1);
  }

  if (!privateKey.includes('\n')) {
    const header = '-----BEGIN PRIVATE KEY-----';
    const footer = '-----END PRIVATE KEY-----';
    if (privateKey.includes(header) && privateKey.includes(footer)) {
      let body = privateKey.replace(header, '').replace(footer, '');
      body = body.replace(/ /g, '');
      const matched = body.match(/.{1,64}/g);
      if (matched) {
        privateKey = `${header}\n${matched.join('\n')}\n${footer}\n`;
      }
    }
  }

  serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return serviceAccountAuth;
}

async function appendToSheet(tipo, data) {
  // Identificação do documento reutilizando o Auth Cacheado
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_DOCUMENT_ID, getAuth());
  await doc.loadInfo(); // carrega as propriedades do documento e abas

  // Seleciona a aba correta baseada no tipo (Filme ou Série)
  let sheet;
  if (tipo === 'Filme') {
    sheet = doc.sheetsByTitle['Filmes'];
  } else if (tipo === 'Série') {
    sheet = doc.sheetsByTitle['Séries'];
  }

  if (!sheet) {
    throw new Error(`Aba '${tipo === 'Filme' ? 'Filmes' : 'Séries'}' não foi encontrada na planilha.`);
  }

  // Mapeamento das colunas com base na estrutura solicitada
  let rowData = {};
  if (tipo === 'Filme') {
    rowData = {
      'Nome': data.nome,
      'Origem': data.pais,
      'Nota': data.nota,
      'Lançamento': data.lancamento,
      'Onde vimos': data.onde,
      'Mês': data.mes
    };
  } else {
    rowData = {
      'Nome': data.nome,
      'Origem': data.pais, // Atenção com o 'p' minúsculo conforme o request do usuário
      'Nota': data.nota,
      'Lançamento': data.lancamento,
      'Temporada': data.temporada, // Coluna exclusiva para Séries
      'Onde vimos': data.onde,
      'Mês': data.mes
    };
  }

  // Adiciona a nova linha
  await sheet.addRow(rowData);
}

export { appendToSheet };
