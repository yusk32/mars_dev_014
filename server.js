const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 8080;
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function isWaypoint(value) {
  return value &&
    Number.isFinite(value.lat) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    Number.isFinite(value.lng) &&
    value.lng >= -180 &&
    value.lng <= 180;
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) {
      throw new Error('Request body is too large');
    }
  }
  return JSON.parse(body);
}

async function handleWaypoints(request, response) {
  if (request.method === 'GET') {
    const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    return sendJson(response, 200, { waypoints: data.waypoints });
  }

  if (request.method !== 'PUT') {
    response.setHeader('Allow', 'GET, PUT');
    return sendJson(response, 405, { error: 'Method not allowed' });
  }

  let payload;
  try {
    payload = await readRequestBody(request);
  } catch (error) {
    return sendJson(response, 400, { error: error.message === 'Request body is too large' ? error.message : 'Invalid JSON body' });
  }

  if (!payload || !isWaypoint(payload.a) || !isWaypoint(payload.b)) {
    return sendJson(response, 400, { error: 'Both A and B must have valid latitude and longitude values' });
  }

  const data = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  data.waypoints = {
    a: { lat: payload.a.lat, lng: payload.a.lng },
    b: { lat: payload.b.lat, lng: payload.b.lng }
  };

  const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryFile, DATA_FILE);
  return sendJson(response, 200, { waypoints: data.waypoints });
}

async function handleStaticFile(urlPath, response) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    response.writeHead(400);
    return response.end('Invalid URL path');
  }

  const requestedPath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, requestedPath);
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    return response.end('Forbidden');
  }

  let targetPath = filePath;
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      targetPath = path.join(targetPath, 'index.html');
    }
    const content = await fs.readFile(targetPath);
    const contentType = MIME_TYPES[path.extname(targetPath).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': contentType });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404);
      return response.end('Not found');
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
    if (requestUrl.pathname === '/api/waypoints') {
      await handleWaypoints(request, response);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }

    await handleStaticFile(requestUrl.pathname, response);
  } catch (error) {
    console.error('Request failed:', error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: 'Internal server error' });
    } else {
      response.destroy();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mars apps available at http://${HOST}:${PORT}/ and http://${HOST}:${PORT}/SerchClothes/`);
});
