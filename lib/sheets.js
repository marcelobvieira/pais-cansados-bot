import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

async function appendToSheet(tipo, data) {
  // Inicialização da Autenticação via Service Account
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  // Identificação do documento
  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_DOCUMENT_ID, serviceAccountAuth);
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
      'País de Origem': data.pais,
      'Nota': data.nota,
      'Lançamento': data.lancamento,
      'Onde vimos': data.onde,
      'Mês': data.mes
    };
  } else {
    rowData = {
      'Nome': data.nome,
      'país de Origem': data.pais, // Atenção com o 'p' minúsculo conforme o request do usuário
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
