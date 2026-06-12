import express from 'express';
import { config } from './config.js';
import { handleUssd } from './ussd.js';

const app = express();
app.use(express.urlencoded({ extended: false })); // aggregators POST form-encoded
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, network: config.network.name, testnet: config.network.testnet });
});

// USSD webhook (Africa's Talking format). Configure this URL in the AT dashboard.
app.post('/ussd', (req, res) => {
  const { sessionId, phoneNumber, text } = req.body as Record<string, string>;
  if (!phoneNumber) {
    res.status(400).send('END Missing phoneNumber');
    return;
  }
  try {
    const response = handleUssd({
      sessionId: sessionId ?? 'no-session',
      phoneNumber,
      text: text ?? '',
    });
    res.set('Content-Type', 'text/plain').send(response);
  } catch (e) {
    console.error('[ussd] error', e);
    res.set('Content-Type', 'text/plain').send('END Service error. Please try again later.');
  }
});

app.listen(config.port, () => {
  console.log(`Wayamesh USSD service on :${config.port} — ${config.network.name}${config.network.testnet ? ' (testnet)' : ''}`);
});
