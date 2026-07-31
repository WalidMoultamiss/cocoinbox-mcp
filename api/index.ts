import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send('Hello World');
}
