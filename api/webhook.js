import bot from '../lib/bot.js';

export default async function (req, res) {
  try {
    const { webhook_secret } = req.query;

    if (process.env.WEBHOOK_SECRET && webhook_secret !== process.env.WEBHOOK_SECRET) {
      return res.status(403).send('Forbidden: Invalid Webhook Secret');
    }

    if (req.method === 'POST') {
      await bot.handleUpdate(req.body, res);
    } else {
      res.status(200).send('Webhook do bot está ativo e seguro! 🤖');
    }
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).send('Erro interno do servidor');
  }
};
