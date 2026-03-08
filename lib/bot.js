import { Telegraf, session, Scenes } from 'telegraf';
import { entryWizard } from './scenes/filmesSeriesScene.js';

// Inicializa o bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Middleware Global de Segurança: Bloqueia qualquer ID de Telegram que não estiver no .env
bot.use((ctx, next) => {
  if (!process.env.ALLOWED_USERS) {
    console.warn("⚠️ Variável ALLOWED_USERS não configurada no .env. Todos têm acesso ao bot.");
    return next();
  }
  
  const allowedIds = process.env.ALLOWED_USERS.split(',').map(id => id.trim());
  const userId = String(ctx.from?.id);
  
  if (!allowedIds.includes(userId)) {
    return ctx.reply('⛔ Acesso Restrito. Seu ID do Telegram não tem permissão para usar este bot. Contate o administrador.');
  }

  return next();
});

// Configuração das Cenas
const stage = new Scenes.Stage([entryWizard]);

// Sessão em memória: mantemos o estado da conversa enquanto a function na Vercel estiver "quente"
bot.use(session());
bot.use(stage.middleware());

bot.command('adicionar', (ctx) => ctx.scene.enter('ENTRY_WIZARD'));
bot.start((ctx) => ctx.reply('Olá! Sou o bot da família para registrar filmes e séries. 🍿\nDigite /adicionar para começar.'));

export default bot;
