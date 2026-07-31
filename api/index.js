import { VERSION } from './version-number.js';

export default function handler(_req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(`Hello World\nversion ${VERSION}`);
}
