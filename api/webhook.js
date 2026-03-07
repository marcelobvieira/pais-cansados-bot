const bot = require('../lib/bot');

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      // Passa a requisição (o envio do Telegram) para o Telegraf processar
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('Webhook do bot está ativo e aguardando chamadas do Telegram! 🤖');
    }
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).send('Erro interno do servidor');
  }
};
