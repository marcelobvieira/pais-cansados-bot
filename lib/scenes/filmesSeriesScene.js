import { Scenes, Markup } from 'telegraf';
import { appendToSheet } from '../sheets.js';
import { searchTMDB, getTMDBDetails, extractCountryAndYear } from '../tmdb.js';
import { identifyTitleFromImage, transcribeTitleFromAudio, normalizeCandidateTitle } from '../ai.js';
import { extractMediaFromMessage } from '../telegramMedia.js';

const TITLE_CONFIRMATION_KEYBOARD = Markup.keyboard([['Confirmar', 'Corrigir']]).oneTime().resize();

function getTitlePrompt(tipo) {
  return `Ótimo! Agora você pode enviar o NOME d${tipo === 'Filme' ? 'o filme' : 'a série'}, uma foto da capa/poster ou um áudio dizendo o nome.`;
}

function hasSupportedTitleInput(ctx) {
  const message = ctx.message || {};
  return Boolean(message.text || message.photo || message.voice || message.audio);
}

async function promptForTitleConfirmation(ctx, candidate) {
  await ctx.reply(`Entendi: ${candidate.title}\n\nEstá correto?`, TITLE_CONFIRMATION_KEYBOARD);
}

async function resolveTitleCandidate(ctx, tipo) {
  const message = ctx.message || {};

  if (message.text) {
    const title = normalizeCandidateTitle(message.text);
    return {
      title,
      confidence: title ? 1 : 0,
      source: 'text',
    };
  }

  const media = await extractMediaFromMessage(ctx);
  if (!media) {
    return null;
  }

  if (media.kind === 'photo') {
    return identifyTitleFromImage({
      fileUrl: media.fileUrl,
      mediaType: media.mediaType,
      tipo,
    });
  }

  if (media.kind === 'voice' || media.kind === 'audio') {
    return transcribeTitleFromAudio({
      fileUrl: media.fileUrl,
      mediaType: media.mediaType,
      tipo,
    });
  }

  return null;
}

async function askForManualTitle(ctx, tipo, message) {
  await ctx.reply(message || `Não consegui identificar ${tipo === 'Filme' ? 'o filme' : 'a série'}. Digite o nome manualmente.`, Markup.removeKeyboard());
}

async function runTmdbLookup(ctx) {
  await ctx.reply('🔍 Buscando informações no TMDB...', Markup.removeKeyboard());

  const tipo = ctx.wizard.state.entryData.tipo;
  const query = ctx.wizard.state.entryData.nome;
  const tmdbType = tipo === 'Filme' ? 'movie' : 'tv';

  try {
    const results = await searchTMDB(query, tmdbType);

    if (results.length === 0) {
      await ctx.reply('Nenhum resultado encontrado no TMDB. Digite o PAÍS DE ORIGEM manualmente: 🌍');
      return ctx.wizard.selectStep(5);
    }

    if (results.length === 1) {
      const details = await getTMDBDetails(results[0].id, tmdbType);
      const { country, year } = extractCountryAndYear(details, tmdbType);
      ctx.wizard.state.entryData.nome = details.title || details.name;
      ctx.wizard.state.entryData.pais = country || 'Desconhecido';
      ctx.wizard.state.entryData.lancamento = year || 'Desconhecido';
      await ctx.reply(`✅ Encontrei: ${details.title || details.name} (${year}) - ${country}\n\nQual a sua NOTA? ⭐`, Markup.keyboard([
        ['1', '2', '3', '4', '5']
      ]).oneTime().resize());
      return ctx.wizard.selectStep(6);
    }

    const options = results.slice(0, 5).map((result, index) =>
      `${index + 1}. ${result.title || result.name} (${(result.release_date || result.first_air_date)?.split('-')[0] || 'N/A'})`
    ).join('\n');

    await ctx.reply(`Encontrei várias opções:\n${options}\n\nDigite o número da opção correta (1-${Math.min(5, results.length)}), ou 0 para inserir manualmente:`, Markup.removeKeyboard());
    ctx.wizard.state.tmdbResults = results.slice(0, 5);
    return ctx.wizard.selectStep(4);
  } catch (error) {
    console.error('TMDB error:', error);
    await ctx.reply('Erro ao buscar no TMDB. Digite o PAÍS DE ORIGEM manualmente: 🌍');
    return ctx.wizard.selectStep(5);
  }
}

// Cena do Wizard para Filmes e Séries
export const entryWizard = new Scenes.WizardScene(
  'ENTRY_WIZARD',
  async (ctx) => {
    await ctx.reply('🎬 O que você terminou de assistir?', Markup.keyboard(['Filme', 'Série']).oneTime().resize());
    ctx.wizard.state.entryData = {};
    ctx.wizard.state.pendingTitle = null;
    ctx.wizard.state.tmdbResults = null;
    ctx.wizard.state.awaitingManualTitle = false;
    ctx.wizard.state.awaitingManualCorrection = false;
    return ctx.wizard.next();
  },
  async (ctx) => {
    const tipo = ctx.message?.text;
    if (tipo !== 'Filme' && tipo !== 'Série') {
      await ctx.reply('Por favor, escolha Filme ou Série usando os botões da tela.');
      return;
    }
    ctx.wizard.state.entryData.tipo = tipo;
    await ctx.reply(getTitlePrompt(tipo), Markup.removeKeyboard());
    return ctx.wizard.next();
  },
  async (ctx) => {
    const tipo = ctx.wizard.state.entryData.tipo;

    if (!hasSupportedTitleInput(ctx)) {
      await ctx.reply('Envie um texto, uma foto da capa/poster ou um áudio com o nome.');
      return;
    }

    try {
      if (ctx.message?.photo || ctx.message?.voice || ctx.message?.audio) {
        await ctx.reply('🧠 Interpretando sua mídia...');
      }

      const candidate = await resolveTitleCandidate(ctx, tipo);
      if (!candidate?.title || candidate.confidence < 0.5) {
        ctx.wizard.state.awaitingManualTitle = true;
        await askForManualTitle(ctx, tipo);
        return;
      }

      ctx.wizard.state.pendingTitle = candidate;
      ctx.wizard.state.awaitingManualTitle = false;
      await promptForTitleConfirmation(ctx, candidate);
      return ctx.wizard.next();
    } catch (error) {
      console.error('AI resolution error:', error);
      ctx.wizard.state.awaitingManualTitle = true;
      await askForManualTitle(ctx, tipo, 'Não consegui interpretar essa mídia agora. Digite o nome manualmente.');
      return;
    }
  },
  async (ctx) => {
    const tipo = ctx.wizard.state.entryData.tipo;
    const input = ctx.message?.text;

    if (ctx.wizard.state.awaitingManualCorrection || ctx.wizard.state.awaitingManualTitle) {
      const manualTitle = normalizeCandidateTitle(input);
      if (!manualTitle) {
        await askForManualTitle(ctx, tipo, 'Digite um nome válido para continuar.');
        return;
      }

      const candidate = {
        title: manualTitle,
        confidence: 1,
        source: 'text',
      };
      ctx.wizard.state.pendingTitle = candidate;
      ctx.wizard.state.awaitingManualCorrection = false;
      ctx.wizard.state.awaitingManualTitle = false;
      await promptForTitleConfirmation(ctx, candidate);
      return;
    }

    if (input === 'Corrigir') {
      ctx.wizard.state.awaitingManualCorrection = true;
      await askForManualTitle(ctx, tipo, 'Perfeito. Digite o nome correto para eu confirmar antes de buscar no TMDB.');
      return;
    }

    if (input !== 'Confirmar') {
      await ctx.reply('Escolha Confirmar ou Corrigir para continuar.');
      return;
    }

    if (!ctx.wizard.state.pendingTitle?.title) {
      ctx.wizard.state.awaitingManualCorrection = true;
      await askForManualTitle(ctx, tipo, 'Digite o nome para eu confirmar antes de buscar no TMDB.');
      return;
    }

    ctx.wizard.state.entryData.nome = ctx.wizard.state.pendingTitle?.title;
    return runTmdbLookup(ctx);
  },
  async (ctx) => {
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
        return ctx.wizard.selectStep(6); // Skip to rating step
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
        return ctx.wizard.selectStep(8);
      } else {
        // Skip season and year, go directly to platform
        const plataformasFilme = ['Cinema', 'Netflix', 'Max', 'Prime Video', 'Disney+', 'Apple TV+', 'Globoplay', 'Stremio', 'Mubi', 'Outro'];
        const tecladoMapeado = [];
        for (let i = 0; i < plataformasFilme.length; i += 3) {
          tecladoMapeado.push(plataformasFilme.slice(i, i + 3));
        }
        await ctx.reply('ONDE vocês viram? 🍿 (Escolha ou digite)', Markup.keyboard(tecladoMapeado).oneTime().resize());
        return ctx.wizard.selectStep(9);
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
