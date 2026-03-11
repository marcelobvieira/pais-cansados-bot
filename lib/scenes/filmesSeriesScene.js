import { Scenes, Markup } from 'telegraf';
import { appendToSheet } from '../sheets.js';
import { searchTMDB, getTMDBDetails, extractCountryAndYear } from '../tmdb.js';

// Cena do Wizard para Filmes e Séries
export const entryWizard = new Scenes.WizardScene(
  'ENTRY_WIZARD',
  async (ctx) => {
    await ctx.reply('🎬 O que você terminou de assistir?', Markup.keyboard(['Filme', 'Série']).oneTime().resize());
    ctx.wizard.state.entryData = {};
    return ctx.wizard.next();
  },
  async (ctx) => {
    const tipo = ctx.message?.text;
    if (tipo !== 'Filme' && tipo !== 'Série') {
      await ctx.reply('Por favor, escolha Filme ou Série usando os botões da tela.');
      return;
    }
    ctx.wizard.state.entryData.tipo = tipo;
    await ctx.reply(`Ótimo! Qual o NOME d${tipo === 'Filme' ? 'o filme' : 'a série'}?`, Markup.removeKeyboard());
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.entryData.nome = ctx.message?.text;
    await ctx.reply('🔍 Buscando informações no TMDB...');
    
    const tipo = ctx.wizard.state.entryData.tipo;
    const query = ctx.wizard.state.entryData.nome;
    const tmdbType = tipo === 'Filme' ? 'movie' : 'tv';
    
    try {
      const results = await searchTMDB(query, tmdbType);
      
      if (results.length === 0) {
        await ctx.reply('Nenhum resultado encontrado no TMDB. Digite o PAÍS DE ORIGEM manualmente: 🌍');
        return ctx.wizard.next();
      } else if (results.length === 1) {
        // Fetch details automatically
        const details = await getTMDBDetails(results[0].id, tmdbType);
        const { country, year } = extractCountryAndYear(details, tmdbType);
        ctx.wizard.state.entryData.nome = details.title || details.name;
        ctx.wizard.state.entryData.pais = country || 'Desconhecido';
        ctx.wizard.state.entryData.lancamento = year || 'Desconhecido';
        await ctx.reply(`✅ Encontrei: ${details.title || details.name} (${year}) - ${country}\n\nQual a sua NOTA? ⭐`, Markup.keyboard([
          ['1', '2', '3', '4', '5']
        ]).oneTime().resize());
        return ctx.wizard.selectStep(5); // Skip to rating step
      } else {
        // Multiple results, show selection
        const options = results.slice(0, 5).map((result, index) => 
          `${index + 1}. ${result.title || result.name} (${(result.release_date || result.first_air_date)?.split('-')[0] || 'N/A'})`
        ).join('\n');
        
        await ctx.reply(`Encontrei várias opções:\n${options}\n\nDigite o número da opção correta (1-${Math.min(5, results.length)}), ou 0 para inserir manualmente:`, Markup.removeKeyboard());
        ctx.wizard.state.tmdbResults = results.slice(0, 5);
        return ctx.wizard.next();
      }
    } catch (error) {
      console.error('TMDB error:', error);
      await ctx.reply('Erro ao buscar no TMDB. Digite o PAÍS DE ORIGEM manualmente: 🌍');
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    // Handle selection or manual entry
    const input = ctx.message?.text;
    const results = ctx.wizard.state.tmdbResults;
    
    if (results && input && !isNaN(input)) {
      const choice = parseInt(input);
      if (choice === 0) {
        // Manual entry
        await ctx.reply('Digite o PAÍS DE ORIGEM: 🌍');
        return ctx.wizard.next();
      } else if (choice >= 1 && choice <= results.length) {
        // Fetch selected details
        const selected = results[choice - 1];
        const tmdbType = ctx.wizard.state.entryData.tipo === 'Filme' ? 'movie' : 'tv';
        const details = await getTMDBDetails(selected.id, tmdbType);
        const { country, year } = extractCountryAndYear(details, tmdbType);
        ctx.wizard.state.entryData.nome = details.title || details.name;
        ctx.wizard.state.entryData.pais = country || 'Desconhecido';
        ctx.wizard.state.entryData.lancamento = year || 'Desconhecido';
        await ctx.reply(`✅ Selecionado: ${details.title || details.name} (${year}) - ${country}\n\nQual a sua NOTA? ⭐`, Markup.keyboard([
          ['1', '2', '3', '4', '5']
        ]).oneTime().resize());
        return ctx.wizard.selectStep(5); // Skip to rating step
      }
    }
    
    // Invalid input or manual
    await ctx.reply('Digite o PAÍS DE ORIGEM: 🌍');
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.entryData.pais = ctx.message?.text;
    await ctx.reply('Qual a sua NOTA? ⭐', Markup.keyboard([
      ['1', '2', '3', '4', '5']
    ]).oneTime().resize());
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.entryData.nota = ctx.message?.text;
    if (ctx.wizard.state.entryData.lancamento) {
      // Year already fetched, skip to season
      if (ctx.wizard.state.entryData.tipo === 'Série') {
        await ctx.reply('Qual a TEMPORADA? 📺 (Ex: 1, 2, 3...)');
        return ctx.wizard.selectStep(7);
      } else {
        // Skip season, go to platform
        return ctx.wizard.selectStep(7);
      }
    } else {
      await ctx.reply('Qual o ANO DE LANÇAMENTO? 📅', Markup.removeKeyboard());
      return ctx.wizard.next();
    }
  },
  async (ctx) => {
    ctx.wizard.state.entryData.lancamento = ctx.message?.text;
    if (ctx.wizard.state.entryData.tipo === 'Série') {
      await ctx.reply('Qual a TEMPORADA? 📺 (Ex: 1, 2, 3...)');
      return ctx.wizard.next();
    } else {
      // Se for Filme, pula a pergunta de temporada
      ctx.wizard.next();
      return ctx.wizard.steps[ctx.wizard.cursor](ctx);
    }
  },
  async (ctx) => {
    if (ctx.wizard.state.entryData.tipo === 'Série') {
      ctx.wizard.state.entryData.temporada = ctx.message?.text;
    }

    const plataformasSérie = ['Netflix', 'Max', 'Prime Video', 'Disney+', 'Apple TV+', 'Globoplay', 'Stremio', 'Mubi', 'Outro'];
    const plataformasFilme = ['Cinema', ...plataformasSérie];
    
    const botoes = ctx.wizard.state.entryData.tipo === 'Filme' ? plataformasFilme : plataformasSérie;
    
    // Divide os preenchimentos em linhas de 3 botões para ficar bonito no celular
    const tecladoMapeado = [];
    for (let i = 0; i < botoes.length; i += 3) {
      tecladoMapeado.push(botoes.slice(i, i + 3));
    }

    await ctx.reply('ONDE vocês viram? 🍿 (Escolha ou digite)', Markup.keyboard(tecladoMapeado).oneTime().resize());
    return ctx.wizard.next();
  },
  async (ctx) => {
    ctx.wizard.state.entryData.onde = ctx.message?.text;
    
    // Pega o mês atual automaticamente em português
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    ctx.wizard.state.entryData.mes = meses[new Date().getMonth()];
    
    const data = ctx.wizard.state.entryData;

    await ctx.reply('Salvando na planilha, aguarde... ⏳', Markup.removeKeyboard());

    try {
      await appendToSheet(data.tipo, data);
      
      let resumo = `✅ *${data.tipo} salvo com sucesso!*\n\n`;
      resumo += `*Nome:* ${data.nome}\n`;
      resumo += `*Origem:* ${data.pais}\n`;
      resumo += `*Nota:* ${data.nota}\n`;
      resumo += `*Lançamento:* ${data.lancamento}\n`;
      if (data.tipo === 'Série') resumo += `*Temporada:* ${data.temporada}\n`;
      resumo += `*Onde:* ${data.onde}\n`;
      resumo += `*Mês:* ${data.mes}`;

      await ctx.replyWithMarkdown(resumo);
    } catch (error) {
      console.error(error);
      await ctx.reply(`❌ Ocorreu um erro ao salvar na planilha: ${error.message}`);
    }

    return ctx.scene.leave();
  }
);

// Permite cancelar a qualquer momento durante os passos do wizard
entryWizard.command('cancelar', async (ctx) => {
  await ctx.reply('🚫 Inserção cancelada. Se quiser começar de novo, digite /adicionar');
  return ctx.scene.leave();
});
